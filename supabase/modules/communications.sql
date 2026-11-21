-- Private transactional correspondence. Apply after gallery, operations and maintenance.
begin;
create schema if not exists wow_mail;
revoke all on schema wow_mail from public,anon,authenticated;
insert into public.wow_permission_catalog(permission,owner_only)
select 'communications.'||cap,false from unnest(array['view','edit','delete','export']) cap on conflict do nothing;

create table if not exists wow_mail.messages(
 id uuid primary key,workspace uuid not null references public.wow_workspaces,
 author uuid not null references public.wow_accounts,source_kind text not null check(source_kind in('company','order')),
 source_id jsonb not null check(jsonb_typeof(source_id) in('number','string')),
 channel text not null check(channel in('email','whatsapp','mail','share')),
 language text not null check(language in('ar','en','tr','fr','ru')),
 subject text not null check(length(subject)<=200),body text not null check(length(body)<=10000 and octet_length(body)<=40000),
 recipient jsonb not null,version bigint not null default 1,
 status text not null default 'draft' check(status in('draft','prepared','queued','sending','retry','accepted','delayed','delivered','bounced','complained','failed','uncertain','cancelled','suppressed')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),archived_at timestamptz,
 approved_by uuid references public.wow_accounts,approved_epoch bigint,approved_at timestamptz,
 send_payload jsonb,send_digest text,provider_id uuid unique,provider_at timestamptz,
 first_attempt_at timestamptz,next_attempt_at timestamptz,attempts int not null default 0,
 lease uuid,lease_until timestamptz,lease_prepared boolean not null default false,last_error text,last_poll_at timestamptz,
 check((lease is null)=(lease_until is null)),check(attempts between 0 and 12)
);
create index if not exists wow_mail_archive on wow_mail.messages(workspace,created_at desc,id) where archived_at is null;
create index if not exists wow_mail_due on wow_mail.messages((coalesce(lease_until,next_attempt_at)),id) where archived_at is null and status in('queued','sending','retry');
create index if not exists wow_mail_limits on wow_mail.messages(workspace,approved_at,approved_by) where approved_at is not null;
create table if not exists wow_mail.receipts(
 workspace uuid not null references public.wow_workspaces,id uuid not null,action text not null,digest text not null,
 target uuid,targets uuid[],created_at timestamptz not null default now(),primary key(workspace,id)
);
create table if not exists wow_mail.templates(
 id uuid primary key,workspace uuid not null references public.wow_workspaces,language text not null check(language in('ar','en','tr','fr','ru')),
 name text not null check(length(name) between 1 and 80),subject text not null check(length(subject)<=200),
 body text not null check(length(body) between 1 and 10000 and octet_length(body)<=40000),version bigint not null default 1,
 deleted boolean not null default false,updated_at timestamptz not null default now()
);
create index if not exists wow_mail_templates_workspace on wow_mail.templates(workspace,language,id) where not deleted;
create table if not exists wow_mail.events(
 id text primary key check(length(id) between 1 and 160),message_id uuid not null references wow_mail.messages,
 kind text not null,observed_at timestamptz not null,received_at timestamptz not null default now()
);
create index if not exists wow_mail_events_message on wow_mail.events(message_id,observed_at desc);
alter table wow_mail.messages enable row level security;
alter table wow_mail.receipts enable row level security;
alter table wow_mail.templates enable row level security;
alter table wow_mail.events enable row level security;
revoke all on all tables in schema wow_mail from public,anon,authenticated;

