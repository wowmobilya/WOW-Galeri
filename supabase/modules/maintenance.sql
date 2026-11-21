-- Apply after gallery, files, chat, operations and notifications.
begin;
alter table wow_ops.settings add column if not exists storage_last_scan_at timestamptz;
alter table public.wow_push_control add column if not exists storage_last_wake_at timestamptz;
alter table wow_collab.chat_assets add column if not exists storage_next_review timestamptz not null default '-infinity';
alter table public.wow_gallery_assets add column if not exists storage_next_review timestamptz not null default '-infinity';

create table if not exists wow_ops.storage_jobs (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.wow_workspaces,
 source text not null check(source in ('files','chat','gallery')), object_id uuid not null,
 next_attempt_at timestamptz not null default now(), lease_token uuid, lease_until timestamptz,
 attempts integer not null default 0 check(attempts>=0), completed_at timestamptz,
 last_error text check(last_error in ('STORAGE_UNAVAILABLE','OBJECT_PRESENT','OBJECT_PROTECTED')),
 unique(source,object_id), check((lease_token is null)=(lease_until is null))
);
alter table wow_ops.storage_jobs enable row level security;
revoke all on wow_ops.storage_jobs from public,anon,authenticated;
create index if not exists wow_storage_due on wow_ops.storage_jobs(workspace_id,(coalesce(lease_until,next_attempt_at)),id) where completed_at is null;
create index if not exists wow_storage_completed on wow_ops.storage_jobs(workspace_id,completed_at) where completed_at is not null;
create index if not exists wow_storage_file_pending on wow_collab.files(workspace_id,created_at,id) where state='pending';
create index if not exists wow_storage_file_trash on wow_collab.files(workspace_id,created_at,id) where state='trash';
create index if not exists wow_storage_chat_review on wow_collab.chat_assets(workspace_id,storage_next_review,created_at,id) where state in ('pending','ready');
create index if not exists wow_storage_chat_trash on wow_collab.chat_assets(workspace_id,created_at,id) where state='trash';
create index if not exists wow_storage_gallery_review on public.wow_gallery_assets(workspace_id,storage_next_review,(coalesce(touched_at,created_at)),id) where lifecycle='active';
create index if not exists wow_storage_gallery_trash on public.wow_gallery_assets(workspace_id,created_at,id) where lifecycle='trash';
create index if not exists wow_storage_gallery_media on public.wow_records(workspace_id,(payload->>'storagePath'))
 where store='media' and deleted_at is null and strpos(payload->>'storagePath','/gallery/')>0;
create index if not exists wow_storage_chat_avatar on wow_collab.profiles(avatar) where avatar is not null;
create index if not exists wow_storage_room_avatar on wow_collab.rooms(avatar) where avatar is not null and active;
create index if not exists wow_storage_wallpaper on wow_collab.members(wallpaper_asset,room_id) where wallpaper_asset is not null and state='active';

create or replace function wow_ops.chat_asset_referenced(asset_id uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select from wow_collab.messages m where m.asset_id=$1 and not m.deleted)
  or exists(select from wow_collab.profiles p where p.avatar=$1)
  or exists(select from wow_collab.rooms r where r.avatar=$1 and r.active)
  or exists(select from wow_collab.members m join wow_collab.rooms r on r.id=m.room_id
    where m.wallpaper_asset=$1 and m.state='active' and r.active)
$$;
create or replace function wow_ops.gallery_asset_referenced(a public.wow_gallery_assets) returns boolean
language sql stable set search_path='' as $$
 select exists(select from public.wow_gallery_presentation p where p.workspace_id=a.workspace_id
    and public.wow_gallery_image_ids(p.value) @> array[a.id::text])
  or exists(select from public.wow_gallery_print_profiles p where p.workspace_id=a.workspace_id
    and public.wow_gallery_image_ids(p.value) @> array[a.id::text])
  or exists(select from public.wow_gallery_lines l where l.image_path=a.path)
  or exists(select from public.wow_records m where m.workspace_id=a.workspace_id and m.store='media' and m.deleted_at is null
    and strpos(m.payload->>'storagePath','/gallery/')>0 and m.payload->>'storagePath'=a.path)
$$;

