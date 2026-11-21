-- Native catalog publication, inventory, retail orders and purchaser-owned resale.
-- Apply after wow-schema.sql. All calls enter through the existing WOW Auth session.
begin;
insert into public.wow_permission_catalog(permission,owner_only)
select section||'.'||cap,false from (values
 ('gallery',array['view','edit','delete','print','export']),('orders',array['view','edit','delete','print','export']),
 ('myorders',array['view','edit','print','export'])
) s(section,caps) cross join lateral unnest(caps) cap on conflict(permission) do nothing;

create table if not exists public.wow_gallery_listings (
 workspace_id uuid not null references public.wow_workspaces, product_id jsonb not null check(jsonb_typeof(product_id) in ('number','string')),
 published boolean not null default false, stock integer not null default 0 check(stock between 0 and 1000000),
 price_minor bigint check(price_minor between 0 and 99999999999), currency text not null default 'USD' check(currency in('USD','TRY','EUR','SYP')),
 collection text not null default '',badge text not null default '',specs jsonb not null default '{}' check(jsonb_typeof(specs)='object'),
 version bigint not null default 1,primary key(workspace_id,product_id)
);
create table if not exists public.wow_gallery_presentation (
 workspace_id uuid primary key references public.wow_workspaces,value jsonb not null default '{}',version bigint not null default 1
);
create table if not exists public.wow_gallery_orders (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.wow_workspaces,
 account_id uuid not null references public.wow_accounts,number text not null,customer_name text not null,note text not null default '',
 admin_note text not null default '',customer_note text not null default '',status text not null default 'pending' check(status in('pending','manufacturing','ready','delivered','cancelled')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),delivered_at timestamptz,archived_at timestamptz,version bigint not null default 1,
 unique(workspace_id,number)
);
create index if not exists wow_gallery_order_scope on public.wow_gallery_orders(workspace_id,account_id,created_at desc,id) where archived_at is null;
create index if not exists wow_gallery_staff_orders on public.wow_gallery_orders(workspace_id,created_at desc,id) where archived_at is null;
create table if not exists public.wow_gallery_lines (
 order_id uuid not null references public.wow_gallery_orders,product_id jsonb not null,
 name text not null,collection text not null default '',price_minor bigint not null check(price_minor between 0 and 99999999999),
 currency text not null check(currency in('USD','TRY','EUR','SYP')),quantity integer not null check(quantity between 0 and 1000000),
 image_path text,retail_minor bigint check(retail_minor between 0 and 99999999999),show_base boolean not null default true,
 show_retail boolean not null default true,show_in_print boolean not null default true,hidden boolean not null default false,
 preference_version bigint not null default 0,position integer not null,primary key(order_id,product_id)
);
create table if not exists public.wow_gallery_sales (
 id uuid primary key default gen_random_uuid(),order_id uuid not null,product_id jsonb not null,quantity integer not null check(quantity between 1 and 1000000),
 price_minor bigint not null check(price_minor between 0 and 99999999999),buyer text not null default '',phone text not null default '',note text not null default '',
 created_at timestamptz not null default now(),reversed_at timestamptz,
 foreign key(order_id,product_id) references public.wow_gallery_lines(order_id,product_id)
);
create index if not exists wow_gallery_sale_line on public.wow_gallery_sales(order_id,product_id,created_at desc);
create table if not exists public.wow_gallery_print_profiles (
 workspace_id uuid not null references public.wow_workspaces,account_id uuid not null references public.wow_accounts,
 value jsonb not null default '{}',version bigint not null default 1,primary key(workspace_id,account_id)
);
create table if not exists public.wow_gallery_assets (
 id uuid primary key,workspace_id uuid not null references public.wow_workspaces,account_id uuid not null references public.wow_accounts,
 purpose text not null check(purpose in('presentation','print')),content_type text not null check(content_type in('jpeg','png','webp')),
 digest text not null check(digest ~ '^[0-9a-f]{64}$'),size_bytes integer not null check(size_bytes between 12 and 4194304),
 path text not null unique,ready boolean not null default false,created_at timestamptz not null default now()
);
create index if not exists wow_gallery_assets_scope on public.wow_gallery_assets(workspace_id,account_id);
-- Keep the UUID and immutable object path after deletion so a delayed upload
-- cannot reuse an acknowledged object. Trash stays charged until Storage ACKs.
alter table public.wow_gallery_assets
 add column if not exists lifecycle text not null default 'active' check(lifecycle in ('active','trash','removed')),
 -- Existing rows get a full initial grace period because their last edit was
 -- not recorded by earlier releases. Reapplying this module preserves it.
 add column if not exists touched_at timestamptz default now();
create index if not exists wow_gallery_asset_quota on public.wow_gallery_assets(workspace_id,account_id)
 include(size_bytes) where lifecycle<>'removed';
create index if not exists wow_gallery_asset_rate on public.wow_gallery_assets(workspace_id,account_id,created_at);
create index if not exists wow_gallery_order_image on public.wow_gallery_lines(image_path) where image_path is not null;

create or replace function public.wow_gallery_object_path(wid uuid,owner_id uuid,asset_id uuid,extension text) returns text
language sql immutable strict set search_path='' as $$
 select wid::text||'/gallery/'||owner_id::text||'/'||asset_id::text||'.'||extension