create or replace function wow_mail.can(ctx jsonb,cap text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(ctx->'account'->>'role'<>'customer' and (ctx->'account'->>'role'='owner' or
 ((ctx->'account'->'permissions') ? cap and (ctx->'account'->'permissions') ? (split_part(cap,'.',1)||'.view'))),false)
$$;
create or replace function wow_mail.email(value text) returns text language sql immutable set search_path='' as $$
 select case when length(btrim(value))<=254 and length(split_part(btrim(value),'@',1))<=64 and
 lower(btrim(value)) ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?[.](?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$'
 and left(split_part(btrim(value),'@',1),1)<>'.' and right(split_part(btrim(value),'@',1),1)<>'.'
 and not exists(select from unnest(string_to_array(split_part(btrim(value),'@',2),'.')) label where length(label)>63 or left(label,1)='-' or right(label,1)='-')
 and strpos(value,'..')=0 and lower(btrim(value)) not like '%.invalid' then lower(btrim(value)) else '' end
$$;
create or replace function wow_mail.phone(value text) returns text language sql immutable set search_path='' as $$
 select case when regexp_replace(value,'[ ().-]','','g') ~ '^\+[1-9][0-9]{7,14}$'
 then regexp_replace(value,'[ ().-]','','g') else '' end
$$;
create or replace function wow_mail.source(ctx jsonb,kind text,kid jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare w uuid=(ctx->>'workspaceId')::uuid;p jsonb;o public.wow_gallery_orders;a public.wow_accounts;contact jsonb;enrolled boolean=false;
begin
 if kind='company' then
  if not wow_mail.can(ctx,'customers.view') then raise exception using message='ACCESS_DENIED';end if;
  select r.payload into p from public.wow_records r where r.workspace_id=w and r.store='companies' and r.record_id=kid and r.deleted_at is null;
  if p is null then raise exception using message='INVALID_RECIPIENT';end if;
  return jsonb_build_object('kind',kind,'id',kid,'name',left(coalesce(nullif(p->>'buyerName',''),p->>'name',''),100),
   'company',left(coalesce(p->>'name',''),150),'email',wow_mail.email(p->>'email'),'phone',wow_mail.phone(p->>'phone'),'order','','status','');
 elsif kind='order' then
  if not wow_mail.can(ctx,'orders.view') then raise exception using message='ACCESS_DENIED';end if;
  select * into o from public.wow_gallery_orders where workspace_id=w and to_jsonb(id::text)=kid;
  if o.id is null then raise exception using message='INVALID_RECIPIENT';end if;
  select * into a from public.wow_accounts where id=o.account_id and workspace_id=w and status='active' and (expires_at is null or expires_at>now());
  if a.id is null then raise exception using message='INVALID_RECIPIENT';end if;
  if to_regprocedure('wow_customer.contact(uuid)') is not null then
   execute 'select wow_customer.contact($1),exists(select from wow_customer.profiles where account_id=$1)' into contact,enrolled using a.id;
  end if;
  -- A profile-backed customer must pass its authoritative contact helper. An
  -- ineligible registered principal cannot regain contact rights via the legacy path.
  if contact is null and not enrolled then
   select jsonb_build_object('name',a.name,'company','','phone','','email',wow_mail.email(a.login_email)) into contact
    from auth.users u where u.id=a.id and u.email_confirmed_at is not null and lower(u.email)=lower(a.login_email)
    and not coalesce(u.is_anonymous,false) and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now());
  end if;
  return jsonb_build_object('kind',kind,'id',kid,'name',left(coalesce(contact->>'name',o.customer_name),100),
   'company',left(coalesce(contact->>'company',''),150),'email',wow_mail.email(contact->>'email'),'phone',wow_mail.phone(contact->>'phone'),
   'order',o.number,'status',o.status);
 else raise exception using message='INVALID_RECIPIENT';end if;
end $$;
create or replace function wow_mail.visible(ctx jsonb,m wow_mail.messages) returns boolean
language sql stable set search_path='' as $$
 select m.workspace=(ctx->>'workspaceId')::uuid and wow_mail.can(ctx,'communications.view') and
 wow_mail.can(ctx,case m.source_kind when 'company' then 'customers.view' else 'orders.view' end)
$$;
create or replace function wow_mail.item(m wow_mail.messages,full_body boolean default true) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',m.id,'source',jsonb_build_object('kind',m.source_kind,'id',m.source_id),
 'channel',m.channel,'language',m.language,'subject',m.subject,'body',case when full_body then m.body else left(m.body,180) end,
 'recipient',m.recipient,'version',m.version,'status',m.status,'createdAt',m.created_at,'updatedAt',m.updated_at,
 'providerAt',m.provider_at,'attempts',m.attempts,'error',m.last_error,'deleted',m.archived_at is not null)
$$;
create or replace function wow_mail.authorized(m wow_mail.messages) returns boolean
language plpgsql stable set search_path='' as $$
declare a public.wow_accounts;ctx jsonb;fresh jsonb;
begin
 select * into a from public.wow_accounts where id=m.approved_by and workspace_id=m.workspace and status='active'
  and session_version=m.approved_epoch and (expires_at is null or expires_at>now());
 if a.id is null or not exists(select from auth.users u where u.id=a.id and u.deleted_at is null
  and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=now())) then return false;end if;
 ctx=jsonb_build_object('workspaceId',m.workspace,'account',public.wow_profile(a));
 if not wow_mail.can(ctx,'communications.export') or not wow_mail.can(ctx,'communications.edit') then return false;end if;
 begin fresh=wow_mail.source(ctx,m.source_kind,m.source_id);exception when others then return false;end;
 return coalesce(fresh->>'email','')<>'' and fresh->>'email'=m.recipient->>'email';
