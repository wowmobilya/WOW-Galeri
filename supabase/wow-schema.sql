-- WOW backend v1. Project-agnostic additive migration; existing apps are untouched.
-- Apply through an authorized management connection. Never ship service_role
-- credentials or setup token hashes to the app. The Edge function is the API.
begin;

create table if not exists public.wow_workspaces (
  id uuid primary key default gen_random_uuid(), name text not null check (length(name) between 1 and 100),
  status text not null default 'active' check (status in ('active','suspended')),
  control_revision bigint not null default 1 check (control_revision > 0),
  data_revision bigint not null default 0 check (data_revision >= 0),
  created_at timestamptz not null default now()
);
create table if not exists public.wow_setup_claims (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  workspace_id uuid not null references public.wow_workspaces(id), expires_at timestamptz not null,
  used_at timestamptz, used_by uuid, created_at timestamptz not null default now(),
  check ((used_at is null) = (used_by is null))
);
create table if not exists public.wow_permission_catalog (
  permission text primary key, owner_only boolean not null default false
);
insert into public.wow_permission_catalog(permission,owner_only)
select section || '.' || action, section in ('settings','accounts','data','server') from (values
 ('customers',array['view','edit','delete']),
 ('products',array['view','edit','delete','print']),
 ('invoices',array['view','edit','delete','print','export']),
 ('manufacturing',array['view','edit','print']),
 ('tasks',array['view','edit','delete']),
 ('labels',array['view','print']),
 ('materials',array['view','edit']),
 ('costs',array['view','edit']),
 ('purchasing',array['view','edit','print','export']),
 ('payments',array['view','edit','delete','print','export']),
 ('reports',array['view']),
 ('archives',array['view','edit']),
 ('history',array['view','edit']),
 ('search',array['view']),
 ('review',array['view']),
 ('gallery',array['view','edit','delete','print','export']),
 ('orders',array['view','edit','delete','print','export']),
 ('myorders',array['view','edit','print','export']),
 ('chat',array['view','edit','delete']),
 ('communications',array['view','edit','delete','export']),
 ('files',array['view','edit','delete','export']),
 ('finance',array['view','edit','delete','print','export']),
 ('payroll',array['view','edit','delete','print','export']),
 ('metals',array['view','edit','delete','print','export']),
 ('assistant',array['view']),
 ('server',array['view','edit']),
 ('settings',array['view','edit']),
 ('accounts',array['view','edit','delete']),
 ('data',array['view','edit','delete','export'])
) as sections(section,actions) cross join lateral unnest(actions) as action
on conflict (permission) do update set owner_only=excluded.owner_only;

create table if not exists public.wow_accounts (
  id uuid primary key references auth.users(id) on delete restrict,
  workspace_id uuid not null references public.wow_workspaces(id),
  login_email text not null unique, username text not null check (length(username) between 3 and 64 and username=lower(btrim(username))),
  name text not null check (length(name) between 1 and 100),
  role text not null,
  permissions text[] not null default '{}',
  department text not null default '' check (length(department)<=80), note text not null default '' check(length(note)<=1000),
  status text not null default 'active' check (status in ('active','suspended','revoked','deleted')),
  session_version bigint not null default 1 check(session_version>0),
  expires_at timestamptz, deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(workspace_id,username), check (role<>'owner' or expires_at is null)
);
-- Existing installations have the original inline role check. Validate its replacement
-- before retiring it so all prior memberships remain valid during the upgrade.
do $$
begin
  if not exists(select from pg_constraint where conrelid='public.wow_accounts'::regclass and conname='wow_accounts_supported_role') then
    alter table public.wow_accounts add constraint wow_accounts_supported_role
      check (role in ('owner','manager','sales','carpentry','assembly','warehouse','customer','custom'));
  end if;
