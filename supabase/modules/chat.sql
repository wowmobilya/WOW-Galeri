-- Chat uses private tables and the verified, revocable WOW account session.
begin;
create schema if not exists wow_collab;
revoke all on schema wow_collab from public,anon,authenticated;
insert into public.wow_permission_catalog(permission) values ('chat.view'),('chat.edit'),('chat.delete') on conflict do nothing;
create table if not exists wow_collab.rooms (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.wow_workspaces,
 kind text not null check(kind in ('team','direct','group')), room_key text, title text not null check(length(title)<=100),
 description text not null default '' check(length(description)<=500), emoji text not null default '', avatar uuid,
 creator uuid not null references public.wow_accounts, active boolean not null default true, created_at timestamptz not null default now(),
 unique(workspace_id,room_key)
);
create table if not exists wow_collab.members (
 room_id uuid not null references wow_collab.rooms, account_id uuid not null references public.wow_accounts,
 role text not null default 'member' check(role in ('owner','moderator','member')), state text not null default 'active' check(state in ('active','removed','banned')),
 read_id bigint not null default 0, cleared_id bigint not null default 0, read_at timestamptz, typing_until timestamptz,
 muted boolean not null default false, archived boolean not null default false, draft text not null default '' check(length(draft)<=8000),
 wallpaper text not null default 'plain' check(wallpaper in ('plain','warm','cool','custom')), wallpaper_asset uuid,
 disappearing text not null default 'off' check(disappearing in ('off','24h','7d','30d')),
 primary key(room_id,account_id)
);
create index if not exists chat_room_for_actor on wow_collab.members(account_id,state,room_id);
create table if not exists wow_collab.profiles (
 account_id uuid primary key references public.wow_accounts, display_name text not null default '' check(length(display_name)<=100),
 status text not null default '' check(length(status)<=160), avatar uuid
);
create table if not exists wow_collab.chat_assets (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.wow_workspaces,
 owner_id uuid not null references public.wow_accounts, room_id uuid references wow_collab.rooms, request_id uuid not null,
 purpose text not null check(purpose in ('message','profile','room','wallpaper')), name text not null check(length(name) between 1 and 180),
 kind text not null check(kind in ('image','video','audio','pdf','document','archive','other')), mime text not null,
 bytes integer not null check(bytes between 1 and 8388608), digest text not null check(digest ~ '^[0-9a-f]{64}$'),
 state text not null default 'pending' check(state in ('pending','ready','trash','removed')), linked boolean not null default false,
 created_at timestamptz not null default now(), unique(owner_id,request_id), check((purpose='profile')=(room_id is null))
);
create index if not exists chat_asset_quota on wow_collab.chat_assets(workspace_id,state);
alter table wow_collab.chat_assets add column if not exists upload_until timestamptz;
create table if not exists wow_collab.messages (
 id bigint generated always as identity primary key, room_id uuid not null references wow_collab.rooms,
 author_id uuid not null references public.wow_accounts, request_id uuid, request_hash text, text_body text not null default '' check(length(text_body)<=8000),
 asset_id uuid references wow_collab.chat_assets, reply_id bigint references wow_collab.messages,
 forwarded boolean not null default false, event text, mentions uuid[] not null default '{}',
 deleted boolean not null default false, created_at timestamptz not null default now(), edited_at timestamptz, expires_at timestamptz,
 unique(author_id,request_id)
);
create index if not exists chat_messages_feed on wow_collab.messages(room_id,id desc) where not deleted;
create index if not exists chat_messages_expiry on wow_collab.messages(expires_at) where not deleted and expires_at is not null;
create index if not exists chat_messages_asset on wow_collab.messages(asset_id) where asset_id is not null and not deleted;
create table if not exists wow_collab.reactions (
 message_id bigint not null references wow_collab.messages, account_id uuid not null references public.wow_accounts, emoji text not null check(length(emoji) between 1 and 16),
 primary key(message_id,account_id)
);
create table if not exists wow_collab.stars (
 message_id bigint not null references wow_collab.messages, account_id uuid not null references public.wow_accounts,
 primary key(account_id,message_id)
);
create table if not exists wow_collab.hidden (
 account_id uuid not null references public.wow_accounts, message_id bigint not null references wow_collab.messages,
 primary key(account_id,message_id)
);
-- Each row identifies exactly one allowed member. The private push worker checks
-- live session, device binding and wow_chat_push_allowed again before dispatch.
create table if not exists wow_collab.chat_notifications (
 workspace_id uuid not null references public.wow_workspaces, room_id uuid not null references wow_collab.rooms,
 message_id bigint not null references wow_collab.messages, recipient_id uuid not null references public.wow_accounts,
 created_at timestamptz not null default now(), primary key(message_id,recipient_id)
);
create index if not exists chat_notifications_age on wow_collab.chat_notifications(created_at);
alter table wow_collab.hidden enable row level security;
alter table wow_collab.chat_notifications enable row level security;
revoke all on wow_collab.hidden,wow_collab.chat_notifications from public,anon,authenticated;
alter table wow_collab.rooms enable row level security;
alter table wow_collab.members enable row level security;
alter table wow_collab.profiles enable row level security;
alter table wow_collab.chat_assets enable row level security;
alter table wow_collab.messages enable row level security;
alter table wow_collab.reactions enable row level security;
alter table wow_collab.stars enable row level security;
revoke all on wow_collab.rooms,wow_collab.members,wow_collab.profiles,wow_collab.chat_assets,wow_collab.messages,wow_collab.reactions,wow_collab.stars from public,anon,authenticated;
revoke all on sequence wow_collab.messages_id_seq from public,anon,authenticated;

