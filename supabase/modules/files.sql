-- Install after wow-schema.sql. Personal files are never part of business sync.
begin;
create schema if not exists wow_collab;
revoke all on schema wow_collab from public, anon, authenticated;
insert into public.wow_permission_catalog(permission) values ('files.view'),('files.edit'),('files.delete'),('files.export') on conflict do nothing;

create table if not exists wow_collab.folders (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.wow_workspaces,
  owner_id uuid not null references public.wow_accounts, name text not null check(length(name) between 1 and 100),
  unique(id,owner_id), unique(owner_id,name)
);
create table if not exists wow_collab.files (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.wow_workspaces,
  owner_id uuid not null references public.wow_accounts, request_id uuid not null, original_spec jsonb not null,
  folder_id uuid, name text not null check(length(name) between 1 and 180),
  kind text not null check(kind in ('image','video','audio','pdf','document','archive','other')),
  mime text not null, bytes integer not null check(bytes between 1 and 8388608),
  original_bytes integer not null check(original_bytes between bytes and 67108864),
  digest text not null check(digest ~ '^[a-f0-9]{64}$'),
  state text not null default 'pending' check(state in ('pending','ready','trash','removed')),
  archived boolean not null default false, downloads bigint not null default 0, created_at timestamptz not null default now(),
  unique(owner_id,request_id), foreign key(folder_id,owner_id) references wow_collab.folders(id,owner_id)
);
create index if not exists files_owner_list on wow_collab.files(owner_id,state,created_at desc,id);
create index if not exists files_workspace_quota on wow_collab.files(workspace_id,state);
alter table wow_collab.files add column if not exists upload_until timestamptz;
alter table wow_collab.folders enable row level security;
alter table wow_collab.files enable row level security;
revoke all on wow_collab.folders,wow_collab.files from public,anon,authenticated;

-- Extend the existing private bucket's MIME list without shrinking legacy image support.
update storage.buckets set allowed_mime_types=array(select distinct x from unnest(
 coalesce(allowed_mime_types,'{}') || array['image/jpeg','image/png','image/webp','image/gif','image/avif',
 'image/bmp','image/tiff','image/heic','video/mp4','video/quicktime','video/webm','video/x-matroska','video/x-msvideo',
 'audio/webm','audio/mp4','audio/mpeg','audio/ogg','audio/wav','audio/flac','audio/aac',
 'application/pdf','application/zip','application/octet-stream','text/plain']) x)
where id='wow-files' and not public;

create or replace function wow_collab.file_path(f wow_collab.files) returns text language sql immutable set search_path='' as $$
 select 'files/'||f.workspace_id||'/'||f.owner_id||'/'||f.id||'/'||f.digest
$$;
create or replace function wow_collab.file_json(f wow_collab.files) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',f.id,'folderId',f.folder_id,'name',f.name,'kind',f.kind,'mime',f.mime,'bytes',f.bytes,
 'originalBytes',f.original_bytes,'digest',f.digest,'archived',f.archived,'downloads',f.downloads,'createdAt',f.created_at)