$$;
-- Both the previous and current presentation are scanned on an edit. A hidden
-- slide, card, or historical background carries the same lifetime as a visible one.
create or replace function public.wow_gallery_image_ids(settings jsonb) returns text[]
language sql immutable set search_path='' as $$
 select array(select distinct lower(ref) from (
  select settings as item union all select jsonb_path_query(settings,'$.slides[*]')
  union all select jsonb_path_query(settings,'$.cards[*]')
 ) parts cross join lateral unnest(array[item->>'imageId',item->>'logoId',item->>'ogImageId',item->>'backgroundId',item->>'backgroundImageId']) ref
 where ref is not null)
$$;
create index if not exists wow_gallery_profile_images on public.wow_gallery_print_profiles using gin(public.wow_gallery_image_ids(value));
create table if not exists public.wow_gallery_commands (
 workspace_id uuid not null references public.wow_workspaces,account_id uuid not null references public.wow_accounts,request_id uuid not null,
 action text not null,fingerprint bytea not null,result jsonb not null,created_at timestamptz not null default now(),primary key(workspace_id,account_id,request_id)
);

alter table public.wow_gallery_orders add column if not exists customer_note text not null default '';
create table if not exists public.wow_gallery_notification_outbox (
 id uuid primary key default gen_random_uuid(),event_id uuid not null,workspace_id uuid not null references public.wow_workspaces,
 recipient_id uuid not null references public.wow_accounts,kind text not null check(kind in('order.created','order.updated','stock.updated')),
 source_id jsonb not null,event_version bigint not null check(event_version>0),order_id uuid references public.wow_gallery_orders,
 product_id jsonb,order_status text,created_at timestamptz not null default now(),handed_off_at timestamptz,
 unique(workspace_id,kind,source_id,event_version,recipient_id),unique(event_id,recipient_id),
 check ((kind='stock.updated' and order_id is null and product_id is not null and order_status is null)
    or (kind in('order.created','order.updated') and order_id is not null and product_id is null and order_status is not null))
);
create index if not exists wow_gallery_notice_pending on public.wow_gallery_notification_outbox(created_at,id) where handed_off_at is null;
create or replace function public.wow_gallery_can(ctx jsonb,cap text) returns boolean
language sql immutable set search_path='' as $$
 select ctx->'account'->>'role'='owner' or ((ctx->'account'->'permissions') ? cap and
 (ctx->'account'->'permissions') ? (split_part(cap,'.',1)||'.view'))