create or replace function wow_collab.eligible(a public.wow_accounts) returns boolean language sql stable set search_path='' as $$
 select a.status='active' and (a.expires_at is null or a.expires_at>now()) and (a.role='owner' or 'chat.view'=any(a.permissions))
$$;
create or replace function wow_collab.can_message(p_role text,p_peer_role text) returns boolean language sql immutable set search_path='' as $$
 select p_role='owner' or p_peer_role='owner' or (p_role<>'customer' and p_peer_role<>'customer')
$$;
create or replace function wow_collab.peer(uid uuid,a public.wow_accounts) returns boolean language sql stable set search_path='' as $$
 select exists(select from public.wow_accounts caller where caller.id=uid and caller.workspace_id=a.workspace_id and wow_collab.eligible(a) and
  (a.id=uid or wow_collab.can_message(caller.role,a.role)))
$$;
-- Recheck current roles on reads as well as admission. Older room memberships
-- may have been created before the owner reclassified a staff or customer account.
create or replace function wow_collab.room_allowed(uid uuid,p_role text,r wow_collab.rooms) returns boolean language sql stable set search_path='' as $$
 select case when r.kind<>'direct' then p_role<>'customer' else exists(
   select from wow_collab.members other join public.wow_accounts peer on peer.id=other.account_id
   where other.room_id=r.id and other.account_id<>uid and other.state='active' and peer.workspace_id=r.workspace_id
     and wow_collab.can_message(p_role,peer.role)) end
$$;
create or replace function wow_collab.person(a public.wow_accounts) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',a.id,'name',coalesce((select nullif(p.display_name,'') from wow_collab.profiles p where p.account_id=a.id),a.name),
  'username',a.username,'status',coalesce((select p.status from wow_collab.profiles p where p.account_id=a.id),''),
  'avatar',(select p.avatar from wow_collab.profiles p where p.account_id=a.id),'owner',a.role='owner')
$$;
create or replace function wow_collab.asset_path(a wow_collab.chat_assets) returns text language sql immutable set search_path='' as $$
 select 'chat/'||a.workspace_id||'/'||a.owner_id||'/'||a.id||'/'||a.digest
$$;
create or replace function wow_collab.asset_meta(a wow_collab.chat_assets) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',a.id,'kind',a.kind,'name',a.name,'mime',a.mime,'bytes',a.bytes)
$$;
create or replace function wow_collab.visible(m wow_collab.messages,cutoff bigint,viewer uuid) returns boolean language sql stable set search_path='' as $$
 select m.id>cutoff and not m.deleted and (m.expires_at is null or m.expires_at>now()) and not exists(select from wow_collab.hidden h where h.account_id=viewer and h.message_id=m.id)
$$;
create or replace function wow_collab.message_json(m wow_collab.messages,uid uuid,cutoff bigint) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',m.id::text,'roomId',m.room_id,'authorId',m.author_id,'author',(select wow_collab.person(a)->>'name' from public.wow_accounts a where a.id=m.author_id),
  'requestId',case when m.author_id=uid then m.request_id end,'text',m.text_body,'asset',(select wow_collab.asset_meta(b) from wow_collab.chat_assets b where b.id=m.asset_id and b.state='ready'),
  'createdAt',m.created_at,'editedAt',m.edited_at,'expiresAt',m.expires_at,'forwarded',m.forwarded,'event',m.event,'mentions',m.mentions,
  'reply',(select jsonb_build_object('id',q.id::text,'text',left(q.text_body,160),'author',wow_collab.person(a)->>'name','attachment',q.asset_id is not null,'expiresAt',q.expires_at)
   from wow_collab.messages q join public.wow_accounts a on a.id=q.author_id where q.id=m.reply_id and q.room_id=m.room_id and wow_collab.visible(q,cutoff,uid)),
  'starred',exists(select from wow_collab.stars s where s.message_id=m.id and s.account_id=uid),
  'myReaction',(select e.emoji from wow_collab.reactions e where e.message_id=m.id and e.account_id=uid),
  'reactions',coalesce((select jsonb_object_agg(q.emoji,q.n) from (select e.emoji,count(*) n from wow_collab.reactions e where e.message_id=m.id group by e.emoji) q),'{}'))