$$;
create or replace function public.wow_files_service(p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=(p_data->>'userId')::uuid; sid uuid:=(p_data->>'sessionId')::uuid; ctx jsonb; wid uuid; perm text;
 fid uuid:=(p_data->>'fileId')::uuid; folder uuid:=(p_data->>'folderId')::uuid; item wow_collab.files; spec jsonb;
 ids uuid[]; n integer; total bigint; owner_used bigint; result jsonb; flds jsonb;
 term text:=coalesce(p_data->>'query',''); sorting text:=coalesce(p_data->>'sort','new');
begin
 if p_action not in ('list','folder.create','folder.rename','folder.delete','reserve','finish','open','share','rename','move','archive','delete','gc','gcAck') then
  raise exception using message='INVALID_ACTION'; end if;
 perm:=case when p_action='share' or (p_action='open' and coalesce((p_data->>'download')::boolean,false)) then 'files.export'
   when p_action in ('delete','folder.delete') then 'files.delete'
   when p_action in ('list','open','gc','gcAck') then 'files.view' else 'files.edit' end;
 ctx:=public.wow_actor(uid,sid,null,false,p_action not in ('list','open','share'));
 wid:=(ctx->>'workspaceId')::uuid;
 if ctx#>>'{account,role}'<>'owner' and not ((ctx#>'{account,permissions}') ? 'files.view' and (ctx#>'{account,permissions}') ? perm) then raise exception using message='ACCESS_DENIED'; end if;

 if p_action='list' then
  select coalesce(sum(f.bytes),0) into owner_used from wow_collab.files f where f.owner_id=uid and f.state in ('pending','ready','trash');
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name) order by lower(d.name),d.id),'[]') into flds from wow_collab.folders d where d.owner_id=uid;
  with matches as materialized (
   select f.* from wow_collab.files f where f.owner_id=uid and f.workspace_id=wid and f.state='ready'
    and (f.archived=coalesce((p_data->>'archived')::boolean,false)) and (folder is null or f.folder_id=folder)
    and (not coalesce((p_data->>'unfiled')::boolean,false) or f.folder_id is null)
    and (p_data->>'kind' is null or f.kind=p_data->>'kind') and strpos(lower(f.name),lower(term))>0
  ), ordered as (
   select m.id,row_number() over(order by
    case when sorting='name' then lower(m.name) end,case when sorting='nameDesc' then lower(m.name) end desc,
    case when sorting='small' then m.bytes end,case when sorting='large' then m.bytes end desc,
    case when sorting='old' then m.created_at end,m.created_at desc,m.id) as rn from matches m
  )
  select jsonb_build_object('files',coalesce((select jsonb_agg(wow_collab.file_json(f) order by o.rn)
   from ordered o join wow_collab.files f on f.id=o.id where o.rn>coalesce((p_data->>'offset')::int,0)
     and o.rn<=coalesce((p_data->>'offset')::int,0)+60),'[]'),'count',(select count(*) from matches),
   'folders',flds,'used',owner_used,'quota',268435456) into result;
  return result;
 end if;
 if p_action in ('gc','gcAck') then
  -- Durable tombstones survive interrupted clients and failed storage deletion.
  if p_action='gcAck' then
   update wow_collab.files f set state='removed' where f.owner_id=uid and f.id=fid and f.state='trash'
    and not exists(select from storage.objects o where o.bucket_id='wow-files' and o.name=wow_collab.file_path(f)); return '{}'; end if;
  update wow_collab.files f set state='trash' where f.owner_id=uid and f.state='pending' and f.created_at<now()-interval '1 day'
   and coalesce(f.upload_until,f.created_at)<=now();
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'path',q.path)),'[]') into result from
   (select f.id,wow_collab.file_path(f) as path from wow_collab.files f where f.owner_id=uid and f.state='trash' order by f.created_at limit 20) q;
  return jsonb_build_object('objects',result);
 end if;
 if folder is not null and not exists(select from wow_collab.folders d where d.id=folder and d.owner_id=uid and d.workspace_id=wid) then raise exception using message='ACCESS_DENIED'; end if;
 if p_action='folder.create' then
  if (select count(*) from wow_collab.folders d where d.owner_id=uid)>=150 then raise exception using message='RATE_LIMITED'; end if;
  insert into wow_collab.folders(workspace_id,owner_id,name) values(wid,uid,p_data->>'name') returning id into folder;
  return jsonb_build_object('id',folder);
 elsif p_action='folder.rename' then
  update wow_collab.folders d set name=p_data->>'name' where d.id=folder and d.owner_id=uid; return '{}';
 elsif p_action='folder.delete' then
  update wow_collab.files f set folder_id=null where f.owner_id=uid and f.folder_id=folder;
  delete from wow_collab.folders d where d.id=folder and d.owner_id=uid; return '{}';
 elsif p_action='reserve' then
  spec:=p_data - array['userId','sessionId','requestId'];
  select * into item from wow_collab.files f where f.request_id=(p_data->>'requestId')::uuid and f.owner_id=uid;
  if item.id is not null then
   if item.original_spec<>spec or item.state in ('trash','removed') or (item.state='pending' and item.created_at<=now()-interval '1 day')
    then raise exception using message='IDEMPOTENCY_MISMATCH'; end if;
   if item.state='pending' then update wow_collab.files set upload_until=now()+interval '15 minutes' where id=item.id; end if;
  else
   select coalesce(sum(f.bytes),0),coalesce(sum(f.bytes) filter(where f.owner_id=uid),0),count(*) filter(where f.owner_id=uid)
    into total,owner_used,n from wow_collab.files f where f.workspace_id=wid and f.state<>'removed';
   if n>=2500 or owner_used+(p_data->>'bytes')::int>268435456 or total+(p_data->>'bytes')::int>2147483648 then raise exception using message='INVALID_STORAGE_QUOTA'; end if;
   if (select count(*) from wow_collab.files f where f.owner_id=uid and f.created_at>now()-interval '1 hour')>=200 then raise exception using message='RATE_LIMITED'; end if;
   insert into wow_collab.files(workspace_id,owner_id,request_id,original_spec,folder_id,name,kind,mime,bytes,original_bytes,digest)
    values(wid,uid,(p_data->>'requestId')::uuid,spec,folder,p_data->>'name',p_data->>'kind',p_data->>'mime',(p_data->>'bytes')::int,
    (p_data->>'originalBytes')::int,p_data->>'digest') returning * into item;
  end if;
  return jsonb_build_object('id',item.id,'path',wow_collab.file_path(item),'ready',item.state='ready');
 end if;
 if p_action in ('move','archive','delete') then
  ids:=array(select distinct value::uuid from jsonb_array_elements_text(p_data->'ids'));
  if cardinality(ids) not between 1 and 100 or (select count(*) from wow_collab.files f where f.owner_id=uid and f.workspace_id=wid
    and f.id=any(ids) and (f.state='ready' or (p_action='delete' and f.state in ('trash','removed'))))<>cardinality(ids) then raise exception using message='ACCESS_DENIED'; end if;
  if p_action='move' then update wow_collab.files f set folder_id=folder where f.id=any(ids);
  elsif p_action='archive' then update wow_collab.files f set archived=(p_data->>'archived')::boolean where f.id=any(ids);
  else update wow_collab.files f set state='trash' where f.id=any(ids) and f.state='ready'; end if;
  return jsonb_build_object('count',cardinality(ids));
 end if;
 select * into item from wow_collab.files f where f.id=fid and f.owner_id=uid and f.workspace_id=wid;
 if item.id is null or (item.state<>'ready' and not (p_action='finish' and item.state='pending')) then raise exception using message='ACCESS_DENIED'; end if;
 -- Opaque documents and archives are always served as downloads by the signer.
 if p_action='open' and item.kind not in ('image','audio','video','pdf') and ctx#>>'{account,role}'<>'owner'
   and not ((ctx#>'{account,permissions}') ? 'files.export') then raise exception using message='ACCESS_DENIED'; end if;
 if p_action='finish' then
  update wow_collab.files f set state='ready' where f.id=fid; return jsonb_build_object('file',wow_collab.file_json(item));
 elsif p_action='rename' then update wow_collab.files f set name=p_data->>'name' where f.id=fid; return '{}'; end if;
 if p_action='open' and coalesce((p_data->>'download')::boolean,false) then update wow_collab.files f set downloads=downloads+1 where f.id=fid; end if;
 return jsonb_build_object('path',wow_collab.file_path(item),'name',item.name,'mime',item.mime,'ttl',case when p_action='share' then 300 else 60 end);
exception when unique_violation then raise exception using message='CONFLICT';
end $$;
revoke all on function public.wow_files_service(text,jsonb),wow_collab.file_json(wow_collab.files),wow_collab.file_path(wow_collab.files) from public,anon,authenticated;
grant execute on function public.wow_files_service(text,jsonb) to service_role;
commit;