-- The caller holds the same workspace row lock used by all actor transactions.
-- References are tested on bounded candidate pages. Protected rows are rotated
-- out of the page for a day so old live media cannot starve later candidates.
create or replace function wow_ops.storage_scan(wid uuid) returns void
language plpgsql set search_path='' as $$
begin
 update wow_collab.files f set state='trash' where f.id in (
   select q.id from wow_collab.files q where q.workspace_id=wid and q.state='pending'
    and q.created_at<=now()-interval '1 day' and coalesce(q.upload_until,q.created_at)<=now()
   order by q.created_at,q.id limit 30);

 with expired as (
   select m.id from wow_collab.messages m join wow_collab.rooms r on r.id=m.room_id
    where r.workspace_id=wid and not m.deleted and m.expires_at<=now() order by m.expires_at,m.id limit 250
 ), closed_room as (
   select m.id from wow_collab.rooms r join wow_collab.messages m on m.room_id=r.id
    where r.workspace_id=wid and not r.active and not m.deleted order by m.id limit 250
 ), page as (select id from (select id from expired union select id from closed_room) dead order by id limit 250)
 update wow_collab.messages m set deleted=true,text_body='',asset_id=null,mentions='{}' from page where page.id=m.id;
 delete from wow_collab.chat_notifications n where (n.message_id,n.recipient_id) in (
   select q.message_id,q.recipient_id from wow_collab.chat_notifications q where q.workspace_id=wid
   and q.created_at<now()-interval '1 day' order by q.created_at,q.message_id,q.recipient_id limit 100);

 with page as materialized (
   select a.id,wow_ops.chat_asset_referenced(a.id) as protected from wow_collab.chat_assets a
   where a.workspace_id=wid and a.state in ('pending','ready') and a.storage_next_review<=now()
     and (a.linked or a.created_at<=now()-interval '1 day') and coalesce(a.upload_until,a.created_at)<=now()
   order by a.storage_next_review,a.created_at,a.id limit 30)
 update wow_collab.chat_assets a set state=case when page.protected then a.state else 'trash' end,
   storage_next_review=now()+interval '1 day' from page where a.id=page.id;
 with page as materialized (
   select a.id,wow_ops.gallery_asset_referenced(a) as protected from public.wow_gallery_assets a
   where a.workspace_id=wid and a.lifecycle='active' and a.storage_next_review<=now()
     and coalesce(a.touched_at,a.created_at)<=now()-(case when a.ready then interval '7 days' else interval '1 day' end)
   order by a.storage_next_review,coalesce(a.touched_at,a.created_at),a.id limit 30)
 update public.wow_gallery_assets a set lifecycle=case when page.protected then 'active' else 'trash' end,
   storage_next_review=now()+interval '1 day' from page where a.id=page.id;

 -- Include existing trash left by an interrupted client. An outstanding job
 -- or acknowledged tombstone can never generate a second object identity.
 insert into wow_ops.storage_jobs(workspace_id,source,object_id)
 select wid,'files',f.id from wow_collab.files f where f.workspace_id=wid and f.state='trash'
   and not exists(select from wow_ops.storage_jobs j where j.source='files' and j.object_id=f.id)
 order by f.created_at,f.id limit 30 on conflict(source,object_id) do nothing;
 insert into wow_ops.storage_jobs(workspace_id,source,object_id)
 select wid,'chat',a.id from wow_collab.chat_assets a where a.workspace_id=wid and a.state='trash'
   and not exists(select from wow_ops.storage_jobs j where j.source='chat' and j.object_id=a.id)
 order by a.created_at,a.id limit 30 on conflict(source,object_id) do nothing;
 insert into wow_ops.storage_jobs(workspace_id,source,object_id)
 select wid,'gallery',a.id from public.wow_gallery_assets a where a.workspace_id=wid and a.lifecycle='trash'
   and not exists(select from wow_ops.storage_jobs j where j.source='gallery' and j.object_id=a.id)
 order by a.created_at,a.id limit 30 on conflict(source,object_id) do nothing;
 delete from wow_ops.storage_jobs j where j.id in(select q.id from wow_ops.storage_jobs q
   where q.workspace_id=wid and q.completed_at<now()-interval '7 days' order by q.completed_at limit 100);
 update wow_ops.settings set storage_last_scan_at=now() where workspace_id=wid;
end $$;

-- Object addresses come only from immutable, typed application rows. Legacy
-- gallery path corruption fails closed and never grants quota credit.
create or replace function wow_ops.storage_target(j wow_ops.storage_jobs)
returns table(state text,path text,protected boolean) language sql stable set search_path='' as $$
 select f.state,wow_collab.file_path(f),false from wow_collab.files f
  where j.source='files' and f.id=j.object_id and f.workspace_id=j.workspace_id
 union all
 select a.state,wow_collab.asset_path(a),wow_ops.chat_asset_referenced(a.id) from wow_collab.chat_assets a
  where j.source='chat' and a.id=j.object_id and a.workspace_id=j.workspace_id
 union all
 select a.lifecycle,case when a.path=public.wow_gallery_object_path(a.workspace_id,a.account_id,a.id,a.content_type) then a.path end,
  wow_ops.gallery_asset_referenced(a) from public.wow_gallery_assets a
  where j.source='gallery' and a.id=j.object_id and a.workspace_id=j.workspace_id