$$;
create or replace function wow_collab.direct_room(wid uuid,uid uuid,target uuid) returns uuid language plpgsql set search_path='' as $$
declare rid uuid; k text:='dm/'||least(uid,target)||'/'||greatest(uid,target);
begin
 select id into rid from wow_collab.rooms where workspace_id=wid and room_key=k and active;
 if rid is null then
  if exists(select from wow_collab.members m join wow_collab.rooms r on r.id=m.room_id where m.account_id in (uid,target) and r.active and m.state='active' group by m.account_id having count(*)>=250) then raise exception using message='RATE_LIMITED'; end if;
  insert into wow_collab.rooms(workspace_id,kind,room_key,title,creator) values(wid,'direct',k,'',uid) returning id into rid;
  insert into wow_collab.members(room_id,account_id,role) select rid,a.id,case when a.role='owner' then 'owner' else 'member' end from public.wow_accounts a where a.id in (uid,target);
 end if;
 return rid;
end $$;
create or replace function public.wow_chat_push_allowed(p_workspace uuid,p_account uuid,p_room uuid,p_message bigint)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select from wow_collab.rooms r join wow_collab.members m on m.room_id=r.id join public.wow_accounts a on a.id=m.account_id
 join wow_collab.messages msg on msg.room_id=r.id join public.wow_workspaces w on w.id=r.workspace_id
 where r.workspace_id=p_workspace and w.status='active' and r.id=p_room and r.active and m.account_id=p_account and m.state='active'
 and not m.muted and msg.author_id<>p_account and msg.event is null and msg.id=p_message and m.read_id<msg.id and wow_collab.visible(msg,m.cleared_id,p_account)
 and a.workspace_id=r.workspace_id and wow_collab.eligible(a) and wow_collab.room_allowed(a.id,a.role,r))