end $$;

create or replace function public.wow_communications_service(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare uid uuid=(p_data->>'userId')::uuid;sid uuid=(p_data->>'sessionId')::uuid;ctx jsonb;w uuid;
 a text=replace(p_action,'communications.','');m wow_mail.messages;prev wow_mail.receipts;tm wow_mail.templates;
 command uuid=(p_data->>'commandId')::uuid;kid uuid=(p_data->>'id')::uuid;recipient jsonb;result jsonb;items jsonb;
 input jsonb=p_data-array['userId','sessionId','commandId','providerFrom'];fingerprint text;cap text;reading boolean;
 page_size int=least(50,greatest(1,coalesce((p_data->>'limit')::int,25)));page_offset int=greatest(0,coalesce((p_data->>'offset')::int,0));
 search text=coalesce(p_data->>'search','');row record;ids uuid[];target uuid;payload jsonb;
begin
 reading=a in('status','contacts','recipient','list','detail','templates','poll.prepare');
 ctx=public.wow_actor(uid,sid,null,true,not reading);w=(ctx->>'workspaceId')::uuid;
 cap=case when reading then 'view' when a in('delete','template.delete','cancel') then 'delete' when a in('send','prepare') then 'export' else 'edit' end;
 if not wow_mail.can(ctx,'communications.'||cap) then raise exception using message='ACCESS_DENIED';end if;
 if a='status' then return jsonb_build_object('pending',(select count(*) from wow_mail.messages x where x.workspace=w and x.archived_at is null and x.status in('queued','sending','retry') and wow_mail.visible(ctx,x)));end if;
 if a='recipient' then return jsonb_build_object('contact',wow_mail.source(ctx,p_data->'source'->>'kind',p_data->'source'->'id'));end if;
 if a='contacts' then
  items='[]';
  if p_data->>'kind'='company' and wow_mail.can(ctx,'customers.view') then
   for row in select r.record_id from public.wow_records r where r.workspace_id=w and r.store='companies' and r.deleted_at is null
     and (search='' or coalesce(r.payload->>'name','') ilike '%'||search||'%' or coalesce(r.payload->>'buyerName','') ilike '%'||search||'%')
     order by r.payload->>'name',r.record_id limit page_size+1 offset page_offset loop
     items=items||jsonb_build_array(wow_mail.source(ctx,'company',row.record_id));end loop;
  elsif p_data->>'kind'='order' and wow_mail.can(ctx,'orders.view') then
   for row in select o.id from public.wow_gallery_orders o join public.wow_accounts x on x.id=o.account_id and x.workspace_id=w and x.status='active' and (x.expires_at is null or x.expires_at>now())
     where o.workspace_id=w and (search='' or o.number ilike '%'||search||'%' or o.customer_name ilike '%'||search||'%')
     order by o.created_at desc,o.id limit page_size+1 offset page_offset loop
     items=items||jsonb_build_array(wow_mail.source(ctx,'order',to_jsonb(row.id::text)));end loop;
  else raise exception using message='ACCESS_DENIED';end if;
  return jsonb_build_object('items',case when jsonb_array_length(items)>page_size then items-page_size else items end,'more',jsonb_array_length(items)>page_size);
 end if;
 if a='list' then
  select coalesce(jsonb_agg(v),'[]') into items from (select wow_mail.item(x,false) v from wow_mail.messages x where x.workspace=w and x.archived_at is null
    and wow_mail.visible(ctx,x) and (coalesce(p_data->>'channel','')='' or x.channel=p_data->>'channel') and
    (coalesce(p_data->>'status','')='' or x.status=p_data->>'status') and
    (search='' or x.subject ilike '%'||search||'%' or x.body ilike '%'||search||'%' or x.recipient->>'name' ilike '%'||search||'%' or x.recipient->>'company' ilike '%'||search||'%')
    order by x.created_at desc,x.id limit page_size+1 offset page_offset) q;
  return jsonb_build_object('items',case when jsonb_array_length(items)>page_size then items-page_size else items end,'more',jsonb_array_length(items)>page_size);
 end if;
 if a='templates' then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'subject',subject,'body',body,'language',language,'version',version) order by name,id),'[]') into items
    from wow_mail.templates where workspace=w and not deleted;
  return jsonb_build_object('items',items);
 end if;
 if a='detail' or a='poll.prepare' then
  select * into m from wow_mail.messages where id=kid and workspace=w;
  if m.id is null or m.archived_at is not null or not wow_mail.visible(ctx,m) then raise exception using message='ACCESS_DENIED';end if;
  if a='detail' then return jsonb_build_object('message',wow_mail.item(m));end if;
  if m.provider_id is null then return jsonb_build_object('message',wow_mail.item(m));end if;
  if m.last_poll_at>now()-interval '30 seconds' then raise exception using message='RATE_LIMITED';end if;
  update wow_mail.messages set last_poll_at=now() where id=m.id;
  return jsonb_build_object('message',wow_mail.item(m),'providerId',m.provider_id,'workspace',w,'digest',m.send_digest);
 end if;
 if command is null then raise exception using message='INVALID_COMMAND_ID';end if;
 fingerprint=encode(extensions.digest(convert_to(input::text,'UTF8'),'sha256'),'hex');
 select * into prev from wow_mail.receipts where workspace=w and id=command;
 if prev.id is not null then
  if prev.action<>a or prev.digest<>fingerprint then raise exception using message='IDEMPOTENCY_MISMATCH';end if;
  if prev.target is not null and a not like 'template.%' then
   select * into m from wow_mail.messages where id=prev.target and workspace=w;
   if not wow_mail.visible(ctx,m) then raise exception using message='ACCESS_DENIED';end if;
   return jsonb_build_object('message',wow_mail.item(m),'replayed',true);
  end if;
  return jsonb_build_object('id',prev.target,'ids',to_jsonb(prev.targets),'replayed',true);
 end if;
 if a in('template.save','template.delete') then
  select * into tm from wow_mail.templates where id=kid;
  if tm.id is not null and tm.workspace<>w then raise exception using message='ACCESS_DENIED';end if;
  if coalesce(tm.version,0)<>(p_data->>'version')::bigint or tm.deleted then raise exception using message='CONFLICT';end if;
  if a='template.delete' then
   if tm.id is null then raise exception using message='INVALID_TEMPLATE';end if;
   update wow_mail.templates set deleted=true,subject='',body='',version=version+1,updated_at=now() where id=kid;
  else
   if tm.id is null and (select count(*) from wow_mail.templates where workspace=w and not deleted)>=40 then raise exception using message='INVALID_TEMPLATE_LIMIT';end if;
   insert into wow_mail.templates(id,workspace,language,name,subject,body) values(kid,w,p_data->>'language',p_data->>'name',p_data->>'subject',p_data->>'body')
   on conflict(id) do update set language=excluded.language,name=excluded.name,subject=excluded.subject,body=excluded.body,version=wow_mail.templates.version+1,updated_at=now();
  end if;
  target=kid;result=jsonb_build_object('id',kid);
 elsif a='save' then
  select * into m from wow_mail.messages where id=kid for update;
  if m.id is not null and (m.workspace<>w or not wow_mail.visible(ctx,m)) then raise exception using message='ACCESS_DENIED';end if;
  if coalesce(m.version,0)<>(p_data->>'version')::bigint or m.archived_at is not null or m.status not in('draft','prepared') then raise exception using message='CONFLICT';end if;
  recipient=wow_mail.source(ctx,p_data->'source'->>'kind',p_data->'source'->'id');
  if m.id is null and (select count(*) from wow_mail.messages where workspace=w and archived_at is null)>=100000 then raise exception using message='INVALID_ARCHIVE_LIMIT';end if;
  insert into wow_mail.messages(id,workspace,author,source_kind,source_id,channel,language,subject,body,recipient)
   values(kid,w,uid,p_data->'source'->>'kind',p_data->'source'->'id',p_data->>'channel',p_data->>'language',p_data->>'subject',p_data->>'body',recipient)
   on conflict(id) do update set source_kind=excluded.source_kind,source_id=excluded.source_id,channel=excluded.channel,language=excluded.language,
    subject=excluded.subject,body=excluded.body,recipient=excluded.recipient,status='draft',version=wow_mail.messages.version+1,updated_at=now();
  target=kid;
 elsif a in('send','prepare','cancel') then
  select * into m from wow_mail.messages where id=kid and workspace=w for update;
  if m.id is null or m.archived_at is not null or not wow_mail.visible(ctx,m) then raise exception using message='ACCESS_DENIED';end if;
  if m.version<>(p_data->>'version')::bigint then raise exception using message='CONFLICT';end if;
  if a='cancel' then
   if m.status not in('queued','retry') or m.attempts>0 then raise exception using message='INVALID_CANCELLATION';end if;
   update wow_mail.messages set status='cancelled',version=version+1,updated_at=now() where id=kid;
  else
   if not wow_mail.can(ctx,'communications.edit') or m.status not in('draft','prepared') or m.body='' then raise exception using message='ACCESS_DENIED';end if;
   recipient=wow_mail.source(ctx,m.source_kind,m.source_id);
   if recipient->>'email' is distinct from m.recipient->>'email' or recipient->>'phone' is distinct from m.recipient->>'phone' then raise exception using message='INVALID_RECIPIENT_CHANGED';end if;
   if m.channel in('email','mail') and coalesce(recipient->>'email','')='' or m.channel='whatsapp' and coalesce(recipient->>'phone','')='' then raise exception using message='INVALID_RECIPIENT_CONTACT';end if;
   if a='prepare' then
    if m.channel='email' then raise exception using message='INVALID_CHANNEL';end if;
    update wow_mail.messages set status='prepared',version=version+1,updated_at=now() where id=kid;
   else
    if m.channel<>'email' or p_data->>'providerFrom'<>'WOW FURNITURE <info@wowfurniture.com.tr>' then raise exception using message='INVALID_EMAIL_CONFIG';end if;
    if (select count(*) from wow_mail.messages where workspace=w and approved_at>now()-interval '24 hours')>=100 or
       (select count(*) from wow_mail.messages where workspace=w and approved_by=uid and approved_at>now()-interval '1 hour')>=20 then raise exception using message='RATE_LIMITED';end if;
    payload=jsonb_build_object('from',p_data->>'providerFrom','to',jsonb_build_array(recipient->>'email'),'subject',m.subject,'text',m.body);
    update wow_mail.messages set status='queued',approved_by=uid,approved_epoch=(ctx->'account'->>'sessionVersion')::bigint,approved_at=now(),
     send_payload=payload,send_digest=encode(extensions.digest(convert_to(payload::text,'UTF8'),'sha256'),'hex'),next_attempt_at=now(),version=version+1,updated_at=now() where id=kid;
   end if;
  end if;
  target=kid;
 elsif a='delete' then
  select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_data->'ids');
  if coalesce(array_length(ids,1),0) not between 1 and 50 then raise exception using message='INVALID_MESSAGE_IDS';end if;
  if (select count(*) from wow_mail.messages x where x.id=any(ids) and x.workspace=w and wow_mail.visible(ctx,x))<>array_length(ids,1) then raise exception using message='ACCESS_DENIED';end if;
  if exists(select from wow_mail.messages where id=any(ids) and lease_until>now()) then raise exception using message='CONFLICT';end if;
  update wow_mail.messages set archived_at=coalesce(archived_at,now()),subject='',body='',recipient='{}',send_payload=null,
   status=case when status in('queued','sending','retry') then case when attempts>0 then 'uncertain' else 'cancelled' end else status end,
   lease=null,lease_until=null,version=version+1,updated_at=now() where id=any(ids);
  result=jsonb_build_object('ids',to_jsonb(ids));
 else raise exception using message='INVALID_COMMUNICATION_ACTION';end if;
 insert into wow_mail.receipts(workspace,id,action,digest,target,targets) values(w,command,a,fingerprint,target,ids);
 if target is not null and a not like 'template.%' then select * into m from wow_mail.messages where id=target;result=jsonb_build_object('message',wow_mail.item(m));end if;
 return result;