$$;

create or replace function public.wow_storage_maintenance(p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='2s' as $$
declare
 work record; workspaces uuid[]='{}'; result jsonb; j wow_ops.storage_jobs; target record;
 allowed boolean; wid uuid; outcome text; retry_code text;
begin
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'INVALID_MAINTENANCE_INPUT';end if;
 if p_action='claim' then
  if p_data<>'{}'::jsonb then raise exception 'INVALID_MAINTENANCE_INPUT';end if;
  if not pg_try_advisory_xact_lock(hashtextextended('wow-storage-maintenance',0)) then return '{"jobs":[]}'::jsonb;end if;
  for work in select w.id,s.storage_last_scan_at from public.wow_workspaces w left join wow_ops.settings s on s.workspace_id=w.id
   where w.status='active' and coalesce(s.enabled,true) and (s.storage_last_scan_at is null or s.storage_last_scan_at<=now()-interval '9 minutes'
    or exists(select from wow_ops.storage_jobs q where q.workspace_id=w.id and q.completed_at is null and coalesce(q.lease_until,q.next_attempt_at)<=now()))
   order by s.storage_last_scan_at nulls first,w.id limit 4 for update of w skip locked loop
   -- A settings edit may have just committed while this query acquired w.
   if exists(select from wow_ops.settings where workspace_id=work.id and not enabled) then continue;end if;
   workspaces=array_append(workspaces,work.id);
   if work.storage_last_scan_at is null or work.storage_last_scan_at<=now()-interval '9 minutes' then
    insert into wow_ops.settings(workspace_id) values(work.id) on conflict do nothing;
    perform wow_ops.storage_scan(work.id);
   end if;
  end loop;
  with page as (
   select q.id from wow_ops.storage_jobs q where q.workspace_id=any(workspaces) and q.completed_at is null
    and coalesce(q.lease_until,q.next_attempt_at)<=now() order by coalesce(q.lease_until,q.next_attempt_at),q.id limit 12 for update skip locked
  ), claimed as (
   update wow_ops.storage_jobs q set lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=least(q.attempts,1000000)+1
   from page where q.id=page.id returning q.id,q.lease_token)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'lease',lease_token)),'[]') into result from claimed;
  return jsonb_build_object('jobs',result);
 end if;
 if p_action not in ('prepare','finish') or p_action is null or not (p_data ?& array['id','lease']) or
   (p_action='prepare' and p_data-array['id','lease']<>'{}'::jsonb) or
   (p_action='finish' and (p_data-array['id','lease','outcome','path']<>'{}'::jsonb or not (p_data ?& array['outcome','path'])
      or coalesce(p_data->>'outcome','') not in ('removed','retry') or jsonb_typeof(p_data->'path')<>'string'))
   then raise exception 'INVALID_MAINTENANCE_INPUT';end if;
 select q.workspace_id into wid from wow_ops.storage_jobs q where q.id=(p_data->>'id')::uuid;
 if wid is null then return '{"status":"gone"}'::jsonb;end if;
 -- Keep the lock order consistent with claim and the owner settings operation.
 perform 1 from public.wow_workspaces where id=wid for update;
 select w.status='active' and coalesce(s.enabled,true) into allowed from public.wow_workspaces w
  left join wow_ops.settings s on s.workspace_id=w.id where w.id=wid;
 select * into j from wow_ops.storage_jobs q where q.id=(p_data->>'id')::uuid for update;
 if j.id is null or j.completed_at is not null then return '{"status":"gone"}'::jsonb;end if;
 if j.lease_token is null or j.lease_token is distinct from (p_data->>'lease')::uuid or j.lease_until<=now() then raise exception 'INVALID_STORAGE_LEASE';end if;
 if not coalesce(allowed,false) then
  update wow_ops.storage_jobs set lease_token=null,lease_until=null,next_attempt_at=now()+interval '10 minutes' where id=j.id;
  return '{"status":"paused"}'::jsonb;
 end if;
 select * into target from wow_ops.storage_target(j);
 if target.state='removed' then
  -- The interactive client completed the same exact object during this lease.
  delete from wow_ops.storage_jobs where id=j.id;
  return '{"status":"gone"}'::jsonb;
 end if;
 if target.state is distinct from 'trash' or target.path is null or target.protected then
  update wow_ops.storage_jobs set lease_token=null,lease_until=null,next_attempt_at=now()+interval '6 hours',last_error='OBJECT_PROTECTED' where id=j.id;
  return '{"status":"blocked"}'::jsonb;
 end if;
 if p_action='prepare' then return jsonb_build_object('status','ready','path',target.path);end if;
 if p_data->>'path' is distinct from target.path then raise exception 'INVALID_STORAGE_PATH';end if;
 outcome=p_data->>'outcome';
 if outcome='retry' then retry_code='STORAGE_UNAVAILABLE';
 elsif exists(select from storage.objects o where o.bucket_id='wow-files' and o.name=target.path) then retry_code='OBJECT_PRESENT';end if;
 if retry_code is not null then
  update wow_ops.storage_jobs set lease_token=null,lease_until=null,last_error=retry_code,
   next_attempt_at=now()+least(interval '6 hours',interval '5 minutes'*(2^least(j.attempts-1,7))) where id=j.id;
  return '{"status":"retry"}'::jsonb;
 end if;
 if j.source='files' then update wow_collab.files set state='removed' where id=j.object_id and state='trash';
 elsif j.source='chat' then update wow_collab.chat_assets set state='removed' where id=j.object_id and state='trash';
 else update public.wow_gallery_assets set lifecycle='removed' where id=j.object_id and lifecycle='trash';end if;
 update wow_ops.storage_jobs set completed_at=now(),lease_token=null,lease_until=null,last_error=null where id=j.id;
 return '{"status":"removed"}'::jsonb;
