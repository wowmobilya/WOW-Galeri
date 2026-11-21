-- An explicitly published brand snapshot. No application row is publicly readable.
-- Apply after gallery.sql. The copied image has an independent bounded lifetime;
-- retiring a private gallery asset never breaks an already approved snapshot.
begin;
create table if not exists public.wow_gallery_public_share (
 workspace_id uuid primary key references public.wow_workspaces,
 public_id uuid not null unique default gen_random_uuid(),
 revision bigint not null default 0 check(revision>=0),published boolean not null default false,
 title text not null default '' check(char_length(title)<=140),
 description text not null default '' check(char_length(description)<=300),
 language text not null default 'ar' check(language in('ar','en','tr','fr','ru')),
 image_type text check(image_type in('jpeg','png','webp')),image_digest text,
 image_data bytea check(image_data is null or octet_length(image_data) between 12 and 4194304),
 presentation_version bigint,published_at timestamptz,updated_at timestamptz not null default now(),
 check(not published or title<>'' and image_data is not null and image_digest is not null and image_digest ~ '^[0-9a-f]{64}$' and image_type is not null)
);
alter table public.wow_gallery_public_share enable row level security;
revoke all on public.wow_gallery_public_share from public,anon,authenticated;

create or replace function public.wow_public_share_service(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 ctx jsonb;wid uuid;uid uuid=(p_data->>'userId')::uuid;sid uuid=(p_data->>'sessionId')::uuid;
 snapshot public.wow_gallery_public_share;p public.wow_gallery_presentation;a public.wow_gallery_assets;
 prior public.wow_gallery_commands;cmd uuid;input jsonb;fingerprint bytea;result jsonb;bytes bytea;title text;description text;
begin
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'INVALID_SHARE_INPUT';end if;
 if p_action in('public.metadata','public.image') then
  if p_data-array['publicId','digest','type']<>'{}'::jsonb then raise exception 'INVALID_SHARE_INPUT';end if;
  select s.* into snapshot from public.wow_gallery_public_share s join public.wow_workspaces w on w.id=s.workspace_id
   where s.public_id=(p_data->>'publicId')::uuid and s.published and w.status='active';
  if snapshot.workspace_id is null then return null;end if;
  if p_action='public.metadata' then
   return jsonb_build_object('publicId',snapshot.public_id,'title',snapshot.title,'description',snapshot.description,
    'language',snapshot.language,'image',jsonb_build_object('digest',snapshot.image_digest,'type',snapshot.image_type,'size',octet_length(snapshot.image_data)));
  end if;
  if p_data->>'digest' is distinct from snapshot.image_digest or p_data->>'type' is distinct from snapshot.image_type then return null;end if;
  return jsonb_build_object('data',encode(snapshot.image_data,'base64'),'type',snapshot.image_type,
   'digest',snapshot.image_digest,'size',octet_length(snapshot.image_data));
 end if;
 if p_action not in('gallery.share.status','gallery.share.prepare','gallery.share.commit','gallery.share.unpublish') or p_action is null then raise exception 'INVALID_SHARE_ACTION';end if;
 ctx=public.wow_actor(uid,sid,null,p_action<>'gallery.share.status',p_action<>'gallery.share.status');
 if ctx->'account'->>'role'<>'owner' then raise exception 'ACCESS_DENIED';end if;
 wid=(ctx->>'workspaceId')::uuid;
 select * into snapshot from public.wow_gallery_public_share where workspace_id=wid;
 select * into p from public.wow_gallery_presentation where workspace_id=wid;
 if p_action='gallery.share.status' then
  return jsonb_build_object('revision',coalesce(snapshot.revision,0),'published',coalesce(snapshot.published,false),
   'publicId',snapshot.public_id,'publishedAt',snapshot.published_at,'publishedVersion',snapshot.presentation_version,
   'presentationVersion',coalesce(p.version,0),'title',coalesce(p.value->>'ogTitle',''),'description',coalesce(p.value->>'ogDescription',''),
   'hasImage',coalesce(p.value->>'ogImageId','')<>'');
 end if;
 if p_data-array['userId','sessionId','commandId','revision','presentationVersion','language','confirmed','imageData']<>'{}'::jsonb then raise exception 'INVALID_SHARE_INPUT';end if;
 cmd=(p_data->>'commandId')::uuid;if cmd is null then raise exception 'INVALID_SHARE_INPUT';end if;
 input=p_data-array['userId','sessionId','commandId','imageData'];fingerprint=sha256(convert_to(input::text,'UTF8'));
 select * into prior from public.wow_gallery_commands where workspace_id=wid and account_id=uid and request_id=cmd;
 if prior.request_id is not null then
  if prior.action<>(case when p_action='gallery.share.unpublish' then p_action else 'gallery.share.publish' end) or prior.fingerprint<>fingerprint then raise exception 'IDEMPOTENCY_MISMATCH';end if;
  return case when p_action='gallery.share.prepare' then jsonb_build_object('receipt',prior.result) else prior.result end;
 end if;
 if (p_data->>'revision')::bigint is distinct from coalesce(snapshot.revision,0) then raise exception 'CONFLICT';end if;
 if p_action='gallery.share.unpublish' then
  insert into public.wow_gallery_public_share(workspace_id,revision) values(wid,1)
   on conflict(workspace_id) do update set revision=public.wow_gallery_public_share.revision+1,published=false,
    title='',description='',image_type=null,image_digest=null,image_data=null,presentation_version=null,published_at=null,updated_at=now()
   returning * into snapshot;
 else
  if p_data->'confirmed' is distinct from 'true'::jsonb or (p_data->>'presentationVersion')::bigint is distinct from p.version or p.workspace_id is null then raise exception 'CONFLICT';end if;
  if coalesce(p_data->>'language','') not in('ar','en','tr','fr','ru') then raise exception 'INVALID_SHARE_INPUT';end if;
  title=btrim(regexp_replace(coalesce(p.value->>'ogTitle',''),'[[:space:]]+',' ','g'));
  description=btrim(regexp_replace(coalesce(p.value->>'ogDescription',''),'[[:space:]]+',' ','g'));
  if title='' or char_length(title)>140 or char_length(description)>300 or title~'[[:cntrl:]]' or description~'[[:cntrl:]]' then raise exception 'INVALID_SHARE_INPUT';end if;
  select * into a from public.wow_gallery_assets where id=(p.value->>'ogImageId')::uuid and workspace_id=wid
   and purpose='presentation' and ready and lifecycle='active';
  if a.id is null or a.path<>public.wow_gallery_object_path(a.workspace_id,a.account_id,a.id,a.content_type) then raise exception 'INVALID_SHARE_IMAGE';end if;
  if p_action='gallery.share.prepare' then
   return jsonb_build_object('path',a.path,'digest',a.digest,'type',a.content_type,'size',a.size_bytes);
  end if;
  if jsonb_typeof(p_data->'imageData') is distinct from 'string' or length(p_data->>'imageData')>5592408 or (p_data->>'imageData') !~ '^[A-Za-z0-9+/]+={0,2}$' then raise exception 'INVALID_SHARE_IMAGE';end if;
  bytes=decode(p_data->>'imageData','base64');
  if octet_length(bytes)<>a.size_bytes or encode(sha256(bytes),'hex')<>a.digest then raise exception 'INVALID_SHARE_IMAGE';end if;
  insert into public.wow_gallery_public_share(workspace_id,revision,published,title,description,language,image_type,image_digest,image_data,presentation_version,published_at)
   values(wid,1,true,title,description,p_data->>'language',a.content_type,a.digest,bytes,p.version,now())
   on conflict(workspace_id) do update set revision=public.wow_gallery_public_share.revision+1,published=true,title=excluded.title,description=excluded.description,
    language=excluded.language,image_type=excluded.image_type,image_digest=excluded.image_digest,image_data=excluded.image_data,
    presentation_version=excluded.presentation_version,published_at=excluded.published_at,updated_at=now()
   returning * into snapshot;
 end if;
 result=jsonb_build_object('publicId',snapshot.public_id,'revision',snapshot.revision,'published',snapshot.published,'presentationVersion',snapshot.presentation_version);
 insert into public.wow_gallery_commands(workspace_id,account_id,request_id,action,fingerprint,result)
  values(wid,uid,cmd,case when p_action='gallery.share.unpublish' then p_action else 'gallery.share.publish' end,fingerprint,result);
 insert into public.wow_audit(workspace_id,actor_id,action,target_type,target_id,details)
  values(wid,uid,case when snapshot.published then 'gallery.share.publish' else 'gallery.share.unpublish' end,'gallery-share',snapshot.public_id::text,
   jsonb_build_object('revision',snapshot.revision));
 return result;
end $$;
revoke all on function public.wow_public_share_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.wow_public_share_service(text,jsonb) to service_role;
commit;