$$;
-- The shared worker claims these private rows; recheck this helper immediately
-- before sending to each eligible device. A null result means suppress delivery.
create or replace function public.wow_gallery_notice_payload(notice_id uuid,recipient uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_strip_nulls(jsonb_build_object('id',n.id,'eventId',n.event_id,'workspaceId',n.workspace_id,'recipientId',n.recipient_id,
 'kind',n.kind,'version',n.event_version,'orderId',n.order_id,'productId',n.product_id,'route',case n.kind when 'stock.updated' then 'gallery'
 when 'order.created' then 'gallery-orders' else 'my-orders' end))
 from public.wow_gallery_notification_outbox n join public.wow_accounts a on a.id=n.recipient_id and a.workspace_id=n.workspace_id
 join public.wow_workspaces w on w.id=n.workspace_id
 left join public.wow_gallery_orders o on o.id=n.order_id and o.workspace_id=n.workspace_id
 where n.id=notice_id and n.recipient_id=recipient and w.status='active' and a.status='active'
 and (a.expires_at is null or a.expires_at>now()) and n.created_at>now()-interval '72 hours'
 and case n.kind when 'stock.updated' then public.wow_gallery_can(jsonb_build_object('account',public.wow_profile(a)),'gallery.view')
   and exists(select 1 from public.wow_gallery_listings g join public.wow_records p on p.workspace_id=g.workspace_id and p.store='products'
      and p.record_id=g.product_id and p.deleted_at is null where g.workspace_id=n.workspace_id and g.product_id=n.product_id and g.published and g.version=n.event_version)
 when 'order.created' then o.id is not null and o.archived_at is null and o.status<>'cancelled' and o.version>=n.event_version
   and public.wow_gallery_can(jsonb_build_object('account',public.wow_profile(a)),'orders.view')
 else o.id is not null and o.archived_at is null and o.account_id=a.id and o.status=n.order_status and o.version>=n.event_version
   and not exists(select 1 from public.wow_gallery_notification_outbox newer where newer.order_id=o.id and newer.kind=n.kind
       and newer.recipient_id=n.recipient_id and newer.event_version>n.event_version)
   and public.wow_gallery_can(jsonb_build_object('account',public.wow_profile(a)),'myorders.view') end
$$;
create or replace function public.wow_gallery_enqueue_notice(wid uuid,actor uuid,kind_name text,target jsonb,version_no bigint,order_ref uuid,product_ref jsonb,
 buyer_id uuid,order_state text) returns void language plpgsql security definer set search_path='' as $$
declare eid uuid=gen_random_uuid();cap text=case kind_name when 'stock.updated' then 'gallery.view' when 'order.created' then 'orders.view' else 'myorders.view' end;
begin
 insert into public.wow_gallery_notification_outbox(event_id,workspace_id,recipient_id,kind,source_id,event_version,order_id,product_id,order_status)
 select eid,wid,a.id,kind_name,target,version_no,order_ref,product_ref,order_state from public.wow_accounts a where a.workspace_id=wid
 and a.id<>actor and a.status='active' and (a.expires_at is null or a.expires_at>now())
 and (kind_name<>'order.updated' or a.id=buyer_id) and public.wow_gallery_can(jsonb_build_object('account',public.wow_profile(a)),cap)
 on conflict(workspace_id,kind,source_id,event_version,recipient_id) do nothing;
end $$;
create or replace function public.wow_gallery_media_path(wid uuid,pid jsonb) returns text
language sql stable set search_path='' as $$
 select m.payload->>'storagePath' from public.wow_records p join public.wow_records m
 on m.workspace_id=p.workspace_id and m.store='media' and m.deleted_at is null
 and p.payload->>'image' = 'wfmedia:'||(m.record_id#>>'{}')
 where p.workspace_id=wid and p.store='products' and p.record_id=pid and p.deleted_at is null
 and not exists(select from public.wow_gallery_assets a where a.path=m.payload->>'storagePath' and (a.lifecycle<>'active' or not a.ready))
$$;
create or replace function public.wow_gallery_quote(wid uuid,pid jsonb) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('productId',p.record_id,'name',left(coalesce(p.payload->>'name',''),180),
 'collection',coalesce(nullif(g.collection,''),left(p.payload->>'type',80),'other'),'badge',coalesce(g.badge,''),
 'priceMinor',coalesce(g.price_minor,case when coalesce(p.payload->>'priceA',p.payload->>'priceUSD','') ~ '^[0-9]{1,10}([.][0-9]{1,12})?$'
  then case when round(coalesce(p.payload->>'priceA',p.payload->>'priceUSD')::numeric*100) <=99999999999
            then round(coalesce(p.payload->>'priceA',p.payload->>'priceUSD')::numeric*100)::bigint end end),
 'currency',case when g.price_minor is null then 'USD' else g.currency end,
 'customPrice',g.price_minor is not null,'published',coalesce(g.published,false),'stock',coalesce(g.stock,0),'version',coalesce(g.version,0),'specs',coalesce(g.specs,'{}'::jsonb),
 'hasImage',p.payload->>'image' like 'wfmedia:%',
 'dims',coalesce((select jsonb_agg(jsonb_build_object('name',left(coalesce(x->>'name',x->>'label',''),80),
 'l',left(x->>'l',24),'w',left(x->>'w',24),'h',left(x->>'h',24),'weight',left(coalesce(x->>'weight',x->>'kg'),24)) order by n)
 from jsonb_array_elements(case when jsonb_typeof(p.payload->'dims')='array' then p.payload->'dims' else '[]' end) with ordinality d(x,n) where n<=50),'[]'::jsonb),
 'weight',left(coalesce(p.payload->>'totalWeight',p.payload->>'weight',''),24))
 from public.wow_records p left join public.wow_gallery_listings g on g.workspace_id=p.workspace_id and g.product_id=p.record_id
 where p.workspace_id=wid and p.store='products' and p.record_id=pid and p.deleted_at is null
$$;
create or replace function public.wow_gallery_order_json(o public.wow_gallery_orders,own_view boolean,staff_view boolean) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',o.id,'number',o.number,'customer',o.customer_name,'status',o.status,'note',o.note,'customerNote',o.customer_note,
 'createdAt',o.created_at,'updatedAt',o.updated_at,'deliveredAt',o.delivered_at,'version',o.version,
 'items',coalesce((select jsonb_agg(jsonb_build_object('productId',l.product_id,'name',l.name,'collection',l.collection,'priceMinor',l.price_minor,
 'currency',l.currency,'quantity',l.quantity,'hasImage',l.image_path is not null)||
 case when own_view then jsonb_build_object('sold',(select coalesce(sum(s.quantity),0) from public.wow_gallery_sales s
 where s.order_id=l.order_id and s.product_id=l.product_id and s.reversed_at is null),'retailMinor',l.retail_minor,'showBase',l.show_base,
 'showRetail',l.show_retail,'showInPrint',l.show_in_print,'hidden',l.hidden,'preferenceVersion',l.preference_version) else '{}'::jsonb end
 order by l.position,l.product_id) from public.wow_gallery_lines l where l.order_id=o.id and l.quantity>0),'[]'::jsonb))||
 case when staff_view then jsonb_build_object('adminNote',o.admin_note) else '{}'::jsonb end
$$;
create or replace function public.wow_gallery_page(items jsonb,lim integer) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('items',case when jsonb_array_length(coalesce(items,'[]'))>lim then items-lim else coalesce(items,'[]') end,
 'hasMore',jsonb_array_length(coalesce(items,'[]'))>lim)
$$;

create or replace function public.wow_gallery_service(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 uid uuid=(p_data->>'userId')::uuid; sid uuid=(p_data->>'sessionId')::uuid;
 mut boolean=p_action not in ('gallery.snapshot','gallery.orders','gallery.personal','gallery.sales','gallery.image');
 ctx jsonb;wid uuid;cap text; result jsonb; raw jsonb; entry jsonb; quoted jsonb; settings jsonb;
 items jsonb; pid jsonb; old_qty integer; new_qty integer; stock_delta integer; num_sold bigint; pos integer; delta_stock integer;
 ord public.wow_gallery_orders; line public.wow_gallery_lines; sale public.wow_gallery_sales; listing public.wow_gallery_listings;
 asset public.wow_gallery_assets; receipt public.wow_gallery_commands; command_id uuid; fingerprint bytea;
 oid uuid; asset_id uuid; stored_version bigint; lim integer=least(100,greatest(1,coalesce((p_data->>'limit')::integer,50)));
 start_row integer=greatest(0,coalesce((p_data->>'offset')::integer,0)); manage boolean=coalesce((p_data->>'manage')::boolean,false);
 customer_change boolean=false;staff boolean=p_action='gallery.orders' and p_data->>'scope'='staff'; target_status text; archive boolean=coalesce((p_data->>'archive')::boolean,false);
begin
 ctx=public.wow_actor(uid,sid,null,mut,mut);wid=(ctx->>'workspaceId')::uuid;
 cap=case p_action
 when 'gallery.snapshot' then case when manage then 'gallery.edit' else 'gallery.view' end
 when 'gallery.orders' then case when staff then 'orders.view' else 'myorders.view' end
 when 'gallery.personal' then 'myorders.view' when 'gallery.sales' then 'myorders.view'
 when 'gallery.stock' then 'gallery.edit' when 'gallery.order.place' then 'myorders.edit'
 when 'gallery.order.update' then case when archive then 'orders.delete' else 'orders.edit' end
 when 'gallery.sale' then 'myorders.edit' when 'gallery.sale.reverse' then 'myorders.edit'
 when 'gallery.preferences' then 'myorders.edit' when 'gallery.presentation' then 'gallery.edit'
 when 'gallery.image.prepare' then case p_data->>'purpose' when 'presentation' then 'gallery.edit' when 'print' then 'myorders.edit' end
 when 'gallery.image.commit' then case p_data->>'purpose' when 'presentation' then 'gallery.edit' when 'print' then 'myorders.edit' end
 when 'gallery.command.review' then case p_data->>'priorAction' when 'gallery.stock' then 'gallery.edit' when 'gallery.presentation' then 'gallery.edit'
   when 'gallery.order.place' then 'myorders.edit' when 'gallery.order.update' then 'orders.view' when 'gallery.sale' then 'myorders.edit'
   when 'gallery.sale.reverse' then 'myorders.edit' when 'gallery.preferences' then 'myorders.edit' end
 when 'gallery.image' then 'conditional' end;
 if cap is null then raise exception 'INVALID_GALLERY_ACTION'; end if;
 if cap<>'conditional' and not public.wow_gallery_can(ctx,cap) then raise exception 'ACCESS_DENIED'; end if;
 if p_action='gallery.order.place' and not public.wow_gallery_can(ctx,'gallery.view') then raise exception 'ACCESS_DENIED'; end if;
 if p_action='gallery.command.review' then
   -- A changed form can race a late response. Locking the same workspace makes
   -- either its original receipt or an explicit abandonment authoritative.
   command_id=(p_data->>'priorId')::uuid;
   if command_id is null then raise exception 'INVALID_GALLERY_INPUT';end if;
   select * into receipt from public.wow_gallery_commands c where c.workspace_id=wid and c.account_id=uid and c.request_id=command_id;
   if found then
     if receipt.action='abandoned' then return jsonb_build_object('completed',false);end if;
     if receipt.action<>p_data->>'priorAction' then raise exception 'IDEMPOTENCY_MISMATCH';end if;
     return jsonb_build_object('completed',true,'receipt',receipt.result);
   end if;
   insert into public.wow_gallery_commands(workspace_id,account_id,request_id,action,fingerprint,result)
     values(wid,uid,command_id,'abandoned',sha256(convert_to('abandoned','UTF8')),'{}');
   return jsonb_build_object('completed',false);
 end if;
 if mut and p_action not in('gallery.image.prepare','gallery.image.commit') then
   command_id=(p_data->>'commandId')::uuid;
   if command_id is null then raise exception 'INVALID_GALLERY_INPUT';end if;
   fingerprint=sha256(convert_to((p_data-'userId'-'sessionId'-'commandId')::text,'UTF8'));
   select * into receipt from public.wow_gallery_commands c where c.workspace_id=wid and c.account_id=uid and c.request_id=command_id;
   if found then
     if receipt.action<>p_action or receipt.fingerprint<>fingerprint then raise exception 'IDEMPOTENCY_MISMATCH'; end if;
     return receipt.result;
   end if;
 end if;
 if p_action='gallery.snapshot' then
   select coalesce(value,'{}'::jsonb)||jsonb_build_object('version',version) into settings from public.wow_gallery_presentation where workspace_id=wid;
   settings=coalesce(settings,'{"version":0}'::jsonb);
   if not manage then
     settings=settings||jsonb_build_object('cards',coalesce((select jsonb_agg(v order by n) from jsonb_array_elements(settings->'cards') with ordinality x(v,n) where v->'visible'='true'),'[]'::jsonb),
       'slides',coalesce((select jsonb_agg(v order by n) from jsonb_array_elements(settings->'slides') with ordinality x(v,n) where v->'visible'='true'),'[]'::jsonb),
       'fields',coalesce((select jsonb_agg(v order by n) from jsonb_array_elements(settings->'fields') with ordinality x(v,n) where v->'visible'='true'),'[]'::jsonb));
   end if;
   select jsonb_agg(public.wow_gallery_quote(wid,k.record_id) order by k.record_id) into items from
   (select p.record_id from public.wow_records p left join public.wow_gallery_listings g on g.workspace_id=p.workspace_id and g.product_id=p.record_id
    where p.workspace_id=wid and p.store='products' and p.deleted_at is null and (manage or g.published) order by p.record_id limit lim+1 offset start_row) k;
   if not manage then
     select jsonb_agg(v||jsonb_build_object('specs',coalesce((select jsonb_object_agg(spec.key,spec.value) from jsonb_each(v->'specs') spec
       where exists(select 1 from jsonb_array_elements(settings->'fields') f where f->>'id'=spec.key)),'{}'::jsonb)) order by n)
     into items from jsonb_array_elements(items) with ordinality x(v,n);
   end if;
   return public.wow_gallery_page(items,lim)||jsonb_build_object('presentation',settings);
 elsif p_action in('gallery.orders','gallery.personal') then
   select jsonb_agg(public.wow_gallery_order_json(q.order_row,not staff,staff) order by q.created_at desc,q.id) into items from
   (select o as order_row,o.created_at,o.id from public.wow_gallery_orders o where o.workspace_id=wid and o.archived_at is null and (staff or o.account_id=uid)
    and (coalesce(p_data->>'status','')='' or o.status=p_data->>'status') order by o.created_at desc,o.id limit lim+1 offset start_row) q;
   result=public.wow_gallery_page(items,lim);
   if p_action='gallery.personal' then
     select value||jsonb_build_object('version',version) into settings from public.wow_gallery_print_profiles where workspace_id=wid and account_id=uid;
     result=result||jsonb_build_object('print',coalesce(settings,'{"version":0}'::jsonb));
   end if;
   return result;
 elsif p_action='gallery.sales' then
   oid=(p_data->>'orderId')::uuid;pid=p_data->'productId';
   if not exists(select 1 from public.wow_gallery_orders o join public.wow_gallery_lines l on l.order_id=o.id
      where o.workspace_id=wid and o.account_id=uid and o.id=oid and l.product_id=pid) then raise exception 'ACCESS_DENIED'; end if;
   select jsonb_agg(jsonb_build_object('id',s.id,'quantity',s.quantity,'priceMinor',s.price_minor,'buyer',s.buyer,'phone',s.phone,
     'note',s.note,'createdAt',s.created_at,'reversedAt',s.reversed_at) order by s.created_at desc,s.id) into items
   from(select x.* from public.wow_gallery_sales x where x.order_id=oid and x.product_id=pid order by x.created_at desc,x.id limit lim+1 offset start_row) s;
   return public.wow_gallery_page(items,lim);
 elsif p_action='gallery.image' then
   if p_data->>'assetId' is not null then
     select * into asset from public.wow_gallery_assets a where a.id=(p_data->>'assetId')::uuid and a.workspace_id=wid and a.ready and a.lifecycle='active'
       and a.path=public.wow_gallery_object_path(a.workspace_id,a.account_id,a.id,a.content_type);
     if asset.id is null then raise exception 'ACCESS_DENIED'; end if;
     if asset.purpose='print' then
       if asset.account_id<>uid or not public.wow_gallery_can(ctx,'myorders.view') then raise exception 'ACCESS_DENIED'; end if;
     elsif not public.wow_gallery_can(ctx,'gallery.edit') then
       select value into settings from public.wow_gallery_presentation where workspace_id=wid;
       if not public.wow_gallery_can(ctx,'gallery.view') or not coalesce((settings->>'logoId'=asset.id::text or settings->>'ogImageId'=asset.id::text
         or exists(select 1 from jsonb_array_elements(coalesce(settings->'slides','[]')||coalesce(settings->'cards','[]')) e
           where e->>'imageId'=asset.id::text and e->'visible'='true')),false) then raise exception 'ACCESS_DENIED'; end if;
     end if;
     -- An editor can spend time with an uploaded draft before applying it.
     if asset.purpose='print' or public.wow_gallery_can(ctx,'gallery.edit') then
       update public.wow_gallery_assets set touched_at=now() where id=asset.id and coalesce(touched_at,created_at)<now()-interval '1 day';
     end if;
     return jsonb_build_object('path',asset.path);
   end if;
   pid=p_data->'productId';
   if p_data->>'orderId' is not null then
     select o.* into ord from public.wow_gallery_orders o where o.id=(p_data->>'orderId')::uuid and o.workspace_id=wid and o.archived_at is null;
     if ord.id is null or not (public.wow_gallery_can(ctx,'orders.view') or ord.account_id=uid and public.wow_gallery_can(ctx,'myorders.view')) then raise exception 'ACCESS_DENIED';end if;
     select * into line from public.wow_gallery_lines l where l.order_id=ord.id and l.product_id=pid and l.quantity>0;
     if line.order_id is null or exists(select from public.wow_gallery_assets a where a.path=line.image_path and (a.lifecycle<>'active' or not a.ready))
       then raise exception 'ACCESS_DENIED';end if;
     return jsonb_build_object('path',line.image_path);
   end if;
   if not public.wow_gallery_can(ctx,'gallery.view') or not (public.wow_gallery_can(ctx,'gallery.edit') or exists
     (select 1 from public.wow_gallery_listings g where g.workspace_id=wid and g.product_id=pid and g.published)) then raise exception 'ACCESS_DENIED';end if;
   return jsonb_build_object('path',public.wow_gallery_media_path(wid,pid));
 elsif p_action in('gallery.image.prepare','gallery.image.commit') then
   asset_id=(p_data->>'commandId')::uuid;
   select * into asset from public.wow_gallery_assets a where a.id=asset_id;
   if asset.id is null then
     if p_action<>'gallery.image.prepare' or not (p_data->>'type'=any(array['jpeg','png','webp'])) then raise exception 'INVALID_IMAGE';end if;
     if exists(select from public.wow_gallery_assets a where a.workspace_id=wid and a.lifecycle<>'removed'
       having coalesce(sum(a.size_bytes),0)+(p_data->>'size')::int>268435456
       or coalesce(sum(a.size_bytes) filter(where a.account_id=uid),0)+(p_data->>'size')::int>67108864
       or count(*) filter(where a.account_id=uid)>=256) then raise exception 'INVALID_STORAGE_QUOTA';end if;
     if (select count(*) from (select 1 from public.wow_gallery_assets a where a.workspace_id=wid and a.account_id=uid
       and a.created_at>now()-interval '1 hour' limit 64) recent)>=64 then raise exception 'RATE_LIMITED';end if;
     insert into public.wow_gallery_assets(id,workspace_id,account_id,purpose,content_type,digest,size_bytes,path)
       values(asset_id,wid,uid,p_data->>'purpose',p_data->>'type',p_data->>'digest',(p_data->>'size')::int,
        public.wow_gallery_object_path(wid,uid,asset_id,p_data->>'type')) returning * into asset;
   end if;
   if asset.lifecycle<>'active' or asset.path<>public.wow_gallery_object_path(asset.workspace_id,asset.account_id,asset.id,asset.content_type)
     or asset.workspace_id<>wid or asset.account_id<>uid or asset.purpose<>p_data->>'purpose' or asset.digest<>p_data->>'digest'
     or asset.content_type<>p_data->>'type' or asset.size_bytes<>(p_data->>'size')::int then raise exception 'IDEMPOTENCY_MISMATCH';end if;
   if p_action='gallery.image.prepare' then
     update public.wow_gallery_assets set touched_at=now() where id=asset_id;
     return jsonb_build_object('path',asset.path,'ready',asset.ready);
   end if;
   update public.wow_gallery_assets set ready=true,touched_at=now() where id=asset_id;
   return jsonb_build_object('assetId',asset_id);
 elsif p_action='gallery.stock' then
   for entry in select value from jsonb_array_elements(p_data->'rows') loop
     pid=entry->'productId';quoted=public.wow_gallery_quote(wid,pid);
     if quoted is null then raise exception 'INVALID_PRODUCT';end if;
     if (quoted->>'version')::bigint<>(entry->>'version')::bigint then raise exception 'CONFLICT';end if;
     insert into public.wow_gallery_listings(workspace_id,product_id,published,stock,price_minor,currency,collection,badge,specs)
       values(wid,pid,(entry->>'published')::boolean,(entry->>'stock')::int,(entry->>'priceMinor')::bigint,entry->>'currency',
         entry->>'collection',entry->>'badge',entry->'specs')
       on conflict(workspace_id,product_id) do update set published=excluded.published,stock=excluded.stock,price_minor=excluded.price_minor,
         currency=excluded.currency,collection=excluded.collection,badge=excluded.badge,specs=excluded.specs,version=public.wow_gallery_listings.version+1 returning * into listing;
     if listing.published and (not (quoted->>'published')::boolean or (quoted->>'stock')::integer<>listing.stock) then
       perform public.wow_gallery_enqueue_notice(wid,uid,'stock.updated',pid,listing.version,null,pid,null,null);
     end if;
   end loop;
   result=jsonb_build_object('changed',jsonb_array_length(p_data->'rows'));
 elsif p_action in('gallery.order.place','gallery.order.update') then
   if p_action='gallery.order.place' then
     oid=gen_random_uuid();target_status='pending';
     insert into public.wow_gallery_orders(id,workspace_id,account_id,number,customer_name,note)
      values(oid,wid,uid,'G-'||to_char(now(),'YYYYMMDD')||'-'||upper(left(replace(oid::text,'-',''),14)),ctx->'account'->>'name',p_data->>'note') returning * into ord;
     items=p_data->'items';
   else
     select * into ord from public.wow_gallery_orders o where o.workspace_id=wid and o.id=(p_data->>'orderId')::uuid and o.archived_at is null;
     if ord.id is null then raise exception 'INVALID_ORDER';end if;
     if ord.version<>(p_data->>'version')::bigint then raise exception 'CONFLICT';end if;
     oid=ord.id;target_status=case when archive then 'cancelled' else coalesce(p_data->>'status',ord.status) end;
     customer_change=target_status<>ord.status or coalesce(p_data->>'customerNote',ord.customer_note)<>ord.customer_note;
     items=coalesce(p_data->'items',(select jsonb_agg(jsonb_build_object('productId',l.product_id,'quantity',l.quantity) order by l.position,l.product_id)
       from public.wow_gallery_lines l where l.order_id=oid and l.quantity>0));
   end if;
   -- The actor gate locks the workspace; all stock reservations, order changes and
   -- private resale quantities below are checked against the same committed view.
   for pid in select all_ids.id from (select x->'productId' id from jsonb_array_elements(items) x
     union select l.product_id from public.wow_gallery_lines l where l.order_id=oid and l.quantity>0) all_ids order by all_ids.id loop
     select * into line from public.wow_gallery_lines l where l.order_id=oid and l.product_id=pid;
     old_qty=coalesce(line.quantity,0);
     select v,n::int into entry,pos from jsonb_array_elements(items) with ordinality x(v,n) where v->'productId'=pid;
     new_qty=coalesce((entry->>'quantity')::int,0);customer_change=customer_change or new_qty<>old_qty;
     select coalesce(sum(s.quantity),0) into num_sold from public.wow_gallery_sales s where s.order_id=oid and s.product_id=pid and s.reversed_at is null;
     if num_sold>new_qty or num_sold>0 and target_status not in('ready','delivered') then raise exception 'INVALID_SOLD_QUANTITY';end if;
     stock_delta=(case when target_status='cancelled' then 0 else new_qty end)-(case when ord.status='cancelled' then 0 else old_qty end);
     if stock_delta>0 or line.order_id is null then
       quoted=public.wow_gallery_quote(wid,pid);
       if quoted is null or quoted->'published'<>'true' or quoted->>'priceMinor' is null then raise exception 'INVALID_PRODUCT_UNAVAILABLE';end if;
       if line.order_id is null and entry->>'priceMinor' is not null and ((entry->>'priceMinor')::bigint<>(quoted->>'priceMinor')::bigint
         or entry->>'currency'<>quoted->>'currency') then raise exception 'CONFLICT';end if;
     end if;
     if stock_delta<>0 then
       update public.wow_gallery_listings g set stock=g.stock-stock_delta,version=g.version+1
         where g.workspace_id=wid and g.product_id=pid and (g.stock-stock_delta) between 0 and 1000000;
       if not found then raise exception 'INVALID_STOCK_QUANTITY';end if;
     end if;
     if line.order_id is null then
       insert into public.wow_gallery_lines(order_id,product_id,name,collection,price_minor,currency,quantity,image_path,position)
         values(oid,pid,quoted->>'name',quoted->>'collection',(quoted->>'priceMinor')::bigint,quoted->>'currency',new_qty,public.wow_gallery_media_path(wid,pid),pos);
     else
       update public.wow_gallery_lines l set quantity=new_qty,position=coalesce(pos,l.position) where l.order_id=oid and l.product_id=pid;
     end if;
   end loop;
   if p_action='gallery.order.update' then
     update public.wow_gallery_orders set status=target_status,updated_at=now(),version=version+1,admin_note=coalesce(p_data->>'adminNote',admin_note),customer_note=coalesce(p_data->>'customerNote',customer_note),
       delivered_at=case when target_status='delivered' then coalesce(delivered_at,now()) else null end,archived_at=case when archive then now() else archived_at end
       where id=oid returning * into ord;
   end if;
   if p_action='gallery.order.place' then
     perform public.wow_gallery_enqueue_notice(wid,uid,'order.created',to_jsonb(oid),ord.version,oid,null,ord.account_id,ord.status);
   elsif customer_change and not archive then
     perform public.wow_gallery_enqueue_notice(wid,uid,'order.updated',to_jsonb(oid),ord.version,oid,null,ord.account_id,ord.status);
   end if;
   result=jsonb_build_object('orderId',oid,'number',ord.number,'version',ord.version,'status',ord.status);
 elsif p_action='gallery.sale' or p_action='gallery.preferences' and p_data->>'target'='line' then
   oid=(p_data->>'orderId')::uuid;pid=p_data->'productId';
   select * into ord from public.wow_gallery_orders o where o.workspace_id=wid and o.account_id=uid and o.id=oid and o.archived_at is null;
   select * into line from public.wow_gallery_lines l where l.order_id=oid and l.product_id=pid and l.quantity>0;
   if ord.id is null or line.order_id is null then raise exception 'ACCESS_DENIED';end if;
   if p_action='gallery.sale' then
     Select coalesce(sum(s.quantity),0) into num_sold from public.wow_gallery_sales s where s.order_id=oid and s.product_id=pid and s.reversed_at is null;
     if ord.status not in('ready','delivered') or num_sold+(p_data->>'quantity')::int>line.quantity then raise exception 'INVALID_SOLD_QUANTITY';end if;
     insert into public.wow_gallery_sales(order_id,product_id,quantity,price_minor,buyer,phone,note)
       values(oid,pid,(p_data->>'quantity')::int,(p_data->>'priceMinor')::bigint,p_data->>'buyer',p_data->>'phone',p_data->>'note') returning * into sale;
     result=jsonb_build_object('saleId',sale.id);
   else
     if line.preference_version<>(p_data->>'version')::bigint then raise exception 'CONFLICT';end if;
     update public.wow_gallery_lines l set retail_minor=(p_data->>'retailMinor')::bigint,show_base=(p_data->>'showBase')::boolean,
       show_retail=(p_data->>'showRetail')::boolean,show_in_print=(p_data->>'showInPrint')::boolean,hidden=(p_data->>'hidden')::boolean,
       preference_version=preference_version+1 where l.order_id=oid and l.product_id=pid;
     result=jsonb_build_object('version',line.preference_version+1);
   end if;
 elsif p_action='gallery.sale.reverse' then
   select s.* into sale from public.wow_gallery_sales s join public.wow_gallery_orders o on o.id=s.order_id
     where o.workspace_id=wid and o.account_id=uid and s.id=(p_data->>'saleId')::uuid;
   if sale.id is null then raise exception 'ACCESS_DENIED';end if;
   update public.wow_gallery_sales set reversed_at=coalesce(reversed_at,now()) where id=sale.id;
   result=jsonb_build_object('saleId',sale.id,'reversed',true);
 elsif p_action='gallery.preferences' then
   select version,value into stored_version,settings from public.wow_gallery_print_profiles where workspace_id=wid and account_id=uid;
   if coalesce(stored_version,0)<>(p_data->>'version')::bigint then raise exception 'CONFLICT';end if;
   if p_data->>'logoId' is not null and not exists(select 1 from public.wow_gallery_assets a where a.id=(p_data->>'logoId')::uuid
     and a.workspace_id=wid and a.account_id=uid and a.purpose='print' and a.ready and a.lifecycle='active') then raise exception 'ACCESS_DENIED';end if;
   update public.wow_gallery_assets a set touched_at=now() where a.workspace_id=wid and a.account_id=uid and a.lifecycle='active'
     and a.id::text=any(public.wow_gallery_image_ids(settings));
   raw=jsonb_build_object('name',p_data->>'name','phone',p_data->>'phone','footer',p_data->>'footer','logoId',p_data->'logoId');
   insert into public.wow_gallery_print_profiles(workspace_id,account_id,value) values(wid,uid,raw)
     on conflict(workspace_id,account_id) do update set value=excluded.value,version=public.wow_gallery_print_profiles.version+1;
   result=jsonb_build_object('version',coalesce(stored_version,0)+1);
 elsif p_action='gallery.presentation' then
   select version,value into stored_version,settings from public.wow_gallery_presentation where workspace_id=wid;
   if coalesce(stored_version,0)<>(p_data->>'version')::bigint then raise exception 'CONFLICT';end if;
   raw=p_data->'value';
   for asset_id in select unnest(public.wow_gallery_image_ids(raw))::uuid loop
     if not exists(select 1 from public.wow_gallery_assets a where a.workspace_id=wid and a.id=asset_id and a.purpose='presentation' and a.ready and a.lifecycle='active') then raise exception 'ACCESS_DENIED';end if;
   end loop;
   update public.wow_gallery_assets a set touched_at=now() where a.workspace_id=wid and a.lifecycle='active'
     and a.id::text=any(public.wow_gallery_image_ids(settings));
   insert into public.wow_gallery_presentation(workspace_id,value) values(wid,raw)
     on conflict(workspace_id) do update set value=excluded.value,version=public.wow_gallery_presentation.version+1;
   result=jsonb_build_object('version',coalesce(stored_version,0)+1);
 end if;
 insert into public.wow_gallery_commands(workspace_id,account_id,request_id,action,fingerprint,result)
 values(wid,uid,command_id,p_action,fingerprint,result);
 insert into public.wow_audit(workspace_id,actor_id,action,target_type,target_id,details)
 values(wid,uid,p_action,'gallery',coalesce(result->>'orderId',result->>'saleId',command_id::text),'{}');
 return result;
end $$;

do $$ declare n text;begin
 foreach n in array array['wow_gallery_listings','wow_gallery_presentation','wow_gallery_orders','wow_gallery_lines','wow_gallery_sales',
 'wow_gallery_print_profiles','wow_gallery_assets','wow_gallery_commands','wow_gallery_notification_outbox'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated',n);
 end loop;
end $$;
revoke all on function public.wow_gallery_notice_payload(uuid,uuid), public.wow_gallery_enqueue_notice(uuid,uuid,text,jsonb,bigint,uuid,jsonb,uuid,text),
 public.wow_gallery_object_path(uuid,uuid,uuid,text),public.wow_gallery_image_ids(jsonb),
 public.wow_gallery_can(jsonb,text),public.wow_gallery_media_path(uuid,jsonb),public.wow_gallery_quote(uuid,jsonb),
 public.wow_gallery_order_json(public.wow_gallery_orders,boolean,boolean),public.wow_gallery_page(jsonb,integer),public.wow_gallery_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.wow_gallery_service(text,jsonb),public.wow_gallery_notice_payload(uuid,uuid) to service_role;
commit;