end $$;

-- The configured origin is immutable after provisioning. The Vault URL must
-- match this one computed endpoint byte-for-byte before pg_net gets a token.
create or replace function wow_ops.storage_worker() returns table(endpoint text,worker_token text)
language sql stable set search_path='' as $$
 select c.project_origin||'/functions/v1/wow-cloud/push-worker',t.decrypted_secret
 from public.wow_push_control c join vault.decrypted_secrets t on t.name='wow_push_worker_token'
 join vault.decrypted_secrets u on u.name='wow_push_worker_url'
 where c.singleton and c.enabled and c.project_origin ~ '^https://[a-z0-9]{20}\.supabase\.co$'
 and u.decrypted_secret=c.project_origin||'/functions/v1/wow-cloud/push-worker' and length(t.decrypted_secret) between 32 and 256
 and exists(select from vault.decrypted_secrets k where k.name='wow_push_vapid_public' and length(k.decrypted_secret)=87)
 and exists(select from vault.decrypted_secrets k where k.name='wow_push_vapid_private' and length(k.decrypted_secret)=43)
$$;
create or replace function public.wow_storage_wake() returns bigint
language plpgsql security definer set search_path='' as $$
declare worker record; request_id bigint;
begin
 if not exists(select from public.wow_workspaces w left join wow_ops.settings s on s.workspace_id=w.id
   where w.status='active' and coalesce(s.enabled,true)) then return null;end if;
 select * into worker from wow_ops.storage_worker();
 if worker.endpoint is null then return null;end if;
 update public.wow_push_control set storage_last_wake_at=clock_timestamp() where singleton and
  (storage_last_wake_at is null or storage_last_wake_at<=clock_timestamp()-interval '9 minutes');
 if not found then return null;end if;
 select net.http_post(url:=worker.endpoint,headers:=jsonb_build_object('Content-Type','application/json','X-Wow-Worker-Token',worker.worker_token),
  body:='{}'::jsonb,timeout_milliseconds:=120000) into request_id;
 return request_id;
end $$;

create or replace function wow_ops.storage_status(wid uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('lastScanAt',(select storage_last_scan_at from wow_ops.settings where workspace_id=wid),
  'pending',count(*) filter(where j.completed_at is null and j.attempts=0),
  'leased',count(*) filter(where j.completed_at is null and j.lease_until>now()),
  'retrying',count(*) filter(where j.completed_at is null and j.attempts>0 and (j.lease_until is null or j.lease_until<=now())),
  'removed24h',count(*) filter(where j.completed_at>=now()-interval '24 hours'),
  'scheduler',exists(select from cron.job where jobname='wow-storage-maintenance' and active and schedule='*/10 * * * *'
     and command='select public.wow_storage_wake();'),'configured',exists(select from wow_ops.storage_worker()))
 from wow_ops.storage_jobs j where j.workspace_id=wid and (j.completed_at is null or j.completed_at>=now()-interval '24 hours')
$$;
revoke all on function wow_ops.chat_asset_referenced(uuid),wow_ops.gallery_asset_referenced(public.wow_gallery_assets),
 wow_ops.storage_scan(uuid),wow_ops.storage_target(wow_ops.storage_jobs),wow_ops.storage_worker(),wow_ops.storage_status(uuid),
 public.wow_storage_maintenance(text,jsonb),public.wow_storage_wake() from public,anon,authenticated;
grant execute on function public.wow_storage_maintenance(text,jsonb),public.wow_storage_wake() to service_role;
select cron.schedule('wow-storage-maintenance','*/10 * * * *','select public.wow_storage_wake();');
commit;