end $$;
alter table public.wow_accounts drop constraint if exists wow_accounts_role_check;
create index if not exists wow_accounts_workspace_status_idx on public.wow_accounts(workspace_id,status,role);
create table if not exists public.wow_sessions (
  session_id uuid primary key, account_id uuid not null references public.wow_accounts(id),
  session_version bigint not null check(session_version>0), started_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(), closed_at timestamptz
);
create index if not exists wow_sessions_account_idx on public.wow_sessions(account_id) where closed_at is null;
create table if not exists public.wow_login_limits (
  workspace_id uuid not null references public.wow_workspaces(id), bucket text not null,
  account_id uuid references public.wow_accounts(id), attempts integer not null default 0,
  window_start timestamptz not null default now(), last_attempt_id uuid not null default gen_random_uuid(),
  primary key(workspace_id,bucket), unique(last_attempt_id)
);
create sequence if not exists public.wow_change_sequence as bigint;
create table if not exists public.wow_records (
  workspace_id uuid not null references public.wow_workspaces(id),
  store text not null check(store in ('companies','products','invoices','payments','settings','media')),
  record_id jsonb not null check(jsonb_typeof(record_id) in ('string','number')),
  payload jsonb, revision bigint not null check(revision>0),
  change_id bigint not null default nextval('public.wow_change_sequence'), deleted_at timestamptz,
  updated_at timestamptz not null default now(), updated_by uuid not null references public.wow_accounts(id),
  primary key(workspace_id,store,record_id),
  check ((deleted_at is not null and payload is null) or (deleted_at is null and jsonb_typeof(payload)='object' and payload->'id'=record_id)),
  check (payload is null or octet_length(payload::text)<=1572864)
);
create index if not exists wow_records_changes_idx on public.wow_records(workspace_id,change_id);
create index if not exists wow_records_product_key_idx on public.wow_records(workspace_id,(record_id#>>'{}')) where store='products';
create unique index if not exists wow_records_media_key_idx on public.wow_records(workspace_id,(record_id#>>'{}')) where store='media';
create unique index if not exists wow_records_invoice_number_idx on public.wow_records(workspace_id,lower(btrim(payload->>'invNo')))
where store='invoices' and deleted_at is null and coalesce(btrim(payload->>'invNo'),'')<>'';
create table if not exists public.wow_batches (
  workspace_id uuid not null references public.wow_workspaces(id), account_id uuid not null references public.wow_accounts(id),
  batch_id text not null check(length(batch_id) between 8 and 120), device_id text not null check(length(device_id) between 1 and 120),
  request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'), session_version bigint not null,
  response jsonb not null, created_at timestamptz not null default now(),
  primary key(workspace_id,account_id,batch_id)
);
create table if not exists public.wow_media_uploads (
  workspace_id uuid not null references public.wow_workspaces(id), account_id uuid not null references public.wow_accounts(id),
  record_id jsonb not null, storage_path text primary key,
  content_type text not null, size bigint not null check(size between 1 and 8388608),
  ready boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists wow_media_uploads_account_idx on public.wow_media_uploads(account_id,created_at);
create table if not exists public.wow_media_links (
  workspace_id uuid not null references public.wow_workspaces(id), media_key text not null,
  store text not null, record_id jsonb not null,
  primary key(workspace_id,media_key,store,record_id),
  foreign key(workspace_id,store,record_id) references public.wow_records(workspace_id,store,record_id) on delete cascade
);
create index if not exists wow_media_links_record_idx on public.wow_media_links(workspace_id,store,record_id);
create table if not exists public.wow_audit (
  id bigint generated always as identity primary key, workspace_id uuid not null references public.wow_workspaces(id),
  actor_id uuid references public.wow_accounts(id), target_id text, target_type text not null default 'account',
  action text not null, source text not null default 'server' check(source in ('server','client')),
  reason text not null default '', details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index if not exists wow_audit_workspace_idx on public.wow_audit(workspace_id,id desc);

create or replace function public.wow_profile(a public.wow_accounts) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',a.id,'name',a.name,'username',a.username,'role',a.role,'permissions',to_jsonb(a.permissions),
 'department',a.department,'note',a.note,'status',a.status,'sessionVersion',a.session_version,
 'expiresAt',a.expires_at,'deletedAt',a.deleted_at,'createdAt',a.created_at,'updatedAt',a.updated_at)
$$;
create or replace function public.wow_record(r public.wow_records) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('store',r.store,'id',r.record_id,'revision',r.revision,'deleted',r.deleted_at is not null,'value',r.payload)
$$;

create or replace function public.wow_guard_account() returns trigger language plpgsql security definer set search_path='' as $$
declare p text;
begin
  if tg_op='UPDATE' then
    if new.id<>old.id or new.workspace_id<>old.workspace_id or new.login_email<>old.login_email then
      raise exception using message='IDENTITY_MOVE_DENIED',errcode='P0001';
    end if;
    if new.session_version<old.session_version then raise exception using message='INVALID_SESSION_VERSION',errcode='P0001'; end if;
    -- Dashboard edits must revoke prepared writes just as app edits do.
    if new.role is distinct from old.role or new.permissions is distinct from old.permissions or
       new.status is distinct from old.status or new.expires_at is distinct from old.expires_at then
      new.session_version=greatest(new.session_version,old.session_version+1);
    end if;
    new.updated_at=now();
  end if;
  if tg_op<>'DELETE' then
    if new.role='customer' and not (new.permissions <@ array[
      'gallery.view','gallery.export','myorders.view','myorders.edit','myorders.print','myorders.export',
      'chat.view','chat.edit','chat.delete','files.view','files.edit','files.delete','files.export'
    ]) then raise exception using message='INVALID_PERMISSIONS',errcode='P0001'; end if;
    foreach p in array new.permissions loop
      if not exists(select 1 from public.wow_permission_catalog k where k.permission=p and (new.role='owner' or not k.owner_only)) or
        (new.role<>'owner' and not (split_part(p,'.',1)||'.view'=any(new.permissions))) then
        raise exception using message='INVALID_PERMISSIONS',errcode='P0001';
      end if;
    end loop;
  end if;
  if tg_op in ('UPDATE','DELETE') and old.role='owner' and old.status='active' then
    perform 1 from public.wow_workspaces w where w.id=old.workspace_id for update;
    if (tg_op='DELETE' or new.role<>'owner' or new.status<>'active' or new.workspace_id<>old.workspace_id) and
      not exists(select 1 from public.wow_accounts a where a.workspace_id=old.workspace_id and a.id<>old.id and a.role='owner' and a.status='active') then
      raise exception using message='LAST_OWNER',errcode='P0001';
    end if;
  end if;
  update public.wow_workspaces set control_revision=control_revision+1
    where id=case when tg_op='DELETE' then old.workspace_id else new.workspace_id end;
  return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists wow_accounts_guard on public.wow_accounts;
create trigger wow_accounts_guard before insert or update or delete on public.wow_accounts for each row execute function public.wow_guard_account();

-- Shared transaction authorization. The session id is taken from a token that
-- Edge verified with Auth getUser, never from the incoming JSON body.
create or replace function public.wow_actor(p_user uuid,p_session uuid,p_version bigint default null,p_touch boolean default false,p_lock boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.wow_accounts; s public.wow_sessions; w public.wow_workspaces;
begin
  if not exists(select 1 from auth.sessions x join auth.users u on u.id=x.user_id
    where x.id=p_session and x.user_id=p_user and (x.not_after is null or x.not_after>now())
    and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and not coalesce(u.is_anonymous,false)) then
    raise exception using message='AUTH_REQUIRED',errcode='P0001';
  end if;
  select * into a from public.wow_accounts where id=p_user;
  if a.id is null then raise exception using message='ACCOUNT_UNAVAILABLE',errcode='P0001'; end if;
  if p_lock then select * into w from public.wow_workspaces where id=a.workspace_id for update;
  else select * into w from public.wow_workspaces where id=a.workspace_id for share; end if;
  select * into a from public.wow_accounts where id=p_user for share;
  if w.status<>'active' or a.status<>'active' or (a.expires_at is not null and a.expires_at<=now()) then
    raise exception using message='ACCOUNT_UNAVAILABLE',errcode='P0001';
  end if;
  select * into s from public.wow_sessions where session_id=p_session and account_id=p_user for update;
  if s.session_id is null or s.closed_at is not null or s.session_version<>a.session_version or
    (p_version is not null and p_version<>a.session_version) then raise exception using message='SESSION_REVOKED',errcode='P0001'; end if;
  if a.role<>'owner' and (s.started_at<=now()-interval '8 hours' or s.last_active_at<=now()-interval '30 minutes') then
    raise exception using message='SESSION_EXPIRED',errcode='P0001';
  end if;
  if p_touch then update public.wow_sessions set last_active_at=now() where session_id=p_session; end if;
  return jsonb_build_object('workspaceId',w.id,'account',public.wow_profile(a),'revision',w.control_revision,'dataRevision',w.data_revision);
end $$;

create or replace function public.wow_identity(p_user uuid,p_context jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare accounts jsonb; audit jsonb; wid uuid=(p_context->>'workspaceId')::uuid; is_owner boolean=p_context->'account'->>'role'='owner';
begin
  select coalesce(jsonb_agg(public.wow_profile(a) order by a.created_at,a.id),'[]') into accounts
  from public.wow_accounts a where a.workspace_id=wid and (is_owner or a.id=p_user);
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'actorId',e.actor_id,'targetId',e.target_id,'targetType',e.target_type,
    'action',e.action,'source',e.source,'at',e.created_at,'outcome','success','reason',e.reason) order by e.id desc),'[]') into audit
  from (select * from public.wow_audit x where x.workspace_id=wid and (is_owner or x.actor_id=p_user or x.target_type='account' and x.target_id=p_user::text) order by x.id desc limit 200) e;
  return jsonb_build_object('workspaceId',wid,'identity',jsonb_build_object('configured',true,'revision',p_context->'revision',
    'currentAccount',p_context->'account','accounts',accounts,'audit',audit));
end $$;

create or replace function public.wow_service(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  uid uuid; sid uuid; wid uuid; context jsonb; profile jsonb; a public.wow_accounts; target public.wow_accounts;
  w public.wow_workspaces; setup public.wow_setup_claims; session_row public.wow_sessions; lim public.wow_login_limits;
  batch public.wow_batches; row_record public.wow_records; item jsonb; result jsonb; changes jsonb='[]'; records jsonb='[]'; products jsonb='[]'; uploads jsonb='[]';
  conflicts jsonb='[]'; refs jsonb='[]'; related_invoices jsonb='[]'; old_revision bigint; new_change bigint; head bigint; cursor_value bigint;
  epoch bigint; expected bigint; target_uid uuid; lock_workspace boolean; touch_session boolean; limit_count integer;
  row_count integer=0; total_size bigint=0; more boolean=false; bucket_key text; media_key text; key_text text; reference_cursor jsonb; finance_before jsonb;
begin
  if jsonb_typeof(p_data)<>'object' then raise exception using message='INVALID_REQUEST',errcode='P0001'; end if;
  if p_action in ('push.config','push.subscribe','push.unsubscribe','push.test') then return public.wow_push_api(p_action,p_data); end if;
  -- Enrollment is management-issued, workspace-scoped, expiring, and single use.
  if p_action in ('setup.inspect','setup.claim') then
    select * into setup from public.wow_setup_claims where token_hash=p_data->>'claimHash' for update;
    if setup.token_hash is null or setup.used_at is not null or setup.expires_at<=now() then raise exception using message='SETUP_PROOF_INVALID',errcode='P0001'; end if;
    select * into w from public.wow_workspaces where id=setup.workspace_id for update;
    if w.status<>'active' or exists(select 1 from public.wow_accounts where workspace_id=w.id) then raise exception using message='ALREADY_CONFIGURED',errcode='P0001'; end if;
    if p_action='setup.inspect' then return jsonb_build_object('workspaceId',w.id); end if;
    uid=(p_data->>'userId')::uuid; profile=p_data->'profile';
    if profile->>'role'<>'owner' or (p_data->>'workspaceId')::uuid<>w.id or not exists(select 1 from auth.users where id=uid and email=p_data->>'email' and not is_anonymous) then
      raise exception using message='SETUP_PROOF_INVALID',errcode='P0001';
    end if;
    insert into public.wow_accounts(id,workspace_id,login_email,username,name,role,permissions)
      values(uid,w.id,p_data->>'email',profile->>'username',profile->>'name','owner',array(select jsonb_array_elements_text(profile->'permissions')));
    update public.wow_setup_claims set used_at=now(),used_by=uid where token_hash=setup.token_hash;
    insert into public.wow_audit(workspace_id,actor_id,target_id,action) values(w.id,uid,uid::text,'owner_enrolled');
    return jsonb_build_object('workspaceId',w.id);
  end if;
  if p_action='auth.resolve' then
    if nullif(p_data->>'workspaceId','') is null then
      select count(*),(array_agg(id))[1] into row_count,wid from public.wow_workspaces where status='active';
      if row_count<>1 then raise exception using message='WORKSPACE_REQUIRED',errcode='P0001'; end if;
    else wid=(p_data->>'workspaceId')::uuid; end if;
    if not exists(select 1 from public.wow_workspaces where id=wid and status='active') then raise exception using message='AUTH_REQUIRED',errcode='P0001'; end if;
    select * into a from public.wow_accounts where workspace_id=wid and username=p_data->>'username';
    bucket_key=coalesce(a.id::text,'*unknown*');
    insert into public.wow_login_limits(workspace_id,bucket,account_id) values(wid,bucket_key,a.id) on conflict do nothing;
    select * into lim from public.wow_login_limits where workspace_id=wid and bucket=bucket_key for update;
    if lim.window_start<=now()-interval '15 minutes' then lim.attempts=0; lim.window_start=now(); end if;
    if lim.attempts>=8 then raise exception using message='RATE_LIMITED',detail='{"retryAfter":900}',errcode='P0001'; end if;
    update public.wow_login_limits set attempts=lim.attempts+1,window_start=lim.window_start,last_attempt_id=gen_random_uuid()
      where workspace_id=wid and bucket=bucket_key returning * into lim;
    return jsonb_build_object('email',case when a.status='active' and (a.expires_at is null or a.expires_at>now()) then a.login_email end,
      'userId',a.id,'attemptId',lim.last_attempt_id);
  end if;
  if p_action='auth.failed' then return '{}'; end if;
  if p_action='auth.succeeded' then
    update public.wow_login_limits set attempts=0,window_start=now() where last_attempt_id=(p_data->>'attemptId')::uuid and account_id=(p_data->>'userId')::uuid;
    return '{}';
  end if;
  uid=(p_data->>'userId')::uuid; sid=(p_data->>'sessionId')::uuid;
  if uid is null or sid is null then raise exception using message='AUTH_REQUIRED',errcode='P0001'; end if;
  if p_action='session.close' then
    update public.wow_sessions set closed_at=now() where session_id=sid and account_id=uid;
    update public.wow_push_subscriptions set active=false,updated_at=now() where account_id=uid and session_id=sid;
    return '{}';
  end if;
  if p_action='session.open' then
    if not exists(select 1 from auth.sessions x where x.id=sid and x.user_id=uid and (x.not_after is null or x.not_after>now())) then raise exception using message='AUTH_REQUIRED',errcode='P0001'; end if;
    select * into a from public.wow_accounts where id=uid;
    if a.id is null or a.status<>'active' or (a.expires_at is not null and a.expires_at<=now()) then raise exception using message='ACCOUNT_UNAVAILABLE',errcode='P0001'; end if;
    insert into public.wow_sessions(session_id,account_id,session_version) values(sid,uid,a.session_version) on conflict do nothing;
  end if;
  lock_workspace=p_action in ('sync.commit','accounts.create','accounts.update','accounts.status','accounts.restore','accounts.passwordBegin','accounts.revokeSessions');
  touch_session=p_action in ('session.touch','sync.commit','accounts.create','accounts.update','accounts.status','accounts.restore','accounts.passwordBegin','accounts.revokeSessions','media.stage','activity.record');
  context=public.wow_actor(uid,sid,(p_data->>'expectedSessionVersion')::bigint,touch_session,lock_workspace);
  wid=(context->>'workspaceId')::uuid; epoch=(context->'account'->>'sessionVersion')::bigint;
  if p_action in ('session.open','session.snapshot','session.touch') then return public.wow_identity(uid,context); end if;
  if p_action='account.credentials' then
    select * into a from public.wow_accounts where id=uid;return jsonb_build_object('email',a.login_email);
  end if;
  if p_action in ('sync.prepare','sync.commit') then
    if coalesce(p_data->>'origin','live') not in ('live','bootstrap','restore') then raise exception using message='INVALID_SYNC_ORIGIN',errcode='P0001'; end if;
    if coalesce(p_data->>'origin','live')<>'live' and context->'account'->>'role'<>'owner' then raise exception using message='ACCESS_DENIED',errcode='P0001'; end if;
    select * into batch from public.wow_batches where workspace_id=wid and account_id=uid and batch_id=p_data->>'batchId';
    if batch.batch_id is not null then
      if batch.request_hash<>p_data->>'requestHash' then raise exception using message='IDEMPOTENCY_MISMATCH',errcode='P0001'; end if;
      if batch.session_version<>epoch then raise exception using message='BATCH_SESSION_CHANGED',errcode='P0001'; end if;
      return case when p_action='sync.prepare' then jsonb_build_object('replay',batch.response) else batch.response end;
    end if;
  end if;
  if p_action='sync.prepare' then
    if jsonb_array_length(p_data->'keys') not between 1 and 100 then raise exception using message='INVALID_BATCH',errcode='P0001'; end if;
    select coalesce(jsonb_agg(public.wow_record(r)),'[]') into records from public.wow_records r
      where r.workspace_id=wid and exists(select 1 from jsonb_array_elements(p_data->'keys') k where k->>'store'=r.store and k->'id'=r.record_id);
    select coalesce(jsonb_agg(public.wow_record(r)),'[]') into products from public.wow_records r
      where r.workspace_id=wid and r.store='products' and r.record_id#>>'{}' in (select jsonb_array_elements_text(p_data->'productIds'));
    select coalesce(jsonb_agg(jsonb_build_object('id',u.record_id,'storagePath',u.storage_path,'ready',u.ready,'accountId',u.account_id,
      'size',u.size,'contentType',u.content_type,'updatedAt',u.created_at)),'[]') into uploads
      from public.wow_media_uploads u where u.workspace_id=wid and
       (exists(select 1 from jsonb_array_elements(p_data->'keys') k where k->>'store'='media' and k->'id'=u.record_id)
        or (u.account_id=uid and u.record_id#>>'{}' in(select jsonb_array_elements_text(coalesce(p_data->'mediaIds','[]')))));
    select coalesce(jsonb_agg(public.wow_record(q)),'[]') into related_invoices from public.wow_records q where q.workspace_id=wid and q.store='invoices' and q.deleted_at is null and
      (q.record_id in (select jsonb_array_elements(coalesce(p_data->'relatedInvoiceIds','[]'))) or exists
        (select 1 from jsonb_array_elements(records) x where x->>'store'='payments' and x->'value'->'invoiceId'=q.record_id));
    return jsonb_build_object('context',context,'records',records,'products',products,'uploads',uploads,'relatedInvoices',related_invoices);
  end if;
  if p_action='sync.commit' then
    if jsonb_array_length(p_data->'operations') not between 1 and 100 or octet_length((p_data->'operations')::text)>6291456 then raise exception using message='INVALID_BATCH',errcode='P0001'; end if;
    if p_data->>'mediaDataRevision' is not null and (p_data->>'mediaDataRevision')::bigint<>(context->>'dataRevision')::bigint then
      raise exception using message='MEDIA_RECHECK_REQUIRED',errcode='P0001';
    end if;
    for item in select value from jsonb_array_elements(p_data->'operations') loop
      select revision into old_revision from public.wow_records where workspace_id=wid and store=item->>'store' and record_id=item->'id';
      old_revision=coalesce(old_revision,0);
      if old_revision<>(item->>'baseRevision')::bigint then conflicts=conflicts||jsonb_build_array(jsonb_build_object('store',item->>'store','id',item->'id','expectedRevision',item->'baseRevision','actualRevision',old_revision)); end if;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(p_data->'guards','[]')) loop
      select revision into old_revision from public.wow_records where workspace_id=wid and store='products' and record_id=item->'id';
      if coalesce(old_revision,0)<>(item->>'revision')::bigint then conflicts=conflicts||jsonb_build_array(jsonb_build_object('store','products','id',item->'id','expectedRevision',item->'revision','actualRevision',coalesce(old_revision,0))); end if;
    end loop;
    for row_record in select * from public.wow_records q where q.workspace_id=wid and q.store='products' and q.record_id#>>'{}' in
      (select jsonb_array_elements_text(coalesce(p_data->'sourceProductIds','[]'))) and not exists
      (select 1 from jsonb_array_elements(coalesce(p_data->'guards','[]')) g where g->'id'=q.record_id) loop
      conflicts=conflicts||jsonb_build_array(jsonb_build_object('store','products','id',row_record.record_id,'expectedRevision',0,'actualRevision',row_record.revision));
    end loop;
    if jsonb_array_length(conflicts)>0 then raise exception using message='CONFLICT',detail=jsonb_build_object('conflicts',conflicts)::text,errcode='P0001'; end if;
    -- Once the finance module is installed, the original cashbox/payment forms
    -- obey the same authoritative balance invariant as its native posting API.
    -- The workspace lock covers this snapshot, the entire batch and validation.
    if coalesce(p_data->>'origin','live')='live' and to_regprocedure('wow_fin.sync_cash_snapshot(uuid)') is not null and exists(
      select 1 from jsonb_array_elements(p_data->'operations') x where x->>'store' in ('payments','invoices') or
        (x->>'store'='settings' and (x->'id'#>>'{}') like 'cashbox-entry/%')) then
      finance_before=wow_fin.sync_cash_snapshot(wid);
    end if;
    for item in select value from jsonb_array_elements(p_data->'operations') loop
      new_change=nextval('public.wow_change_sequence');
      insert into public.wow_records(workspace_id,store,record_id,payload,revision,change_id,deleted_at,updated_by)
      values(wid,item->>'store',item->'id',case when item->>'kind'='delete' then null else item->'value' end,(item->>'baseRevision')::bigint+1,
        new_change,case when item->>'kind'='delete' then now() end,uid)
      on conflict(workspace_id,store,record_id) do update set payload=excluded.payload,revision=excluded.revision,
        change_id=excluded.change_id,deleted_at=excluded.deleted_at,updated_by=excluded.updated_by,updated_at=now();
      delete from public.wow_media_links where workspace_id=wid and store=item->>'store' and record_id=item->'id';
      if item->>'kind'<>'delete' and item->>'store'<>'media' then
        insert into public.wow_media_links(workspace_id,media_key,store,record_id)
          select distinct wid,jsonb_array_elements_text(coalesce(item->'mediaRefs','[]')),item->>'store',item->'id' on conflict do nothing;
      end if;
    end loop;
    if finance_before is not null then perform wow_fin.sync_cash_validate(wid,finance_before);end if;
    update public.wow_workspaces set data_revision=new_change where id=wid;
    perform public.wow_push_enqueue(wid,uid,coalesce(p_data->'pushEvents','[]'),coalesce(p_data->>'origin','live'));
    result=jsonb_build_object('batchId',p_data->>'batchId','changes',p_data->'projected','commitRevision',new_change);
    insert into public.wow_batches(workspace_id,account_id,batch_id,device_id,request_hash,session_version,response)
      values(wid,uid,p_data->>'batchId',p_data->>'deviceId',p_data->>'requestHash',epoch,result);
    insert into public.wow_audit(workspace_id,actor_id,target_type,target_id,action,details)
      values(wid,uid,'batch',p_data->>'batchId','records_committed',jsonb_build_object('count',jsonb_array_length(p_data->'operations'),'deviceId',p_data->>'deviceId'));
    return result;
  end if;
  if p_action='sync.pull' then
    cursor_value=coalesce((p_data->>'cursor')::bigint,0);head=(context->>'dataRevision')::bigint;limit_count=least(100,greatest(1,(p_data->>'limit')::integer));
    if cursor_value>head then raise exception using message='INVALID_CURSOR',errcode='P0001'; end if;
    for row_record in select * from public.wow_records where workspace_id=wid and change_id>cursor_value and change_id<=head order by change_id limit limit_count+1 loop
      if row_count>=limit_count or (row_count>0 and total_size+octet_length(coalesce(row_record.payload::text,''))>2097152) then more=true;exit;end if;
      records=records||jsonb_build_array(public.wow_record(row_record));cursor_value=row_record.change_id;row_count=row_count+1;total_size=total_size+octet_length(coalesce(row_record.payload::text,''));
    end loop;
    if not more then cursor_value=head; end if;
    return jsonb_build_object('context',context,'records',records,'cursor',cursor_value,'hasMore',more);
  end if;
  if p_action='sync.inspect' then
    if context->'account'->>'role'<>'owner' then raise exception using message='ACCESS_DENIED',errcode='P0001'; end if;
    if jsonb_array_length(p_data->'records') not between 1 and 100 then raise exception using message='INVALID_BATCH',errcode='P0001'; end if;
    for item in select value from jsonb_array_elements(p_data->'records') loop
      select * into row_record from public.wow_records where workspace_id=wid and store=item->>'store' and record_id=item->'id';
      changes=changes||jsonb_build_array(case when row_record.workspace_id is null then jsonb_build_object('store',item->>'store','id',item->'id','revision',0,'deleted',true) else public.wow_record(row_record) end);
    end loop;
    return jsonb_build_object('changes',changes);
  end if;
  if p_action='media.resolve' then
    if jsonb_array_length(p_data->'ids')>300 then raise exception using message='INVALID_MEDIA',errcode='P0001'; end if;
    for row_record in select * from public.wow_records where workspace_id=wid and store='media' and record_id#>>'{}' in (select jsonb_array_elements_text(p_data->'ids')) loop
      total_size=total_size+octet_length(coalesce(row_record.payload::text,''));
      if total_size>2097152 then raise exception using message='MEDIA_LOOKUP_LIMIT',errcode='P0001';end if;
      records=records||jsonb_build_array(public.wow_record(row_record));
    end loop;
    return jsonb_build_object('records',records);
  end if;
  if p_action='media.references' then
    if jsonb_array_length(p_data->'ids') not between 1 and 300 then raise exception using message='INVALID_MEDIA',errcode='P0001'; end if;
    reference_cursor=p_data->'after';
    for row_record in select q.* from public.wow_records q where q.workspace_id=wid and q.deleted_at is null and
      (reference_cursor is null or reference_cursor='null'::jsonb or (q.store,q.record_id)>(reference_cursor->>'store',reference_cursor->'id')) and
      exists(select 1 from public.wow_media_links l where l.workspace_id=wid and l.store=q.store and l.record_id=q.record_id and l.media_key in(select jsonb_array_elements_text(p_data->'ids')))
      order by q.store,q.record_id limit 51 loop
      if row_count>=50 or row_count>0 and total_size+octet_length(coalesce(row_record.payload::text,''))>2097152 then more=true;exit;end if;
      refs=refs||jsonb_build_array(public.wow_record(row_record));row_count=row_count+1;total_size=total_size+octet_length(coalesce(row_record.payload::text,''));
      reference_cursor=jsonb_build_object('store',row_record.store,'id',row_record.record_id);
    end loop;
    return jsonb_build_object('references',refs,'cursor',reference_cursor,'hasMore',more);
  end if;
  if p_action='media.stage' then
    item=p_data->'record';
    if context->'account'->>'role'<>'owner' and not exists(select 1 from jsonb_array_elements_text(context->'account'->'permissions') p where p in ('customers.edit','products.edit','invoices.edit','tasks.edit','materials.edit','purchasing.edit','settings.edit')) then raise exception using message='ACCESS_DENIED',errcode='P0001'; end if;
    if item->>'storagePath' not like wid::text||'/%' or (item->>'size')::bigint not between 1 and 8388608 then raise exception using message='INVALID_MEDIA',errcode='P0001'; end if;
    if (select count(*) from public.wow_media_uploads where account_id=uid and created_at>now()-interval '1 hour')>=200 then raise exception using message='RATE_LIMITED',detail='{"retryAfter":3600}',errcode='P0001'; end if;
    insert into public.wow_media_uploads(workspace_id,account_id,record_id,storage_path,content_type,size)
      values(wid,uid,item->'id',item->>'storagePath',item->>'contentType',(item->>'size')::bigint) on conflict(storage_path) do nothing;
    if not exists(select 1 from public.wow_media_uploads where workspace_id=wid and storage_path=item->>'storagePath' and record_id=item->'id' and (account_id=uid or context->'account'->>'role'='owner')) then raise exception using message='ACCESS_DENIED',errcode='P0001'; end if;
    return (select jsonb_build_object('record',jsonb_build_object('id',u.record_id,'storagePath',u.storage_path,'kind','image',
      'size',u.size,'contentType',u.content_type,'updatedAt',u.created_at)) from public.wow_media_uploads u where u.storage_path=item->>'storagePath' and u.workspace_id=wid);
  end if;
  if p_action='media.ready' then
    update public.wow_media_uploads set ready=true,updated_at=case when not ready then now() else updated_at end where workspace_id=wid and (account_id=uid or context->'account'->>'role'='owner') and storage_path=p_data->>'storagePath';
    if not found then raise exception using message='INVALID_MEDIA',errcode='P0001'; end if;
    return (select jsonb_build_object('record',jsonb_build_object('id',u.record_id,'storagePath',u.storage_path,'kind','image',
      'size',u.size,'contentType',u.content_type,'updatedAt',u.created_at)) from public.wow_media_uploads u where u.storage_path=p_data->>'storagePath' and u.workspace_id=wid);
  end if;
  if p_action='activity.record' then
    item=p_data->'event';
    if (select count(*) from public.wow_audit where workspace_id=wid and actor_id=uid and source='client' and created_at>now()-interval '1 minute')>=120 then raise exception using message='RATE_LIMITED',errcode='P0001'; end if;
    insert into public.wow_audit(workspace_id,actor_id,target_id,target_type,action,source)
      values(wid,uid,left(item->>'targetId',180),left(item->>'targetType',40),left(item->>'action',80),'client');
    return public.wow_identity(uid,context);
  end if;
  -- Only this branch changes identity. It holds the workspace write lock and
  -- rechecks the live actor version, so a previously fetched role is insufficient.
  if p_action not in ('accounts.create','accounts.update','accounts.status','accounts.restore','accounts.passwordBegin','accounts.revokeSessions') then raise exception using message='UNKNOWN_ACTION',errcode='P0001'; end if;
  target_uid=(p_data->>'accountId')::uuid;
  if context->'account'->>'role'<>'owner' and not (p_action='accounts.passwordBegin' and target_uid=uid and coalesce((p_data->>'keepCurrent')::boolean,false)) then raise exception using message='ACCESS_DENIED',errcode='P0001'; end if;
  expected=(p_data->>'expectedRevision')::bigint;
  if expected is not null and expected<>(context->>'revision')::bigint then raise exception using message='IDENTITY_CONFLICT',errcode='P0001'; end if;
  if p_action='accounts.create' then
    profile=p_data->'profile';
    -- Edge uses authUserId for the newly created account; userId always denotes
    -- the verified caller and must never be shadowed by the creation payload.
    target_uid=(p_data->>'authUserId')::uuid;
    if target_uid is null or not exists(select 1 from auth.users where id=target_uid and email=p_data->>'email' and not is_anonymous) then raise exception using message='INVALID_ACCOUNT',errcode='P0001'; end if;
    insert into public.wow_accounts(id,workspace_id,login_email,username,name,role,permissions,department,note,expires_at)
      values(target_uid,wid,p_data->>'email',profile->>'username',profile->>'name',profile->>'role',array(select jsonb_array_elements_text(profile->'permissions')),
      coalesce(profile->>'department',''),coalesce(profile->>'note',''),(profile->>'expiresAt')::timestamptz);
  else
    select * into target from public.wow_accounts where id=target_uid and workspace_id=wid for update;
    if target.id is null then raise exception using message='ACCOUNT_NOT_FOUND',errcode='P0001'; end if;
    if target.status='deleted' and p_action<>'accounts.restore' then raise exception using message='INVALID_STATUS',errcode='P0001'; end if;
    if p_action='accounts.update' then
      profile=p_data->'profile';
      if target_uid=uid and (profile->>'role'<>'owner' or profile->>'expiresAt' is not null) then raise exception using message='SELF_PROTECTION',errcode='P0001'; end if;
      update public.wow_accounts set username=profile->>'username',name=profile->>'name',role=profile->>'role',
        permissions=array(select jsonb_array_elements_text(profile->'permissions')),department=coalesce(profile->>'department',''),note=coalesce(profile->>'note',''),expires_at=(profile->>'expiresAt')::timestamptz,
        session_version=session_version+case when role<>profile->>'role' or to_jsonb(permissions)<>profile->'permissions' or expires_at is distinct from (profile->>'expiresAt')::timestamptz then 1 else 0 end,updated_at=now() where id=target_uid;
    elsif p_action in ('accounts.status','accounts.restore') then
      key_text=case when p_action='accounts.restore' then 'active' else p_data->>'status' end;
      if key_text not in ('active','suspended','revoked','deleted') or key_text is null then raise exception using message='INVALID_STATUS',errcode='P0001'; end if;
      if p_action='accounts.status' and target.status=key_text then return public.wow_identity(uid,context); end if;
      if target_uid=uid and key_text<>'active' then raise exception using message='SELF_PROTECTION',errcode='P0001'; end if;
      update public.wow_accounts set status=key_text,session_version=session_version+1,deleted_at=case when key_text='deleted' then now() end,updated_at=now() where id=target_uid;
    else
      if p_action='accounts.revokeSessions' and target_uid=uid then raise exception using message='SELF_PROTECTION',errcode='P0001'; end if;
      update public.wow_accounts set session_version=session_version+1,updated_at=now() where id=target_uid;
      if p_action='accounts.passwordBegin' and target_uid=uid and coalesce((p_data->>'keepCurrent')::boolean,false) then
        update public.wow_sessions set session_version=(select session_version from public.wow_accounts where id=uid) where session_id=sid;
      end if;
    end if;
  end if;
  insert into public.wow_audit(workspace_id,actor_id,target_id,action,reason) values(wid,uid,target_uid::text,p_action,left(coalesce(p_data->>'reason',''),300));
  if p_action='accounts.passwordBegin' then return '{}'; end if;
  context=public.wow_actor(uid,sid,null,false,false);
  return public.wow_identity(uid,context);
exception
  when unique_violation then
    if sqlerrm like '%wow_records_invoice_number_idx%' then raise exception using message='DUPLICATE_INVOICE_NUMBER',errcode='P0001';
    elsif sqlerrm like '%wow_accounts_workspace_id_username_key%' then raise exception using message='USERNAME_TAKEN',errcode='P0001';
    else raise exception using message='DUPLICATE_RECORD',errcode='P0001'; end if;
end $$;

-- The browser has no direct read/write path to raw rows or service RPCs.
do $$ declare t text; begin
  foreach t in array array['wow_workspaces','wow_setup_claims','wow_permission_catalog','wow_accounts','wow_sessions','wow_login_limits',
    'wow_records','wow_batches','wow_media_uploads','wow_media_links','wow_audit'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public, anon, authenticated',t);
    execute format('grant all on table public.%I to service_role',t);
  end loop;
end $$;
revoke all on sequence public.wow_change_sequence, public.wow_audit_id_seq from public, anon, authenticated;
grant usage, select on sequence public.wow_change_sequence, public.wow_audit_id_seq to service_role;
revoke all on function public.wow_profile(public.wow_accounts), public.wow_record(public.wow_records), public.wow_guard_account(),
  public.wow_actor(uuid,uuid,bigint,boolean,boolean), public.wow_identity(uuid,jsonb), public.wow_service(text,jsonb) from public, anon, authenticated;
grant execute on function public.wow_service(text,jsonb) to service_role;

create or replace view public.wow_control_accounts with (security_invoker=true) as
select a.workspace_id,w.name as workspace,a.id,a.name,a.username,a.role,a.status,a.permissions,a.department,a.expires_at,a.session_version,
  a.created_at,a.updated_at,(select count(*) from public.wow_sessions s where s.account_id=a.id and s.closed_at is null and s.session_version=a.session_version and
    (a.role='owner' or s.started_at>now()-interval '8 hours' and s.last_active_at>now()-interval '30 minutes')) as active_app_sessions
from public.wow_accounts a join public.wow_workspaces w on w.id=a.workspace_id;
create or replace view public.wow_control_records with (security_invoker=true) as
select workspace_id,store,record_id,revision,change_id,payload,deleted_at,updated_at,updated_by from public.wow_records;
create or replace view public.wow_control_metrics with (security_invoker=true) as
select w.id as workspace_id,w.name,w.status,w.control_revision,w.data_revision,
  (select count(*) from public.wow_accounts a where a.workspace_id=w.id and a.status='active') as active_accounts,
  (select count(*) from public.wow_records r where r.workspace_id=w.id and r.deleted_at is null) as live_records,
  (select count(*) from public.wow_records r where r.workspace_id=w.id and r.deleted_at is not null) as tombstones,
  (select coalesce(sum(octet_length(r.payload::text)),0) from public.wow_records r where r.workspace_id=w.id) as record_bytes,
  (select max(created_at) from public.wow_batches b where b.workspace_id=w.id) as last_sync_at from public.wow_workspaces w;
revoke all on public.wow_control_accounts,public.wow_control_records,public.wow_control_metrics from public,anon,authenticated;
grant select on public.wow_control_accounts,public.wow_control_records,public.wow_control_metrics to service_role;
comment on table public.wow_accounts is 'WOW staff identities and live grants. Use the app to change access; never grant workers owner-only capabilities.';
comment on table public.wow_setup_claims is 'Management-issued one-time owner enrollment. Hash only. Expire unused claims; never paste a raw token here.';
comment on table public.wow_records is 'WOW business records with per-record CAS revision, monotonic pull cursor, and retained deletion tombstones.';
comment on view public.wow_control_metrics is 'WOW-only status and usage. No Masarifi objects are included.';

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('wow-files','wow-files',false,8388608,array['image/png','image/jpeg','image/webp','image/gif','image/avif','image/svg+xml']) on conflict(id) do nothing;
do $$ begin if exists(select 1 from storage.buckets where id='wow-files' and public) then raise exception 'WOW_BUCKET_MUST_BE_PRIVATE'; end if; end $$;
-- Restrictive isolation also defeats a future broad permissive storage policy.
drop policy if exists wow_files_server_only on storage.objects;
create policy wow_files_server_only on storage.objects as restrictive for all to anon,authenticated
  using (bucket_id<>'wow-files') with check (bucket_id<>'wow-files');

-- Owner financial Web Push. Payload rows stay private; endpoint encryption and
-- VAPID signing run in the private Edge worker after the business commit.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net;
create extension if not exists pg_cron with schema pg_catalog;
create table if not exists public.wow_push_control (
  singleton boolean primary key default true check(singleton), enabled boolean not null default false,
  project_origin text check(project_origin ~ '^https://[a-z0-9]{20}\.supabase\.co$'),
  last_wake_at timestamptz, last_wake_error text, configured_at timestamptz
);
insert into public.wow_push_control(singleton) values(true) on conflict do nothing;
create table if not exists public.wow_push_subscriptions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.wow_workspaces(id),
  account_id uuid not null references public.wow_accounts(id), session_id uuid not null references public.wow_sessions(session_id),
  session_version bigint not null, device_id text not null check(device_id ~ '^[A-Za-z0-9_.:-]{8,120}$'),
  endpoint text not null check(length(endpoint)<=4096), endpoint_hash text not null unique check(endpoint_hash ~ '^[0-9a-f]{64}$'),
  p256dh text not null check(p256dh ~ '^[A-Za-z0-9_-]{87}$'), auth_key text not null check(auth_key ~ '^[A-Za-z0-9_-]{22}$'),
  language text not null default 'ar' check(language in ('ar','en','tr','fr','ru')), expires_at timestamptz,
  active boolean not null default true, last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists wow_push_device_active_idx on public.wow_push_subscriptions(workspace_id,account_id,device_id) where active;
create index if not exists wow_push_account_idx on public.wow_push_subscriptions(account_id,session_version) where active;
-- Rotate this opaque identifier when an endpoint, encryption key or session is
-- rebound. Already accepted provider messages then fail the device's local check.
alter table public.wow_push_subscriptions add column if not exists binding_id uuid not null default gen_random_uuid();
alter table public.wow_push_subscriptions add column if not exists bound_at timestamptz not null default now();
create table if not exists public.wow_push_events (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.wow_workspaces(id),
  actor_id uuid not null references public.wow_accounts(id), record_store text not null check(record_store in ('invoices','payments','settings','test')),
  record_id jsonb not null, record_revision bigint not null check(record_revision>=0),
  kind text not null check(kind in ('proforma','payment','expense','receipt','test')),
  action text not null check(action in ('created','updated','deleted','test')), details jsonb not null check(jsonb_typeof(details)='object' and octet_length(details::text)<=8192),
  created_at timestamptz not null default now(), unique(workspace_id,record_store,record_id,record_revision,kind)
);
create index if not exists wow_push_events_actor_idx on public.wow_push_events(workspace_id,actor_id,created_at desc);
alter table public.wow_push_events add column if not exists recipient_id uuid references public.wow_accounts(id);
create table if not exists public.wow_push_jobs (
  id bigint generated always as identity primary key, event_id uuid not null references public.wow_push_events(id),
  subscription_id uuid not null references public.wow_push_subscriptions(id),
  status text not null default 'pending' check(status in ('pending','leased','sent','dead','failed','cancelled')),
  attempts integer not null default 0 check(attempts between 0 and 12), next_attempt_at timestamptz not null default now(),
  lease_token uuid, lease_until timestamptz, last_http_status integer, last_error text,
  created_at timestamptz not null default now(), sent_at timestamptz, unique(event_id,subscription_id)
);
create index if not exists wow_push_jobs_due_idx on public.wow_push_jobs(next_attempt_at,id) where status in ('pending','leased');
create index if not exists wow_push_jobs_subscription_idx on public.wow_push_jobs(subscription_id) where status in ('pending','leased');

create or replace function public.wow_push_eligible(p_role text,p_permissions text[]) returns boolean
language sql immutable set search_path='' as $$
  select p_role='owner' or p_permissions && array['chat.view','gallery.view','orders.view','myorders.view']
$$;
create or replace view public.wow_push_active_devices with(security_invoker=true) as
select s.*,a.role as account_role,
  least(s.expires_at,a.expires_at,aus.not_after,case when a.role<>'owner' then least(ws.started_at+interval '8 hours',ws.last_active_at+interval '30 minutes') end) as active_until
from public.wow_push_subscriptions s
join public.wow_accounts a on a.id=s.account_id and a.workspace_id=s.workspace_id
join public.wow_workspaces w on w.id=s.workspace_id
join public.wow_sessions ws on ws.session_id=s.session_id and ws.account_id=s.account_id
join auth.sessions aus on aus.id=s.session_id and aus.user_id=s.account_id
join auth.users au on au.id=s.account_id
where s.active and w.status='active' and a.status='active' and public.wow_push_eligible(a.role,a.permissions) and a.session_version=s.session_version
and (a.role='owner' or ws.started_at>now()-interval '8 hours' and ws.last_active_at>now()-interval '30 minutes')
and (a.expires_at is null or a.expires_at>now()) and (s.expires_at is null or s.expires_at>now())
and ws.closed_at is null and ws.session_version=a.session_version and (aus.not_after is null or aus.not_after>now())
and au.deleted_at is null and (au.banned_until is null or au.banned_until<=now()) and not coalesce(au.is_anonymous,false);

-- Existing finance fanout and owner health metrics use this owner-only view.
create or replace view public.wow_push_live_subscriptions with(security_invoker=true) as
select s.* from public.wow_push_subscriptions s join public.wow_push_active_devices d on d.id=s.id where d.account_role='owner';

create or replace function public.wow_push_bind_subscription() returns trigger language plpgsql set search_path='' as $$
begin
  if new.active and (not old.active or (new.session_id,new.session_version,new.p256dh,new.auth_key)
     is distinct from (old.session_id,old.session_version,old.p256dh,old.auth_key)) then
    new.binding_id=gen_random_uuid();new.bound_at=now();
  end if;
  return new;
end $$;
drop trigger if exists wow_push_bind_subscription on public.wow_push_subscriptions;
create trigger wow_push_bind_subscription before update on public.wow_push_subscriptions for each row execute function public.wow_push_bind_subscription();
create or replace function public.wow_push_cancel_subscription() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not new.active or new.binding_id<>old.binding_id then
    update public.wow_push_jobs set status='cancelled',last_error='SUBSCRIPTION_CHANGED',lease_token=null,lease_until=null
      where subscription_id=new.id and status in ('pending','leased');
  end if; return new;
end $$;
drop trigger if exists wow_push_subscription_changed on public.wow_push_subscriptions;
create trigger wow_push_subscription_changed after update on public.wow_push_subscriptions for each row execute function public.wow_push_cancel_subscription();
create or replace function public.wow_push_account_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.session_version<>old.session_version or not public.wow_push_eligible(new.role,new.permissions) or new.status<>'active' then
    update public.wow_push_subscriptions set active=false,last_error='ACCOUNT_CHANGED',updated_at=now() where account_id=new.id and active;
  end if; return new;
end $$;
drop trigger if exists wow_push_account_changed on public.wow_accounts;
create trigger wow_push_account_changed after update on public.wow_accounts for each row execute function public.wow_push_account_changed();

-- pg_net starts requests only after commit. Wake failures leave the durable
-- queue intact and never turn a saved business operation into a network error.
create or replace function public.wow_push_wake() returns bigint language plpgsql security definer set search_path='' as $$
declare token text; target_url text; project_url text; request_id bigint; pending boolean;
begin
  if not exists(select 1 from public.wow_push_control where singleton and enabled) then return null;end if;
  select exists(select 1 from public.wow_push_jobs where status='pending' and next_attempt_at<=now() or status='leased' and lease_until<=now()) into pending;
  if not pending and to_regprocedure('wow_notify.has_pending()') is not null then pending=wow_notify.has_pending();end if;
  if not pending then return null;end if;
  update public.wow_push_control set last_wake_at=clock_timestamp() where singleton and
    (last_wake_at is null or last_wake_at<clock_timestamp()-interval '1 second');
  if not found then return null; end if;
  select decrypted_secret into token from vault.decrypted_secrets where name='wow_push_worker_token';
  select decrypted_secret into target_url from vault.decrypted_secrets where name='wow_push_worker_url';
  select project_origin into project_url from public.wow_push_control where singleton;
  if project_url is null or project_url !~ '^https://[a-z0-9]{20}\.supabase\.co$' or
    target_url is distinct from project_url||'/functions/v1/wow-cloud/push-worker' or length(coalesce(token,''))<32 then
    update public.wow_push_control set last_wake_error='PUSH_NOT_CONFIGURED' where singleton;return null;
  end if;
  select net.http_post(url:=target_url,headers:=jsonb_build_object('Content-Type','application/json','X-Wow-Worker-Token',token),body:='{}'::jsonb,timeout_milliseconds:=5000) into request_id;
  update public.wow_push_control set last_wake_error=null where singleton;
  return request_id;
exception when others then
  update public.wow_push_control set last_wake_error='WAKE_'||sqlstate where singleton;return null;
end $$;
create or replace function public.wow_push_queue_wake() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.wow_push_wake();return null;end $$;
drop trigger if exists wow_push_queue_wake on public.wow_push_jobs;
create trigger wow_push_queue_wake after insert on public.wow_push_jobs for each statement execute function public.wow_push_queue_wake();

create or replace function public.wow_push_enqueue(p_workspace uuid,p_actor uuid,p_events jsonb,p_origin text default 'live') returns integer
language plpgsql security definer set search_path='' as $$
declare e jsonb; new_event_id uuid; event_ids uuid[]='{}'; n integer=0;
begin
  if p_origin not in ('live','bootstrap','restore') or jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>100 then raise exception using message='INVALID_PUSH_EVENT',errcode='P0001'; end if;
  if p_origin<>'live' then
    if not exists(select 1 from public.wow_accounts where id=p_actor and workspace_id=p_workspace and role='owner' and status='active') then raise exception using message='ACCESS_DENIED',errcode='P0001'; end if;
    insert into public.wow_audit(workspace_id,actor_id,target_type,action,details) values(p_workspace,p_actor,'batch','historical_import_suppressed',jsonb_build_object('origin',p_origin));
    return 0;
  end if;
  for e in select value from jsonb_array_elements(p_events) loop
    if not exists(select 1 from public.wow_records r where r.workspace_id=p_workspace and r.store=e->>'store' and r.record_id=e->'id'
      and r.revision=(e->>'revision')::bigint and r.updated_by=p_actor and (r.deleted_at is not null)=(e->>'action'='deleted')) or
      not (e->>'store'='invoices' and e->>'kind'='proforma' or e->>'store'='payments' and e->>'kind'='payment' or
        e->>'store'='settings' and e->>'kind' in ('expense','receipt') and e->>'id' like 'cashbox-entry/%') then
      raise exception using message='INVALID_PUSH_EVENT',errcode='P0001';
    end if;
    insert into public.wow_push_events(workspace_id,actor_id,record_store,record_id,record_revision,kind,action,details)
      values(p_workspace,p_actor,e->>'store',e->'id',(e->>'revision')::bigint,e->>'kind',e->>'action',e->'details')
      on conflict(workspace_id,record_store,record_id,record_revision,kind) do nothing returning id into new_event_id;
    if new_event_id is not null then event_ids=array_append(event_ids,new_event_id);n=n+1;end if;
  end loop;
  insert into public.wow_push_jobs(event_id,subscription_id)
    select e.id,s.id from public.wow_push_events e cross join public.wow_push_live_subscriptions s
    where e.id=any(event_ids) and s.workspace_id=p_workspace on conflict(event_id,subscription_id) do nothing;
  return n;
end $$;

create or replace function public.wow_push_api(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare context jsonb; uid uuid=(p_data->>'userId')::uuid; sid uuid=(p_data->>'sessionId')::uuid; wid uuid; epoch bigint;
  sub public.wow_push_subscriptions; input jsonb; event_id uuid; public_key text; sub_id uuid; binding uuid;
begin
  context=public.wow_actor(uid,sid,(p_data->>'expectedSessionVersion')::bigint,false,true);
  wid=(context->>'workspaceId')::uuid;epoch=(context->'account'->>'sessionVersion')::bigint;
  if p_action='push.unsubscribe' then
    update public.wow_push_subscriptions set active=false,updated_at=now() where workspace_id=wid and account_id=uid
      and session_id=sid and device_id=p_data->>'deviceId' and endpoint_hash=p_data->>'endpointHash' and endpoint=p_data->>'endpoint';
    return jsonb_build_object('unsubscribed',true);
  end if;
  if not exists(select 1 from public.wow_accounts a where a.id=uid and a.workspace_id=wid and public.wow_push_eligible(a.role,a.permissions)) then
    raise exception using message='ACCESS_DENIED',errcode='P0001';
  end if;
  select decrypted_secret into public_key from vault.decrypted_secrets where name='wow_push_vapid_public';
  if not exists(select 1 from public.wow_push_control where singleton and enabled) or length(coalesce(public_key,''))<>87 then raise exception using message='PUSH_NOT_CONFIGURED',errcode='P0001'; end if;
  if p_action='push.config' then return jsonb_build_object('publicKey',public_key);end if;
  if p_action='push.subscribe' then
    input=p_data->'subscription';
    if encode(extensions.digest(convert_to(input->>'endpoint','UTF8'),'sha256'),'hex') is distinct from p_data->>'endpointHash' or
      input->>'endpoint' !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/' then
      raise exception using message='INVALID_PUSH_SUBSCRIPTION',errcode='P0001';
    end if;
    select * into sub from public.wow_push_subscriptions where endpoint_hash=p_data->>'endpointHash' for update;
    if sub.id is not null and (sub.account_id<>uid or sub.workspace_id<>wid or sub.device_id<>p_data->>'deviceId') then raise exception using message='SUBSCRIPTION_BOUND_TO_OTHER_IDENTITY',errcode='P0001'; end if;
    update public.wow_push_subscriptions set active=false,last_error='ENDPOINT_ROTATED',updated_at=now()
      where workspace_id=wid and account_id=uid and device_id=p_data->>'deviceId' and endpoint_hash<>p_data->>'endpointHash' and active;
    if not exists(select 1 from public.wow_push_active_devices d where d.id=sub.id) and
      (select count(*) from public.wow_push_active_devices where account_id=uid)>=20 then raise exception using message='RATE_LIMITED',errcode='P0001'; end if;
    insert into public.wow_push_subscriptions as existing(workspace_id,account_id,session_id,session_version,device_id,endpoint,endpoint_hash,p256dh,auth_key,language,expires_at)
      values(wid,uid,sid,epoch,p_data->>'deviceId',input->>'endpoint',p_data->>'endpointHash',input->'keys'->>'p256dh',input->'keys'->>'auth',p_data->>'language',
        case when input->>'expirationTime' is not null then to_timestamp((input->>'expirationTime')::double precision/1000) end)
      on conflict(endpoint_hash) do update set session_id=excluded.session_id,session_version=excluded.session_version,p256dh=excluded.p256dh,auth_key=excluded.auth_key,
        language=excluded.language,expires_at=excluded.expires_at,active=true,last_error=null,updated_at=now()
      where (existing.workspace_id,existing.account_id,existing.device_id)=(excluded.workspace_id,excluded.account_id,excluded.device_id)
      returning existing.id,existing.binding_id into sub_id,binding;
    if sub_id is null then raise exception using message='SUBSCRIPTION_BOUND_TO_OTHER_IDENTITY',errcode='P0001';end if;
    insert into public.wow_audit(workspace_id,actor_id,target_id,target_type,action,details) values(wid,uid,sub_id::text,'push_subscription','push_subscribed',jsonb_build_object('deviceId',p_data->>'deviceId'));
    return jsonb_build_object('subscribed',true,'subscriptionId',sub_id,'bindingId',binding,'financial',context->'account'->>'role'='owner');
  end if;
  if p_action='push.test' then
    select id into sub_id from public.wow_push_active_devices where workspace_id=wid and account_id=uid and session_id=sid and device_id=p_data->>'deviceId';
    if sub_id is null then raise exception using message='PUSH_SUBSCRIPTION_REQUIRED',errcode='P0001'; end if;
    if (select count(*) from public.wow_push_events where workspace_id=wid and actor_id=uid and kind='test' and created_at>now()-interval '1 minute')>=5 then
      raise exception using message='RATE_LIMITED',detail='{"retryAfter":60}',errcode='P0001'; end if;
    event_id=gen_random_uuid();
    insert into public.wow_push_events(id,workspace_id,actor_id,record_store,record_id,record_revision,kind,action,details)
      values(event_id,wid,uid,'test',to_jsonb(event_id::text),0,'test','test','{}');
    insert into public.wow_push_jobs(event_id,subscription_id) values(event_id,sub_id);
    return jsonb_build_object('queued',true,'eventId',event_id);
  end if;
  raise exception using message='UNKNOWN_ACTION',errcode='P0001';
exception when unique_violation then raise exception using message='SUBSCRIPTION_BOUND_TO_OTHER_IDENTITY',errcode='P0001';
end $$;

-- This RPC is never exposed as an action on the public client API. The private
-- worker authenticates its separate Vault token before claiming any jobs.
create or replace function public.wow_push_worker(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.wow_push_jobs; sub public.wow_push_active_devices; event public.wow_push_events; jobs jsonb='[]'; token text; vapid_public text; vapid_private text; subject text; outcome text; delay_seconds integer; enabled boolean; verified jsonb; delivery_until timestamptz;
begin
  select c.enabled into enabled from public.wow_push_control c where singleton;
  if p_action='config' then
    select decrypted_secret into token from vault.decrypted_secrets where name='wow_push_worker_token';
    select decrypted_secret into vapid_public from vault.decrypted_secrets where name='wow_push_vapid_public';
    select decrypted_secret into vapid_private from vault.decrypted_secrets where name='wow_push_vapid_private';
    select decrypted_secret into subject from vault.decrypted_secrets where name='wow_push_vapid_subject';
    if length(coalesce(token,''))<32 or length(coalesce(vapid_public,''))<>87 or length(coalesce(vapid_private,''))<>43 then raise exception using message='PUSH_NOT_CONFIGURED',errcode='P0001'; end if;
    return jsonb_build_object('workerTokenHash',encode(extensions.digest(convert_to(token,'UTF8'),'sha256'),'hex'),
      'vapid',jsonb_build_object('publicKey',vapid_public,'privateKey',vapid_private,'subject',subject));
  end if;
  if p_action='wake' then
    -- A completed worker can immediately drain the next bounded page. The
    -- trigger's one-second coalescing must not strand a burst until Cron.
    update public.wow_push_control set last_wake_at=null where singleton;
    perform public.wow_push_wake();return '{}';
  end if;
  if p_action='claim' then
    if not coalesce(enabled,false) then return jsonb_build_object('jobs','[]'::jsonb);end if;
    if to_regprocedure('wow_notify.handoff(integer)') is not null then perform wow_notify.handoff(16);end if;
    -- Invalid recipients are cancelled on preparation of this bounded lease page.
    update public.wow_push_jobs set status='failed',last_error='RETRY_LIMIT',lease_token=null,lease_until=null
      where id in (select j.id from public.wow_push_jobs j where j.attempts>=12 and
       (j.status='pending' or j.status='leased' and j.lease_until<=now()) order by j.id for update skip locked limit 40);
    for job in select * from public.wow_push_jobs where attempts<12 and
      (status='pending' and next_attempt_at<=now() or status='leased' and lease_until<=now()) order by next_attempt_at,id for update skip locked limit 20 loop
      update public.wow_push_jobs set status='leased',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes' where id=job.id returning * into job;
      jobs=jobs||jsonb_build_array(jsonb_build_object('jobId',job.id::text,'leaseToken',job.lease_token));
    end loop;
    return jsonb_build_object('jobs',jobs);
  end if;
  select * into job from public.wow_push_jobs where id=(p_data->>'jobId')::bigint and lease_token=(p_data->>'leaseToken')::uuid and status='leased' for update;
  if job.id is null then return case when p_action='recheck' then jsonb_build_object('allowed',false) else jsonb_build_object('cancelled',true) end;end if;
  if p_action in ('prepare','recheck') then
    select * into sub from public.wow_push_active_devices where id=job.subscription_id;
    select * into event from public.wow_push_events where id=job.event_id;
    if coalesce(enabled,false) and sub.id is not null and sub.workspace_id=event.workspace_id and event.created_at>now()-interval '24 hours' then
      if event.record_store in ('invoices','payments','settings') and sub.account_role='owner' and event.recipient_id is null then
        verified=event.details;
      elsif event.record_store='test' and event.actor_id=sub.account_id then verified='{}';
      elsif event.recipient_id=sub.account_id and to_regprocedure('wow_notify.payload(text,text,uuid,uuid)') is not null then
        verified=wow_notify.payload(event.kind,event.record_id->>'id',event.workspace_id,sub.account_id);
      end if;
    end if;
    if verified is null then
      update public.wow_push_jobs set status='cancelled',last_error='RECIPIENT_UNAVAILABLE',lease_token=null,lease_until=null where id=job.id;
      return case when p_action='recheck' then jsonb_build_object('allowed',false) else jsonb_build_object('cancelled',true) end;
    end if;
    if job.lease_until<=now() then
      update public.wow_push_jobs set status=case when attempts>=12 then 'failed' else 'pending' end,last_error='LEASE_EXPIRED',
        next_attempt_at=now()+interval '15 seconds',lease_token=null,lease_until=null where id=job.id;
      return case when p_action='recheck' then jsonb_build_object('allowed',false) else jsonb_build_object('cancelled',true) end;
    end if;
    if p_action='recheck' then return jsonb_build_object('allowed',true);end if;
    delivery_until=least(event.created_at+interval '24 hours',sub.active_until,(verified->>'expiresAt')::timestamptz);
    return jsonb_build_object('event',jsonb_build_object('id',event.id,'kind',event.kind,'action',event.action,'details',verified,'createdAt',event.created_at),
      'subscription',jsonb_build_object('endpoint',sub.endpoint,'keys',jsonb_build_object('p256dh',sub.p256dh,'auth',sub.auth_key),'expirationTime',case when sub.expires_at is not null then extract(epoch from sub.expires_at)*1000 end),
      'recipient',jsonb_build_object('workspaceId',sub.workspace_id,'userId',sub.account_id,'deviceId',sub.device_id,'language',sub.language,
        'bindingId',sub.binding_id,'sessionVersion',sub.session_version,'validUntil',delivery_until));
  end if;
  if p_action='finish' then
    outcome=p_data->>'status';if outcome not in ('sent','retry','dead','failed','cancelled') then raise exception using message='INVALID_PUSH_RESULT',errcode='P0001';end if;
    if outcome='retry' and job.attempts>=12 then outcome='failed';end if;
    delay_seconds=least(3600,greatest(15,coalesce((p_data->>'retryAfter')::integer,least(1800,(15*power(2,greatest(0,job.attempts-1)))::integer)))+(job.id%7)::integer);
    update public.wow_push_jobs set status=case when outcome='retry' then 'pending' else outcome end,
      next_attempt_at=case when outcome='retry' then now()+make_interval(secs=>delay_seconds) else next_attempt_at end,
      last_http_status=(p_data->>'httpStatus')::integer,last_error=left(p_data->>'errorCode',80),lease_token=null,lease_until=null,
      sent_at=case when outcome='sent' then now() else sent_at end where id=job.id;
    if outcome='dead' then update public.wow_push_subscriptions set active=false,last_error='ENDPOINT_GONE',updated_at=now() where id=job.subscription_id;end if;
    return jsonb_build_object('accepted',true);
  end if;
  raise exception using message='UNKNOWN_ACTION',errcode='P0001';
end $$;

-- Management-only initialization. Invoke from a transient authorized server
-- initializer, never from a browser. It does not infer or create any owner.
-- An idempotent retry preserves existing keys instead of rotating subscriptions.
create or replace function public.wow_push_configure(p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing_key text; project_url text=p_data->>'projectUrl'; stored_origin text; job_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('wow-push-configure'));
  -- The transient management initializer passes its own SUPABASE_URL. No
  -- browser input can choose a URL, token, project or VAPID identity.
  if project_url is null or project_url !~ '^https://[a-z0-9]{20}\.supabase\.co$' then raise exception using message='INVALID_PUSH_CONFIGURATION',errcode='P0001';end if;
  select project_origin into stored_origin from public.wow_push_control where singleton for update;
  if stored_origin is not null and stored_origin<>project_url then raise exception using message='INVALID_PUSH_CONFIGURATION',errcode='P0001';end if;
  select decrypted_secret into existing_key from vault.decrypted_secrets where name='wow_push_vapid_public';
  if existing_key is null then
    if coalesce(p_data->>'publicKey','') !~ '^[A-Za-z0-9_-]{87}$' or coalesce(p_data->>'privateKey','') !~ '^[A-Za-z0-9_-]{43}$' or
      length(coalesce(p_data->>'workerToken','')) not between 32 and 256 then raise exception using message='INVALID_PUSH_CONFIGURATION',errcode='P0001';end if;
    if exists(select 1 from vault.secrets where name in ('wow_push_vapid_private','wow_push_worker_token','wow_push_worker_url','wow_push_vapid_subject')) then raise exception using message='INVALID_PARTIAL_PUSH_CONFIGURATION',errcode='P0001';end if;
    perform vault.create_secret(p_data->>'publicKey','wow_push_vapid_public','WOW Web Push application server public key');
    perform vault.create_secret(p_data->>'privateKey','wow_push_vapid_private','WOW Web Push private signing key; server only');
    perform vault.create_secret(p_data->>'workerToken','wow_push_worker_token','WOW private push worker credential');
    perform vault.create_secret(project_url||'/functions/v1/wow-cloud/push-worker','wow_push_worker_url','WOW private push worker route');
    perform vault.create_secret('https://markrobot.wowfurniture.com.tr','wow_push_vapid_subject','WOW FURNITURE application identity');
    existing_key=p_data->>'publicKey';
  end if;
  if (select count(*) from vault.secrets where name in ('wow_push_vapid_public','wow_push_vapid_private','wow_push_worker_token','wow_push_worker_url','wow_push_vapid_subject'))<>5 then raise exception using message='INVALID_PARTIAL_PUSH_CONFIGURATION',errcode='P0001';end if;
  if exists(select 1 from cron.job where jobname='wow-push-retry' and (command<>'select public.wow_push_wake();' or schedule<>'* * * * *')) then raise exception using message='INVALID_PUSH_CRON_CONFIGURATION',errcode='P0001';end if;
  select cron.schedule('wow-push-retry','* * * * *','select public.wow_push_wake();') into job_id;
  if (select decrypted_secret from vault.decrypted_secrets where name='wow_push_worker_url') is distinct from project_url||'/functions/v1/wow-cloud/push-worker' then raise exception using message='INVALID_PUSH_CONFIGURATION',errcode='P0001';end if;
  update public.wow_push_control set enabled=true,project_origin=project_url,configured_at=coalesce(configured_at,now()) where singleton;
  return jsonb_build_object('configured',true,'publicKey',existing_key,'cronJobId',job_id);
end $$;

do $$ declare t text; begin
  foreach t in array array['wow_push_control','wow_push_subscriptions','wow_push_events','wow_push_jobs'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated',t);
    execute format('grant all on table public.%I to service_role',t);
  end loop;
end $$;
revoke all on sequence public.wow_push_jobs_id_seq from public,anon,authenticated;
grant usage,select on sequence public.wow_push_jobs_id_seq to service_role;
revoke all on function public.wow_push_cancel_subscription(),public.wow_push_account_changed(),public.wow_push_wake(),public.wow_push_queue_wake(),
  public.wow_push_enqueue(uuid,uuid,jsonb,text),public.wow_push_api(text,jsonb),public.wow_push_worker(text,jsonb),public.wow_push_configure(jsonb) from public,anon,authenticated;
grant execute on function public.wow_push_worker(text,jsonb),public.wow_push_configure(jsonb) to service_role;
revoke all on public.wow_push_live_subscriptions from public,anon,authenticated;
grant select on public.wow_push_live_subscriptions to service_role;
revoke all on public.wow_push_active_devices from public,anon,authenticated;
grant select on public.wow_push_active_devices to service_role;
revoke all on function public.wow_push_eligible(text,text[]),public.wow_push_bind_subscription() from public,anon,authenticated;
grant execute on function public.wow_push_eligible(text,text[]) to service_role;
create or replace view public.wow_control_push with(security_invoker=true) as
select w.id workspace_id,w.name,
  (select count(*) from public.wow_push_live_subscriptions s where s.workspace_id=w.id) as active_owner_devices,
  (select count(*) from public.wow_push_events e where e.workspace_id=w.id and e.created_at>now()-interval '24 hours') as events_24h,
  (select count(*) from public.wow_push_jobs j join public.wow_push_events e on e.id=j.event_id where e.workspace_id=w.id and j.status in ('pending','leased')) as pending_deliveries,
  (select count(*) from public.wow_push_jobs j join public.wow_push_events e on e.id=j.event_id where e.workspace_id=w.id and j.status='sent' and j.sent_at>now()-interval '24 hours') as sent_24h,
  (select count(*) from public.wow_push_jobs j join public.wow_push_events e on e.id=j.event_id where e.workspace_id=w.id and j.status in ('failed','dead')) as failed_deliveries
from public.wow_workspaces w;
revoke all on public.wow_control_push from public,anon,authenticated;
grant select on public.wow_control_push to service_role;
comment on table public.wow_push_jobs is 'Durable owner financial notifications. Provider acknowledgements are not proof that the OS displayed a notification. Stable event ids support client duplicate suppression.';
comment on view public.wow_control_push is 'WOW owner device and queue health. No endpoints, encryption secrets or VAPID private material are exposed by this view.';
commit;
