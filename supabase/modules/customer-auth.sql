-- Customer mailbox enrollment is private, opt-in and separate from staff access.
-- Auth email tokens, passwords and bearer tokens never enter these tables.
begin;
create schema if not exists wow_customer;
revoke all on schema wow_customer from public, anon, authenticated;
grant usage on schema wow_customer to service_role;
alter default privileges in schema wow_customer revoke execute on functions from public, anon, authenticated;

create table if not exists wow_customer.settings (
 workspace_id uuid primary key references public.wow_workspaces(id),
 registration_enabled boolean not null default false,
 recovery_enabled boolean not null default false,
 revision bigint not null default 1 check(revision>0),
 updated_at timestamptz not null default now()
);
create table if not exists wow_customer.profiles (
 account_id uuid primary key references public.wow_accounts(id),
 workspace_id uuid not null references public.wow_workspaces(id),
 company text not null check(length(company)<=100),
 country text not null check(country ~ '^[A-Z]{2}$'),
 calling_code text not null check(calling_code ~ '^\+[1-9][0-9]{0,3}$'),
 phone text not null check(phone ~ '^[0-9]{4,14}$'),
 created_at timestamptz not null default now()
);
create index if not exists wow_customer_profiles_workspace_idx on wow_customer.profiles(workspace_id,account_id);
-- A mailbox-recoverable principal never becomes a managed staff/owner identity.
-- This permanent boundary covers app updates and direct Dashboard role edits,
-- including changes while a provider password request is still in flight.
create or replace function wow_customer.keep_customer_principal() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.role<>'customer' and exists(select from wow_customer.profiles where account_id=new.id) then
  raise exception using message='CUSTOMER_PRINCIPAL_ROLE_FIXED',errcode='P0001';
 end if;
 return new;
end $$;
drop trigger if exists wow_customer_principal_role on public.wow_accounts;
create trigger wow_customer_principal_role before update of role on public.wow_accounts
 for each row execute function wow_customer.keep_customer_principal();
create table if not exists wow_customer.requests (
 id uuid primary key, workspace_id uuid not null references public.wow_workspaces(id),
 kind text not null check(kind in ('register','recover')),
 email text not null check(length(email) between 5 and 254), email_hash text not null check(email_hash ~ '^[a-f0-9]{64}$'),
 origin text not null check(length(origin)<=250), profile jsonb not null default '{}',
 challenge_hash text not null check(challenge_hash ~ '^[a-f0-9]{64}$'),
 account_id uuid references public.wow_accounts(id),
 state text not null default 'requested' check(state in ('requested','verified','complete','aborted')),
 delivery text not null default 'pending' check(delivery in ('pending','accepted','failed')),
 attempts integer not null default 0 check(attempts between 0 and 12),
 lease uuid, verified_user uuid, verified_session uuid,
 expires_at timestamptz not null default now()+interval '1 hour',
 created_at timestamptz not null default now(), completed_at timestamptz,
 check(octet_length(profile::text)<=4096)
);
-- Earlier unbound requests cannot be upgraded into valid proofs. Retain their
-- audit metadata, but require a newly issued per-message bound link.
alter table wow_customer.requests add column if not exists challenge_hash text check(challenge_hash ~ '^[a-f0-9]{64}$');
update wow_customer.requests set challenge_hash=repeat('0',64),state=case when state='complete' then state else 'aborted' end where challenge_hash is null;
alter table wow_customer.requests alter column challenge_hash set not null;
create index if not exists wow_customer_requests_workspace_idx on wow_customer.requests(workspace_id,created_at);
create index if not exists wow_customer_requests_expiry_idx on wow_customer.requests(expires_at);
create table if not exists wow_customer.limits (
 workspace_id uuid not null references public.wow_workspaces(id),
 bucket text not null check(length(bucket)<=90), window_start timestamptz not null default now(),
 attempts integer not null default 0 check(attempts>=0), primary key(workspace_id,bucket)
);
create index if not exists wow_customer_limits_age_idx on wow_customer.limits(window_start);