$$;
create or replace function public.wow_chat_service(p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=(p_data->>'userId')::uuid; sid uuid:=(p_data->>'sessionId')::uuid; wid uuid; ctx jsonb; perm text;
 rid uuid:=(p_data->>'roomId')::uuid; target uuid:=(p_data->>'targetId')::uuid; aid uuid:=(p_data->>'assetId')::uuid;
 mid bigint:=(p_data->>'messageId')::bigint; room wow_collab.rooms; member wow_collab.members; other wow_collab.members; acct public.wow_accounts;
 msg wow_collab.messages; parent_msg wow_collab.messages; source_msg wow_collab.messages; asset wow_collab.chat_assets;
 items jsonb; people jsonb; prefs jsonb; result jsonb; term text:=coalesce(p_data->>'query','');
 expiry timestamptz; key_id uuid:=(p_data->>'requestId')::uuid; cutoff bigint; mentioned_ids uuid[]; targets uuid[];
 digest text; txt text:=coalesce(p_data->>'text',''); ev text; n integer; used bigint; personal bigint; cursor_id bigint; ttl integer:=60;
begin
 if p_action not in ('init','rooms','people','profile','group','direct','feed','members','member','room.update','room.delete',
 'send','edit','delete','hide','forward','info','react','star','typing','read','draft','prefs','clear','reserve','finish','asset.open','gc','gcAck') then raise exception using message='INVALID_ACTION'; end if;
 perm:=case when p_action in ('delete','room.delete') then 'chat.delete'
 when p_action in ('init','rooms','people','feed','info','members','read','star','hide','prefs','clear','asset.open','gc','gcAck') then 'chat.view' else 'chat.edit' end;
 ctx:=public.wow_actor(uid,sid,null,false,p_action not in ('rooms','people','feed','info','members','asset.open','read','typing','draft','star','react','prefs','clear'));
 wid:=(ctx->>'workspaceId')::uuid;
 if ctx#>>'{account,role}'<>'owner' and not ((ctx#>'{account,permissions}') ? 'chat.view' and (ctx#>'{account,permissions}') ? perm) then raise exception using message='ACCESS_DENIED'; end if;
 if p_action='init' then
  select * into acct from public.wow_accounts a where a.workspace_id=wid and a.role='owner' and wow_collab.eligible(a) order by a.created_at,a.id limit 1;
  if acct.id is not null then
   if ctx#>>'{account,role}'<>'customer' then
    select r.id into rid from wow_collab.rooms r where r.workspace_id=wid and r.room_key='team';
    if rid is null then insert into wow_collab.rooms(workspace_id,kind,room_key,title,creator) values(wid,'team','team','',acct.id) returning id into rid; end if;
    insert into wow_collab.members(room_id,account_id,role) values(rid,acct.id,'owner') on conflict do nothing;
    insert into wow_collab.members(room_id,account_id) values(rid,uid) on conflict do nothing;
   end if;
   if acct.id<>uid then perform wow_collab.direct_room(wid,uid,acct.id); end if;
  end if;
  return jsonb_build_object('me',(select wow_collab.person(a) from public.wow_accounts a where a.id=uid));
 elsif p_action='people' then
  select coalesce(jsonb_agg(q.person order by q.n,q.id),'[]') into people from
   (select wow_collab.person(a) person,a.name n,a.id from public.wow_accounts a where a.workspace_id=wid and wow_collab.peer(uid,a)
    and (not coalesce((p_data->>'staffOnly')::boolean,false) or a.role<>'customer')
    and (term='' or strpos(lower(a.username||' '||a.name||' '||(wow_collab.person(a)->>'name')),lower(term))>0)
    order by a.name,a.id limit 100 offset coalesce((p_data->>'offset')::integer,0)) q;
  return jsonb_build_object('people',people);
 elsif p_action='rooms' then
  select coalesce(jsonb_agg(q.obj order by q.last_id desc nulls last,q.id),'[]') into result from (
   select r.id,last_msg.id last_id,jsonb_build_object('id',r.id,'kind',r.kind,'name',coalesce(nullif(r.title,''),peer.person->>'name',''),
    'emoji',r.emoji,'description',r.description,'avatar',r.avatar,'peer',peer.person,'role',m.role,'muted',m.muted,'archived',m.archived,
    'unread',(select count(*) from wow_collab.messages x where x.room_id=r.id and x.author_id<>uid and x.id>m.read_id and wow_collab.visible(x,m.cleared_id,uid)),
    'last',case when last_msg.id is not null then jsonb_build_object('id',last_msg.id::text,'text',left(last_msg.text_body,140),'event',last_msg.event,
    'attachment',last_msg.asset_id is not null,'at',last_msg.created_at,'expiresAt',last_msg.expires_at) end) obj
   from wow_collab.members m join wow_collab.rooms r on r.id=m.room_id
   left join lateral (select wow_collab.person(a) person from wow_collab.members p join public.wow_accounts a on a.id=p.account_id
    where r.kind='direct' and p.room_id=r.id and p.account_id<>uid limit 1) peer on true
   left join lateral (select x.* from wow_collab.messages x where x.room_id=r.id and wow_collab.visible(x,m.cleared_id,uid) order by x.id desc limit 1) last_msg on true
   where m.account_id=uid and m.state='active' and r.active and r.workspace_id=wid and wow_collab.room_allowed(uid,ctx#>>'{account,role}',r)) q;
  return jsonb_build_object('rooms',result);
 elsif p_action='direct' then
  if target=uid or not exists(select from public.wow_accounts a where a.id=target and wow_collab.peer(uid,a)) then raise exception using message='ACCESS_DENIED'; end if;
  return jsonb_build_object('roomId',wow_collab.direct_room(wid,uid,target));
 elsif p_action='group' then
  if ctx#>>'{account,role}'='customer' then raise exception using message='ACCESS_DENIED'; end if;
  if (select count(*) from wow_collab.rooms r where r.creator=uid and r.kind='group' and r.active)>=100 then raise exception using message='RATE_LIMITED'; end if;
  targets:=array(select distinct val::uuid from jsonb_array_elements_text(p_data->'members') val where val::uuid<>uid);
  if (select count(*) from wow_collab.rooms r where r.creator=uid and r.kind='group' and r.created_at>now()-interval '1 hour')>=30 or
   exists(select from wow_collab.members m join wow_collab.rooms r on r.id=m.room_id where (m.account_id=uid or m.account_id=any(targets)) and r.active and m.state='active' group by m.account_id having count(*)>=250) then raise exception using message='RATE_LIMITED'; end if;
  if cardinality(targets)>98 or (select count(*) from public.wow_accounts a where a.id=any(targets) and a.role<>'customer' and wow_collab.peer(uid,a))<>cardinality(targets) then raise exception using message='ACCESS_DENIED'; end if;
  insert into wow_collab.rooms(workspace_id,kind,title,description,emoji,creator) values(wid,'group',p_data->>'name',coalesce(p_data->>'description',''),coalesce(p_data->>'emoji',''),uid) returning id into rid;
  insert into wow_collab.members(room_id,account_id,role) values(rid,uid,'owner');
  insert into wow_collab.members(room_id,account_id) select rid,t from unnest(targets) t;
  insert into wow_collab.messages(room_id,author_id,event) values(rid,uid,'created');
  return jsonb_build_object('roomId',rid);
 elsif p_action='profile' then
  if aid is not null and not exists(select from wow_collab.chat_assets b where b.id=aid and b.owner_id=uid and b.purpose='profile' and b.state='ready') then raise exception using message='ACCESS_DENIED'; end if;
  insert into wow_collab.profiles(account_id,display_name,status,avatar) values(uid,p_data->>'name',p_data->>'status',aid)
   on conflict(account_id) do update set display_name=excluded.display_name,status=excluded.status,avatar=excluded.avatar;
  update wow_collab.chat_assets b set linked=true where b.id=aid;
  return jsonb_build_object('me',(select wow_collab.person(a) from public.wow_accounts a where a.id=uid));
 elsif p_action in ('gc','gcAck') then
  if p_action='gcAck' then update wow_collab.chat_assets b set state='removed' where b.id=aid and b.workspace_id=wid and b.state='trash'
   and not exists(select from storage.objects o where o.bucket_id='wow-files' and o.name=wow_collab.asset_path(b)); return '{}'; end if;
  delete from wow_collab.chat_notifications q where q.workspace_id=wid and q.created_at<now()-interval '1 day';
  update wow_collab.messages x set deleted=true,text_body='',asset_id=null,mentions='{}' where x.id in
   (select y.id from wow_collab.messages y join wow_collab.rooms r on r.id=y.room_id where r.workspace_id=wid and not y.deleted and (not r.active or y.expires_at<=now()) order by y.id limit 250);
  update wow_collab.chat_assets b set state='trash' where b.id in (select z.id from wow_collab.chat_assets z where z.workspace_id=wid and z.state in ('ready','pending')
   and (z.linked or z.created_at<now()-interval '1 day') and coalesce(z.upload_until,z.created_at)<=now()
   and not exists(select from wow_collab.messages x where x.asset_id=z.id and not x.deleted)
   and not exists(select from wow_collab.profiles p where p.avatar=z.id) and not exists(select from wow_collab.rooms r where r.avatar=z.id and r.active)
   and not exists(select from wow_collab.members m join wow_collab.rooms r on r.id=m.room_id where m.wallpaper_asset=z.id and r.active and m.state='active') limit 30);
  select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'path',j.path)),'[]') into items from
   (select b.id,wow_collab.asset_path(b) path from wow_collab.chat_assets b where b.workspace_id=wid and b.state='trash' order by b.created_at limit 20) j;
  return jsonb_build_object('objects',items);
 end if;

 -- Any action addressing a room must pass this lookup, including attachment signing and forwards.
 if rid is not null then
  select * into room from wow_collab.rooms r where r.id=rid and r.workspace_id=wid and r.active and wow_collab.room_allowed(uid,ctx#>>'{account,role}',r);
  select * into member from wow_collab.members m where m.room_id=rid and m.account_id=uid and m.state='active';
  if room.id is null or member.account_id is null then raise exception using message='ACCESS_DENIED'; end if;
 elsif not ((p_action='asset.open' and p_data->>'purpose'='profile') or (p_action='reserve' and p_data->>'purpose'='profile') or p_action='finish') then raise exception using message='ACCESS_DENIED'; end if;

 if p_action='reserve' then
  if p_data->>'purpose'='room' and (member.role not in ('owner','moderator') or room.kind='direct') then raise exception using message='ACCESS_DENIED'; end if;
  if p_data->>'purpose'<>'message' and p_data->>'kind'<>'image' then raise exception using message='INVALID_MEDIA'; end if;
  select * into asset from wow_collab.chat_assets b where b.owner_id=uid and b.request_id=key_id;
  if asset.id is not null then
   if asset.digest<>p_data->>'digest' or asset.room_id is distinct from rid or asset.purpose<>p_data->>'purpose' or asset.name<>p_data->>'name'
     or asset.state in ('trash','removed') or (asset.state='pending' and asset.created_at<=now()-interval '1 day')
     then raise exception using message='IDEMPOTENCY_MISMATCH'; end if;
   if asset.state='pending' then update wow_collab.chat_assets set upload_until=now()+interval '15 minutes' where id=asset.id; end if;
  else
   select coalesce(sum(b.bytes),0),coalesce(sum(b.bytes) filter(where b.owner_id=uid),0) into used,personal from wow_collab.chat_assets b where b.workspace_id=wid and b.state<>'removed';
   if used+(p_data->>'bytes')::int>2147483648 or personal+(p_data->>'bytes')::int>268435456 then raise exception using message='INVALID_STORAGE_QUOTA'; end if;
   if (select count(*) from wow_collab.chat_assets b where b.owner_id=uid and b.created_at>now()-interval '1 hour')>=200 then raise exception using message='RATE_LIMITED'; end if;
   insert into wow_collab.chat_assets(workspace_id,owner_id,room_id,request_id,purpose,name,kind,mime,bytes,digest)
    values(wid,uid,rid,key_id,p_data->>'purpose',p_data->>'name',p_data->>'kind',p_data->>'mime',(p_data->>'bytes')::int,p_data->>'digest') returning * into asset;
  end if;
  return jsonb_build_object('id',asset.id,'path',wow_collab.asset_path(asset),'ready',asset.state='ready');
 elsif p_action='finish' then
  update wow_collab.chat_assets b set state='ready' where b.id=aid and b.owner_id=uid and b.workspace_id=wid and b.room_id is not distinct from rid and b.state in ('pending','ready') returning * into asset;
  if asset.id is null then raise exception using message='ACCESS_DENIED'; end if;
  return jsonb_build_object('asset',wow_collab.asset_meta(asset));
 elsif p_action='asset.open' then
  if p_data->>'purpose'='profile' then
   select p.avatar into aid from wow_collab.profiles p join public.wow_accounts a on a.id=p.account_id where a.id=target and wow_collab.peer(uid,a);
  elsif p_data->>'purpose'='wallpaper' then aid:=member.wallpaper_asset;
  elsif p_data->>'purpose'='room' then aid:=room.avatar;
  else
   select * into msg from wow_collab.messages m where m.id=mid and m.room_id=rid and wow_collab.visible(m,member.cleared_id,uid);
   aid:=msg.asset_id;
   if msg.expires_at is not null then ttl:=least(ttl,floor(extract(epoch from msg.expires_at-clock_timestamp()))::integer); end if;
  end if;
  select * into asset from wow_collab.chat_assets b where b.id=aid and b.workspace_id=wid and b.state='ready';
  if asset.id is null or ttl<1 then raise exception using message='ACCESS_DENIED'; end if;
  return jsonb_build_object('path',wow_collab.asset_path(asset),'mime',asset.mime,'name',asset.name,'ttl',ttl);
 elsif p_action='feed' then
  prefs:=jsonb_build_object('muted',member.muted,'archived',member.archived,'draft',member.draft,'wallpaper',member.wallpaper,
   'wallpaperAsset',member.wallpaper_asset,'disappearing',member.disappearing,'readId',member.read_id::text,'role',member.role);
  select coalesce(jsonb_agg(q.person order by q.name),'[]') into people from (
   select wow_collab.person(a) person,a.name from wow_collab.members m join public.wow_accounts a on a.id=m.account_id where m.room_id=rid
    and m.state='active' and m.account_id<>uid and m.typing_until>now() and wow_collab.eligible(a)) q;
  with page as materialized (select x.* from wow_collab.messages x left join wow_collab.chat_assets b on b.id=x.asset_id where x.room_id=rid and wow_collab.visible(x,member.cleared_id,uid)
   and (p_data->>'before' is null or x.id<(p_data->>'before')::bigint) and (term='' or strpos(lower(x.text_body),lower(term))>0 or strpos(lower(b.name),lower(term))>0)
   and (not coalesce((p_data->>'starred')::boolean,false) or exists(select from wow_collab.stars s where s.message_id=x.id and s.account_id=uid))
   and (not coalesce((p_data->>'mentioned')::boolean,false) or uid=any(x.mentions))
   and (p_data->>'kind' is null or b.kind=p_data->>'kind' or (p_data->>'kind'='files' and b.kind in ('document','archive','other','pdf')) or (p_data->>'kind'='links' and x.text_body ~* 'https?://'))
   order by x.id desc limit 51),
   shown as (select id from page order by id desc limit 50)
  select jsonb_build_object('messages',coalesce((select jsonb_agg(wow_collab.message_json(m,uid,member.cleared_id) order by m.id)
   from shown s join wow_collab.messages m on m.id=s.id),'[]'),'more',(select count(*)>50 from page),'prefs',prefs,'typing',people,
   'readByPeer',coalesce((select max(m.read_id)::text from wow_collab.members m where m.room_id=rid and m.account_id<>uid and m.state='active'),'0')) into result;
  return result;
 elsif p_action='members' then
  select coalesce(jsonb_agg(q.person order by q.name,q.id),'[]') into people from
   (select wow_collab.person(a)||jsonb_build_object('role',m.role,'state',m.state) person,a.name,a.id from wow_collab.members m join public.wow_accounts a on a.id=m.account_id
    where m.room_id=rid and (m.state='active' or (member.role in ('owner','moderator') and m.state='banned')) and wow_collab.eligible(a)) q;
  return jsonb_build_object('members',people);
 elsif p_action='member' then
  if room.kind='direct' or member.role not in ('owner','moderator') or target=uid then raise exception using message='ACCESS_DENIED'; end if;
  select * into acct from public.wow_accounts a where a.id=target and a.workspace_id=wid and wow_collab.eligible(a);
  if acct.id is null then raise exception using message='ACCESS_DENIED'; end if;
  select * into other from wow_collab.members m where m.room_id=rid and m.account_id=target;
  ev:=p_data->>'operation';
  if acct.role='customer' and ev in ('add','unban','promote') then raise exception using message='ACCESS_DENIED'; end if;
  if other.role='owner' or (other.role='moderator' and member.role<>'owner') or (ev in ('promote','demote') and member.role<>'owner') then raise exception using message='ACCESS_DENIED'; end if;
  if ev in ('add','unban') and (select count(*) from wow_collab.members m join wow_collab.rooms r on r.id=m.room_id where m.account_id=target and m.state='active' and r.active)>=250 then raise exception using message='RATE_LIMITED'; end if;
  if ev='add' then
   if not wow_collab.peer(uid,acct) or other.state in ('active','banned') or (select count(*) from wow_collab.members m where m.room_id=rid and m.state='active')>=100 then raise exception using message='ACCESS_DENIED'; end if;
   select coalesce(max(x.id),0) into cutoff from wow_collab.messages x where x.room_id=rid;
   insert into wow_collab.members(room_id,account_id,cleared_id,read_id) values(rid,target,cutoff,cutoff) on conflict(room_id,account_id) do update set state='active',role='member',cleared_id=excluded.cleared_id,read_id=excluded.read_id;
  elsif ev='unban' and other.state='banned' then
   select coalesce(max(x.id),0) into cutoff from wow_collab.messages x where x.room_id=rid;
   update wow_collab.members m set state='active',role='member',cleared_id=cutoff,read_id=cutoff where m.room_id=rid and m.account_id=target;
  elsif ev in ('remove','ban') and other.state='active' then update wow_collab.members m set state=case when ev='ban' then 'banned' else 'removed' end,role='member',draft='',typing_until=null,wallpaper_asset=null,wallpaper='plain' where m.room_id=rid and m.account_id=target;
  elsif ev in ('promote','demote') and other.state='active' then update wow_collab.members m set role=case when ev='promote' then 'moderator' else 'member' end where m.room_id=rid and m.account_id=target;
  else raise exception using message='INVALID_CHANGE'; end if;
  insert into wow_collab.messages(room_id,author_id,event,text_body) values(rid,uid,ev,wow_collab.person(acct)->>'name'); return '{}';
 elsif p_action='room.update' then
  if room.kind='direct' or member.role not in ('owner','moderator') then raise exception using message='ACCESS_DENIED'; end if;
  if aid is not null and not exists(select from wow_collab.chat_assets b where b.id=aid and b.purpose='room' and b.room_id=rid and b.state='ready' and (b.owner_id=uid or b.id=room.avatar)) then raise exception using message='ACCESS_DENIED'; end if;
  update wow_collab.rooms r set title=p_data->>'name',description=p_data->>'description',emoji=p_data->>'emoji',avatar=aid where r.id=rid;
  update wow_collab.chat_assets b set linked=true where b.id=aid;
  insert into wow_collab.messages(room_id,author_id,event) values(rid,uid,'renamed'); return '{}';
 elsif p_action='room.delete' then
  if room.kind<>'group' or member.role<>'owner' then raise exception using message='ACCESS_DENIED'; end if;
  update wow_collab.rooms set active=false where id=rid; return '{}';
 end if;
 if p_action in ('typing','draft','prefs','clear') then
  if p_action='typing' then update wow_collab.members m set typing_until=case when (p_data->>'typing')::boolean then now()+interval '7 seconds' end where m.room_id=rid and m.account_id=uid;
  elsif p_action='draft' then update wow_collab.members m set draft=txt where m.room_id=rid and m.account_id=uid;
  elsif p_action='clear' then
   select coalesce(max(x.id),0) into cutoff from wow_collab.messages x where x.room_id=rid;
   update wow_collab.members m set cleared_id=greatest(m.cleared_id,cutoff),read_id=greatest(m.read_id,cutoff),draft='' where m.room_id=rid and m.account_id=uid;
  else
   if p_data ? 'wallpaper' and p_data->>'wallpaper'='custom' and not exists(select from wow_collab.chat_assets b where b.id=aid and b.owner_id=uid and b.room_id=rid and b.purpose='wallpaper' and b.state='ready') then raise exception using message='ACCESS_DENIED'; end if;
   update wow_collab.members m set muted=coalesce((p_data->>'muted')::boolean,m.muted),archived=coalesce((p_data->>'archived')::boolean,m.archived),
    disappearing=coalesce(p_data->>'disappearing',m.disappearing),wallpaper=coalesce(p_data->>'wallpaper',m.wallpaper),
    wallpaper_asset=case when p_data ? 'wallpaper' then case when p_data->>'wallpaper'='custom' then aid end else m.wallpaper_asset end where m.room_id=rid and m.account_id=uid;
   update wow_collab.chat_assets b set linked=true where b.id=aid and b.owner_id=uid and b.room_id=rid and b.purpose='wallpaper';
  end if; return '{}';
 end if;
 if p_action in ('send','forward') then
  digest:=md5((p_data-array['userId','sessionId'])::text);
  select * into msg from wow_collab.messages x where x.author_id=uid and x.request_id=key_id;
  if msg.id is not null then
   if msg.request_hash<>digest then raise exception using message='IDEMPOTENCY_MISMATCH'; end if;
   return jsonb_build_object('id',msg.id::text);
  end if;
  if (select count(*) from wow_collab.messages x where x.author_id=uid and x.created_at>now()-interval '1 minute')>=90 then raise exception using message='RATE_LIMITED'; end if;
  expiry:=case member.disappearing when '24h' then now()+interval '1 day' when '7d' then now()+interval '7 days' when '30d' then now()+interval '30 days' end;
  if p_action='forward' then
   select * into source_msg from wow_collab.messages x where x.id=mid and x.room_id=(p_data->>'sourceRoomId')::uuid and x.event is null and exists(
    select from wow_collab.members sm join wow_collab.rooms sr on sr.id=sm.room_id where sm.room_id=x.room_id and sm.account_id=uid and sm.state='active'
     and sr.active and sr.workspace_id=wid and wow_collab.room_allowed(uid,ctx#>>'{account,role}',sr) and wow_collab.visible(x,sm.cleared_id,uid));
   if source_msg.id is null then raise exception using message='ACCESS_DENIED'; end if;
   aid:=source_msg.asset_id; txt:=source_msg.text_body; expiry:=least(expiry,source_msg.expires_at);
  else
   if mid is not null then select * into parent_msg from wow_collab.messages x where x.room_id=rid and x.id=mid and wow_collab.visible(x,member.cleared_id,uid);
    if parent_msg.id is null then raise exception using message='ACCESS_DENIED'; end if; end if;
   if aid is not null and not exists(select from wow_collab.chat_assets b where b.id=aid and b.owner_id=uid and b.room_id=rid and b.purpose='message' and b.state='ready' and not b.linked) then raise exception using message='ACCESS_DENIED'; end if;
  end if;
  if txt='' and aid is null then raise exception using message='INVALID_MESSAGE'; end if;
  select coalesce(array_agg(a.id),'{}') into mentioned_ids from public.wow_accounts a join wow_collab.members m on a.id=m.account_id where
    m.room_id=rid and m.state='active' and wow_collab.eligible(a) and a.username=any(array(select hit[2] from regexp_matches(lower(txt),'(^|[^[:alnum:]_.-])@([[:alnum:]_.-]+)','g') hit));
  insert into wow_collab.messages(room_id,author_id,request_id,request_hash,text_body,asset_id,reply_id,forwarded,expires_at,mentions)
   values(rid,uid,key_id,digest,txt,aid,parent_msg.id,p_action='forward',expiry,mentioned_ids) returning * into msg;
  update wow_collab.chat_assets b set linked=true where b.id=aid;
  update wow_collab.members m set draft=case when m.draft=txt then '' else m.draft end,typing_until=null where m.room_id=rid and m.account_id=uid and p_action='send';
  insert into wow_collab.chat_notifications(workspace_id,room_id,message_id,recipient_id)
   select wid,rid,msg.id,m.account_id from wow_collab.members m where m.room_id=rid and public.wow_chat_push_allowed(wid,m.account_id,rid,msg.id)
   on conflict do nothing;
  return jsonb_build_object('id',msg.id::text);
 end if;
 select * into msg from wow_collab.messages x where x.id=mid and x.room_id=rid and wow_collab.visible(x,member.cleared_id,uid);
 if msg.id is null then raise exception using message='ACCESS_DENIED'; end if;
 if p_action='read' then
  update wow_collab.members m set read_id=mid,read_at=now() where m.room_id=rid and m.account_id=uid and m.read_id<mid;
 elsif p_action='edit' then
  if msg.author_id<>uid or msg.event is not null or msg.forwarded or (member.role='member' and msg.created_at<now()-interval '30 minutes') then raise exception using message='ACCESS_DENIED'; end if;
  if txt='' and msg.asset_id is null then raise exception using message='INVALID_MESSAGE'; end if;
  select coalesce(array_agg(a.id),'{}') into mentioned_ids from public.wow_accounts a join wow_collab.members m on a.id=m.account_id where
    m.room_id=rid and m.state='active' and wow_collab.eligible(a) and a.username=any(array(select hit[2] from regexp_matches(lower(txt),'(^|[^[:alnum:]_.-])@([[:alnum:]_.-]+)','g') hit));
  update wow_collab.messages set text_body=txt,mentions=mentioned_ids,edited_at=now() where id=mid;
 elsif p_action='delete' then
  if msg.event is not null or (member.role='member' and (msg.author_id<>uid or msg.created_at<now()-interval '60 minutes')) then raise exception using message='ACCESS_DENIED'; end if;
  update wow_collab.messages set deleted=true,text_body='',asset_id=null,mentions='{}' where id=mid;
  delete from wow_collab.reactions where message_id=mid; delete from wow_collab.stars where message_id=mid;
 elsif p_action='hide' then
  insert into wow_collab.hidden(account_id,message_id) values(uid,mid) on conflict do nothing;
 elsif p_action='star' then
  if (p_data->>'active')::boolean then insert into wow_collab.stars values(mid,uid) on conflict do nothing;
  else delete from wow_collab.stars where message_id=mid and account_id=uid; end if;
 elsif p_action='react' then
  if nullif(p_data->>'emoji','') is null then delete from wow_collab.reactions where message_id=mid and account_id=uid;
  else insert into wow_collab.reactions values(mid,uid,p_data->>'emoji') on conflict(message_id,account_id) do update set emoji=excluded.emoji; end if;
 elsif p_action='info' then
  select coalesce(jsonb_agg(jsonb_build_object('name',wow_collab.person(a)->>'name','at',m.read_at) order by m.read_at),'[]') into people
   from wow_collab.members m join public.wow_accounts a on a.id=m.account_id where m.room_id=rid and m.state='active' and m.account_id<>msg.author_id and m.read_id>=mid and m.cleared_id<mid;
  select coalesce(jsonb_agg(jsonb_build_object('name',wow_collab.person(a)->>'name','emoji',e.emoji) order by a.name),'[]') into items
   from wow_collab.reactions e join public.wow_accounts a on a.id=e.account_id where e.message_id=mid;
  return jsonb_build_object('readers',people,'reactions',items);
 else raise exception using message='INVALID_ACTION'; end if;
 return '{}';
end $$;
revoke all on all functions in schema wow_collab from public,anon,authenticated;
revoke all on function public.wow_chat_service(text,jsonb), public.wow_chat_push_allowed(uuid,uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.wow_chat_service(text,jsonb),public.wow_chat_push_allowed(uuid,uuid,uuid,bigint) to service_role;
commit;