end $$;

create or replace function public.wow_communications_worker(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare m wow_mail.messages;candidate record;items jsonb='[]';lease_id uuid;fresh jsonb;event_id text;event_status text;observed timestamptz;accepted_id uuid;
begin
 if p_action='claim' then
  for candidate in select x.id from wow_mail.messages x join public.wow_workspaces w on w.id=x.workspace
    left join wow_ops.settings s on s.workspace_id=w.id where w.status='active' and coalesce(s.enabled,true)
    and x.archived_at is null and x.status in('queued','sending','retry') and coalesce(x.lease_until,x.next_attempt_at)<=now()
    and (p_data->>'id' is null or x.id=(p_data->>'id')::uuid)
    order by coalesce(x.lease_until,x.next_attempt_at),x.id for update of x skip locked limit 6 loop
   lease_id=gen_random_uuid();update wow_mail.messages set lease=lease_id,lease_until=now()+interval '90 seconds',lease_prepared=false where id=candidate.id;
   items=items||jsonb_build_array(jsonb_build_object('id',candidate.id,'lease',lease_id));
  end loop;return jsonb_build_object('jobs',items);
 elsif p_action in('prepare','finish') then
  select * into m from wow_mail.messages where id=(p_data->>'id')::uuid;
  if m.id is null then return jsonb_build_object('status','gone');end if;
  perform 1 from public.wow_workspaces where id=m.workspace for update;
  select * into m from wow_mail.messages where id=m.id for update;
  if m.lease is distinct from (p_data->>'lease')::uuid or m.lease is null then return jsonb_build_object('status','gone');end if;
  if p_action='prepare' then
   if m.lease_until<=now() or m.lease_prepared or m.archived_at is not null or m.status not in('queued','sending','retry') then return jsonb_build_object('status','gone');end if;
   if not exists(select from public.wow_workspaces where id=m.workspace and status='active') or exists(select from wow_ops.settings where workspace_id=m.workspace and not enabled) then
    update wow_mail.messages set lease=null,lease_until=null,next_attempt_at=now()+interval '5 minutes' where id=m.id;return jsonb_build_object('status','paused');end if;
   if not wow_mail.authorized(m) then
    update wow_mail.messages set status=case when attempts>0 then 'uncertain' else 'cancelled' end,last_error='AUTHORIZATION_CHANGED',lease=null,lease_until=null,updated_at=now() where id=m.id;
    return jsonb_build_object('status','cancelled');end if;
   if m.attempts>=6 or m.first_attempt_at<now()-interval '23 hours' then
    update wow_mail.messages set status='uncertain',last_error='DELIVERY_UNCERTAIN',lease=null,lease_until=null,updated_at=now() where id=m.id;
    return jsonb_build_object('status','uncertain');end if;
   update wow_mail.messages set status='sending',lease_prepared=true,first_attempt_at=coalesce(first_attempt_at,now()),attempts=attempts+1,updated_at=now() where id=m.id;
   return jsonb_build_object('status','ready','id',m.id,'workspace',m.workspace,'payload',m.send_payload,'digest',m.send_digest,'idempotencyKey','wow-mail/'||m.workspace::text||'/'||m.id::text);
  end if;
  if m.archived_at is not null or m.status not in('sending','retry','queued') then return jsonb_build_object('status','gone');end if;
  if p_data->>'outcome'='accepted' then
   accepted_id=(p_data->>'providerId')::uuid;if accepted_id is null then raise exception using message='INVALID_PROVIDER_RECEIPT';end if;
   if m.provider_id is not null and m.provider_id<>accepted_id then raise exception using message='INVALID_PROVIDER_RECEIPT';end if;
   update wow_mail.messages set provider_id=accepted_id,status='accepted',lease=null,lease_until=null,last_error=null,updated_at=now() where id=m.id;
  elsif p_data->>'outcome'='retry' then
   update wow_mail.messages set status=case when attempts>=6 or first_attempt_at<now()-interval '23 hours' then 'uncertain' else 'retry' end,
    next_attempt_at=now()+make_interval(secs=>least(3600,30*(2^attempts)::int)),last_error='PROVIDER_UNAVAILABLE',lease=null,lease_until=null,updated_at=now() where id=m.id;
  elsif p_data->>'outcome'='failed' then
   update wow_mail.messages set status='failed',last_error='PROVIDER_REJECTED',lease=null,lease_until=null,updated_at=now() where id=m.id;
  else raise exception using message='INVALID_PROVIDER_OUTCOME';end if;
  select * into m from wow_mail.messages where id=m.id;return jsonb_build_object('status',m.status);
 elsif p_action='event' then
  event_id=p_data->>'eventId';event_status=p_data->>'status';observed=(p_data->>'at')::timestamptz;accepted_id=(p_data->>'providerId')::uuid;
  if length(event_id) not between 1 and 160 or event_status not in('accepted','delayed','delivered','bounced','complained','failed','suppressed') or observed>now()+interval '5 minutes' then raise exception using message='INVALID_PROVIDER_EVENT';end if;
  select * into m from wow_mail.messages where id=(p_data->>'id')::uuid and workspace=(p_data->>'workspace')::uuid for update;
  if m.id is null or m.channel<>'email' or m.approved_at is null or m.send_digest is distinct from p_data->>'digest' or
    (m.provider_id is not null and m.provider_id<>accepted_id) then return jsonb_build_object('ok',true);end if;
  if m.archived_at is null and (m.recipient->>'email' is distinct from p_data->>'to' or p_data->>'from'<>'WOW FURNITURE <info@wowfurniture.com.tr>') then return jsonb_build_object('ok',true);end if;
  if exists(select from wow_mail.events where id=event_id) then return jsonb_build_object('ok',true);end if;
  insert into wow_mail.events(id,message_id,kind,observed_at) values(event_id,m.id,event_status,observed);
  -- A late accepted/delayed event cannot erase a delivery or permanent failure.
  if (m.provider_at is null or observed>=m.provider_at) and not (m.status in('delivered','bounced','complained','failed','suppressed') and event_status in('accepted','delayed')) then
   update wow_mail.messages set provider_id=accepted_id,status=event_status,provider_at=observed,lease=null,lease_until=null,last_error=null,updated_at=now() where id=m.id;
  elsif m.provider_id is null then update wow_mail.messages set provider_id=accepted_id where id=m.id;end if;
  delete from wow_mail.events where message_id=m.id and id in(select id from wow_mail.events where message_id=m.id order by observed_at desc,id offset 32);
  return jsonb_build_object('ok',true);
 else raise exception using message='INVALID_COMMUNICATION_ACTION';end if;
end $$;

alter table public.wow_push_control add column if not exists mail_last_wake_at timestamptz;
create or replace function public.wow_communications_wake() returns bigint
language plpgsql security definer set search_path='' as $$
declare worker record;request_id bigint;
begin
 if not exists(select from wow_mail.messages m join public.wow_workspaces w on w.id=m.workspace
  left join wow_ops.settings s on s.workspace_id=w.id where m.archived_at is null and m.status in('queued','sending','retry')
  and coalesce(m.lease_until,m.next_attempt_at)<=now() and w.status='active' and coalesce(s.enabled,true)) then return null;end if;
 select * into worker from wow_ops.storage_worker();if worker.endpoint is null then return null;end if;
 update public.wow_push_control set mail_last_wake_at=clock_timestamp() where singleton and (mail_last_wake_at is null or mail_last_wake_at<clock_timestamp()-interval '45 seconds');
 if not found then return null;end if;
 select net.http_post(url:=worker.endpoint,headers:=jsonb_build_object('Content-Type','application/json','X-Wow-Worker-Token',worker.worker_token),body:='{}'::jsonb,timeout_milliseconds:=120000) into request_id;
 return request_id;
end $$;
revoke all on all functions in schema wow_mail from public,anon,authenticated;
revoke all on function public.wow_communications_service(text,jsonb),public.wow_communications_worker(text,jsonb),public.wow_communications_wake() from public,anon,authenticated;
grant execute on function public.wow_communications_service(text,jsonb),public.wow_communications_worker(text,jsonb),public.wow_communications_wake() to service_role;
select cron.schedule('wow-customer-correspondence','* * * * *','select public.wow_communications_wake();');
commit;