-- Internal communications resolve a recipient only after checking that caller's
-- workspace and order. A stored phone is contact information, not SMS proof.
create or replace function wow_customer.contact(account uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('email',a.login_email,'phone',p.calling_code||p.phone,'company',p.company,'name',a.name)
 from public.wow_accounts a join wow_customer.profiles p on p.account_id=a.id
 join auth.users u on u.id=a.id and lower(u.email)=a.login_email
 where a.id=account and a.role='customer' and a.status='active' and (a.expires_at is null or a.expires_at>now())
  and u.email_confirmed_at is not null and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
  and not coalesce(u.is_anonymous,false) and a.login_email not like '%@wow.invalid'
$$;

-- True/false instead of an exception keeps a refused attempt's rate counter.
create or replace function wow_customer.allow_request(wid uuid, bucket_name text, maximum integer, window_seconds integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare row_value wow_customer.limits;
begin
 insert into wow_customer.limits(workspace_id,bucket) values(wid,bucket_name) on conflict do nothing;
 select * into row_value from wow_customer.limits where workspace_id=wid and bucket=bucket_name for update;
 if row_value.window_start<=now()-make_interval(secs=>window_seconds) then
  row_value.window_start=now();row_value.attempts=0;
 end if;
 update wow_customer.limits set attempts=least(maximum+1,row_value.attempts+1),window_start=row_value.window_start
  where workspace_id=wid and bucket=bucket_name;
 return row_value.attempts<maximum;
end $$;

create or replace function wow_customer.prune() returns integer
language plpgsql security definer set search_path='' as $$
declare removed integer;
begin
 delete from wow_customer.requests where id in(select id from wow_customer.requests where expires_at<now()-interval '7 days' order by expires_at limit 500);
 get diagnostics removed=row_count;
 delete from wow_customer.limits where (workspace_id,bucket) in(select workspace_id,bucket from wow_customer.limits where window_start<now()-interval '2 days' order by window_start limit 500);
 return removed;
end $$;

create or replace function public.wow_customer_auth_service(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 wid uuid; uid uuid; sid uuid; request_id uuid; r wow_customer.requests; cfg wow_customer.settings;
 a public.wow_accounts; context jsonb; mail text; permitted boolean; detail jsonb; chosen text;
begin
 if jsonb_typeof(p_data)<>'object' then raise exception using message='INVALID_REQUEST',errcode='P0001';end if;
 if p_action in ('customerAuth.snapshot','customerAuth.configure','customerAuth.profile') then
  uid=(p_data->>'userId')::uuid;sid=(p_data->>'sessionId')::uuid;
  context=public.wow_actor(uid,sid,null,p_action='customerAuth.configure',p_action='customerAuth.configure');
  wid=(context->>'workspaceId')::uuid;
  if p_action='customerAuth.profile' then
   uid=coalesce((p_data->>'accountId')::uuid,uid);
   if uid<>(p_data->>'userId')::uuid and context->'account'->>'role'<>'owner' then raise exception using message='ACCESS_DENIED',errcode='P0001';end if;
   select jsonb_build_object('accountId',c.id,'email',c.login_email,'company',p.company,'country',p.country,'callingCode',p.calling_code,'phone',p.phone)
    into detail from public.wow_accounts c join wow_customer.profiles p on p.account_id=c.id
    where c.id=uid and c.workspace_id=wid and c.role='customer';
   return jsonb_build_object('profile',detail);
  end if;
  if context->'account'->>'role'<>'owner' then raise exception using message='ACCESS_DENIED',errcode='P0001';end if;
  insert into wow_customer.settings(workspace_id) values(wid) on conflict do nothing;
  select * into cfg from wow_customer.settings where workspace_id=wid for update;
  if p_action='customerAuth.configure' then
   if (p_data->>'revision')::bigint is distinct from cfg.revision then raise exception using message='IDENTITY_CONFLICT',errcode='P0001';end if;
   if jsonb_typeof(p_data->'registrationEnabled')<>'boolean' or jsonb_typeof(p_data->'recoveryEnabled')<>'boolean' then raise exception using message='INVALID_CUSTOMER_SETTING',errcode='P0001';end if;
   update wow_customer.settings set registration_enabled=(p_data->>'registrationEnabled')::boolean,recovery_enabled=(p_data->>'recoveryEnabled')::boolean,
    revision=revision+1,updated_at=now() where workspace_id=wid returning * into cfg;
   insert into public.wow_audit(workspace_id,actor_id,action,target_type,details) values(wid,uid,'customerAuth.configure','customer-auth',jsonb_build_object('registrationEnabled',cfg.registration_enabled,'recoveryEnabled',cfg.recovery_enabled));
  end if;
  perform wow_customer.prune();
  return jsonb_build_object('workspaceId',wid,'settings',jsonb_build_object('registrationEnabled',cfg.registration_enabled,'recoveryEnabled',cfg.recovery_enabled,'revision',cfg.revision),
   'requests24h',(select count(*) from wow_customer.requests where workspace_id=wid and created_at>now()-interval '24 hours'),
   'accepted24h',(select count(*) from wow_customer.requests where workspace_id=wid and created_at>now()-interval '24 hours' and delivery='accepted'),
   'failed24h',(select count(*) from wow_customer.requests where workspace_id=wid and created_at>now()-interval '24 hours' and delivery='failed'),
   'completed24h',(select count(*) from wow_customer.requests where workspace_id=wid and completed_at>now()-interval '24 hours'));
 end if;

 wid=(p_data->>'workspaceId')::uuid;
 if wid is null or not exists(select from public.wow_workspaces where id=wid and status='active') then
  return jsonb_build_object('allowed',false,'registrationEnabled',false,'recoveryEnabled',false);
 end if;
 -- Every public mutation shares the workspace lock with role changes.
 perform 1 from public.wow_workspaces where id=wid for update;
 select * into cfg from wow_customer.settings where workspace_id=wid;
 if p_action='options' then return jsonb_build_object('registrationEnabled',coalesce(cfg.registration_enabled,false),'recoveryEnabled',coalesce(cfg.recovery_enabled,false));end if;
 if p_action='begin' then
  perform wow_customer.prune();
  if p_data->>'kind' not in ('register','recover') then raise exception using message='INVALID_CUSTOMER_REQUEST',errcode='P0001';end if;
  permitted=case when p_data->>'kind'='register' then cfg.registration_enabled else cfg.recovery_enabled end;
  if permitted is distinct from true then return jsonb_build_object('allowed',false);end if;
  -- One fixed workspace bucket limits distinct-address flooding and stored rows.
  if not wow_customer.allow_request(wid,'requests',90,3600) then return jsonb_build_object('allowed',false,'limited',true);end if;
  if not wow_customer.allow_request(wid,'mail:'||(p_data->>'emailHash'),3,3600) then return jsonb_build_object('allowed',false);end if;
  request_id=(p_data->>'requestId')::uuid;mail=p_data->>'email';
  if request_id is null or length(mail) not between 5 and 254 or mail<>lower(btrim(mail)) or p_data->>'emailHash' !~ '^[a-f0-9]{64}$'
   or coalesce(p_data->>'challengeHash','') !~ '^[a-f0-9]{64}$' then raise exception using message='INVALID_CUSTOMER_REQUEST',errcode='P0001';end if;
  if exists(select from wow_customer.requests where id=request_id) then return jsonb_build_object('allowed',false);end if;
  select * into a from public.wow_accounts where lower(login_email)=mail;
  if p_data->>'kind'='register' and a.id is not null then return jsonb_build_object('allowed',false);end if;
  if p_data->>'kind'='recover' and (a.id is null or a.workspace_id<>wid or a.role<>'customer' or a.status<>'active' or a.expires_at<=now()
    or not exists(select from wow_customer.profiles where account_id=a.id)) then return jsonb_build_object('allowed',false);end if;
  insert into wow_customer.requests(id,workspace_id,kind,email,email_hash,origin,profile,account_id,challenge_hash)
   values(request_id,wid,p_data->>'kind',mail,p_data->>'emailHash',p_data->>'origin',coalesce(p_data->'profile','{}'),a.id,p_data->>'challengeHash');
  return jsonb_build_object('allowed',true);
 end if;

 select * into r from wow_customer.requests where id=(p_data->>'requestId')::uuid and workspace_id=wid for update;
 if r.id is null or r.expires_at<=now() or r.origin is distinct from p_data->>'origin' then return jsonb_build_object('allowed',false);end if;
 permitted=case when r.kind='register' then cfg.registration_enabled else cfg.recovery_enabled end;
 if permitted is distinct from true then return jsonb_build_object('allowed',false);end if;
 if p_action='delivery' then
  if r.state='requested' and p_data->>'delivery' in ('accepted','failed') then update wow_customer.requests set delivery=p_data->>'delivery' where id=r.id;end if;
  return '{}';
 end if;
 if p_action='inspect' then
  if r.state<>'requested' or r.attempts>=12 or not wow_customer.allow_request(wid,'verify',120,900) then return jsonb_build_object('allowed',false);end if;
  update wow_customer.requests set attempts=attempts+1 where id=r.id;
  if r.challenge_hash is distinct from p_data->>'challengeHash' then return jsonb_build_object('allowed',false);end if;
  return jsonb_build_object('allowed',true,'kind',r.kind,'email',r.email);
 end if;
 -- Recheck independently at claim/finish, after the one-time Auth proof call.
 -- An Auth proof for the same mailbox cannot authorize another request's scope.
 if r.challenge_hash is distinct from p_data->>'challengeHash' then return jsonb_build_object('allowed',false);end if;
 uid=(p_data->>'userId')::uuid;sid=(p_data->>'sessionId')::uuid;
 if not exists(select from auth.users u join auth.sessions s on s.user_id=u.id where u.id=uid and s.id=sid
  and lower(u.email)=r.email and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false) and u.deleted_at is null
  and (u.banned_until is null or u.banned_until<=now()) and (s.not_after is null or s.not_after>now())) then return jsonb_build_object('allowed',false);end if;
 select * into a from public.wow_accounts where id=uid for update;
 if r.kind='register' and (a.id is not null or exists(select from public.wow_accounts where lower(login_email)=r.email)) then return jsonb_build_object('allowed',false);end if;
 if r.kind='recover' and (a.id is distinct from r.account_id or a.workspace_id<>wid or a.role<>'customer' or a.status<>'active' or a.expires_at<=now()) then return jsonb_build_object('allowed',false);end if;
 if p_action='claim' then
  if r.state<>'requested' then return jsonb_build_object('allowed',false);end if;
  update wow_customer.requests set state='verified',lease=(p_data->>'lease')::uuid,verified_user=uid,verified_session=sid where id=r.id;
  if r.kind='recover' then
   -- Revoke before the non-transactional provider password change, so a lost
   -- provider acknowledgement cannot leave old application sessions usable.
   update public.wow_accounts set session_version=session_version+1 where id=uid;
   update public.wow_sessions set closed_at=now() where account_id=uid and closed_at is null;
  end if;
  return jsonb_build_object('allowed',true);
 end if;
 if p_action='finish' then
  if r.state<>'verified' or r.lease is distinct from (p_data->>'lease')::uuid or r.verified_user is distinct from uid or r.verified_session is distinct from sid then return jsonb_build_object('allowed',false);end if;
  if r.kind='register' then
   chosen=r.profile->>'username';
   if chosen is null or chosen !~ '^[[:alnum:]_.@-]{3,64}$' or chosen<>lower(btrim(chosen)) or length(r.profile->>'name') not between 1 and 100 then raise exception using message='INVALID_CUSTOMER_PROFILE',errcode='P0001';end if;
   insert into public.wow_accounts(id,workspace_id,login_email,username,name,role,permissions,department)
    values(uid,wid,r.email,chosen,r.profile->>'name','customer',array['gallery.view','myorders.view','myorders.edit','chat.view','chat.edit','files.view','files.edit'],left(coalesce(r.profile->>'company',''),80));
   insert into wow_customer.profiles(account_id,workspace_id,company,country,calling_code,phone)
    values(uid,wid,coalesce(r.profile->>'company',''),r.profile->>'country',r.profile->>'callingCode',r.profile->>'phone');
  else
   chosen=a.username;
   update public.wow_accounts set session_version=session_version+1 where id=uid;
   update public.wow_sessions set closed_at=now() where account_id=uid and closed_at is null;
  end if;
  update wow_customer.requests set state='complete',lease=null,completed_at=now() where id=r.id;
  insert into public.wow_audit(workspace_id,actor_id,target_id,action) values(wid,uid,uid::text,case when r.kind='register' then 'customer_registered' else 'customer_password_recovered' end);
  return jsonb_build_object('allowed',true,'username',chosen);
 end if;
 raise exception using message='UNKNOWN_ACTION',errcode='P0001';
exception when unique_violation then raise exception using message='CUSTOMER_REGISTRATION_CONFLICT',errcode='P0001';
end $$;

do $$ declare table_name text;begin
 foreach table_name in array array['settings','profiles','requests','limits'] loop
  execute format('alter table wow_customer.%I enable row level security',table_name);
  execute format('revoke all on table wow_customer.%I from public,anon,authenticated',table_name);
  execute format('grant all on table wow_customer.%I to service_role',table_name);
 end loop;
end $$;
revoke all on all functions in schema wow_customer from public,anon,authenticated;
revoke all on function public.wow_customer_auth_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.wow_customer_auth_service(text,jsonb) to service_role;
select cron.schedule('wow-customer-auth-prune','17 * * * *','select wow_customer.prune()');
commit;
