-- Apply after the foundation, chat, gallery and operations modules.
begin;
create schema if not exists wow_notify;
revoke all on schema wow_notify from public,anon,authenticated;
alter table wow_collab.chat_notifications add column if not exists handed_off_at timestamptz;
create index if not exists chat_notifications_pending on wow_collab.chat_notifications(created_at,message_id,recipient_id) where handed_off_at is null;

alter table public.wow_push_events
  drop constraint if exists wow_push_events_record_store_check,
  drop constraint if exists wow_push_events_kind_check,
  drop constraint if exists wow_push_events_source_check,
  alter column actor_id drop not null;
alter table public.wow_push_events add constraint wow_push_events_source_check check (
  (actor_id is not null and recipient_id is null and
    ((record_store='invoices' and kind='proforma') or (record_store='payments' and kind='payment') or
     (record_store='settings' and kind in ('expense','receipt')) or (record_store='test' and kind='test'))) or
  (recipient_id is not null and actor_id is null and details='{}'::jsonb and
    jsonb_typeof(record_id)='object' and jsonb_typeof(record_id->'id')='string' and record_id ?& array['id','recipient'] and record_id->>'recipient'=recipient_id::text and
    ((record_store='chat' and kind='chat') or (record_store='gallery' and kind in ('order.created','order.updated','stock.updated')) or
     (record_store='operations' and kind='operations')))
);

-- Fresh authorization reads only the authoritative outbox, never caller text.
-- A null result suppresses the leased delivery, including on a provider retry.
create or replace function wow_notify.payload(p_kind text,p_source text,p_workspace uuid,p_recipient uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare notice jsonb;
begin
  if p_kind='chat' then
    select jsonb_strip_nulls(jsonb_build_object('roomId',n.room_id,'messageId',n.message_id::text,'expiresAt',m.expires_at))
    into notice from wow_collab.chat_notifications n join wow_collab.messages m on m.id=n.message_id and m.room_id=n.room_id
    where n.message_id=p_source::bigint and n.recipient_id=p_recipient and n.workspace_id=p_workspace
      and public.wow_chat_push_allowed(n.workspace_id,n.recipient_id,n.room_id,n.message_id);
  elsif p_kind in ('order.created','order.updated','stock.updated') then
    notice=public.wow_gallery_notice_payload(p_source::uuid,p_recipient);
    if notice->>'workspaceId' is distinct from p_workspace::text or notice->>'kind' is distinct from p_kind then return null;end if;
  elsif p_kind='operations' then
    notice=public.wow_operations_notice_payload(p_source::bigint,p_recipient);
    if notice->>'workspaceId' is distinct from p_workspace::text then return null;end if;
  end if;
  return notice;
end $$;
create or replace function wow_notify.has_pending() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from wow_collab.chat_notifications where handed_off_at is null)
      or exists(select 1 from public.wow_gallery_notification_outbox where handed_off_at is null)
      or exists(select 1 from wow_ops.notifications where handed_off_at is null)
$$;

-- Each source receives a bounded slice, even with a backlog on another source.
-- The row lock, handoff timestamp, event and all opted-in devices commit together.
create or replace function wow_notify.handoff(p_limit integer) returns integer
language plpgsql security definer set search_path='' as $$
declare item record; event_uuid uuid; n integer=0; page_size integer=least(32,greatest(1,coalesce(p_limit,16)));
begin
  for item in
    with chat as (
      update wow_collab.chat_notifications n set handed_off_at=now() where (n.message_id,n.recipient_id) in
        (select q.message_id,q.recipient_id from wow_collab.chat_notifications q where q.handed_off_at is null
         order by q.created_at,q.message_id,q.recipient_id for update skip locked limit page_size)
      returning n.workspace_id,n.recipient_id,n.message_id::text as source,n.created_at
    ), gallery as (
      update public.wow_gallery_notification_outbox n set handed_off_at=now() where n.id in
        (select q.id from public.wow_gallery_notification_outbox q where q.handed_off_at is null
         order by q.created_at,q.id for update skip locked limit page_size)
      returning n.workspace_id,n.recipient_id,n.id::text as source,n.created_at,n.kind
    ), ops as (
      update wow_ops.notifications n set handed_off_at=now() where n.id in
        (select q.id from wow_ops.notifications q where q.handed_off_at is null order by q.id for update skip locked limit page_size)
      returning n.workspace_id,n.recipient_id,n.id::text as source,n.created_at
    )
    select c.workspace_id,c.recipient_id,c.source,c.created_at,'chat'::text as store,'chat'::text as kind from chat c union all
    select g.workspace_id,g.recipient_id,g.source,g.created_at,'gallery',g.kind from gallery g union all
    select o.workspace_id,o.recipient_id,o.source,o.created_at,'operations','operations' from ops o
  loop
    n=n+1;
    if item.created_at<=now()-interval '24 hours' or not exists(select 1 from public.wow_push_active_devices d
       where d.workspace_id=item.workspace_id and d.account_id=item.recipient_id and d.bound_at<=item.created_at) then continue;end if;
    if wow_notify.payload(item.kind,item.source,item.workspace_id,item.recipient_id) is null then continue;end if;
    insert into public.wow_push_events(workspace_id,recipient_id,record_store,record_id,record_revision,kind,action,details,created_at)
    values(item.workspace_id,item.recipient_id,item.store,jsonb_build_object('id',item.source,'recipient',item.recipient_id),0,
       item.kind,'created','{}',item.created_at)
    on conflict(workspace_id,record_store,record_id,record_revision,kind) do nothing returning id into event_uuid;
    if event_uuid is not null then
      insert into public.wow_push_jobs(event_id,subscription_id)
        select event_uuid,d.id from public.wow_push_active_devices d where d.workspace_id=item.workspace_id and d.account_id=item.recipient_id
        and d.bound_at<=item.created_at on conflict(event_id,subscription_id) do nothing;
    end if;
  end loop;
  return n;
end $$;
revoke all on all functions in schema wow_notify from public,anon,authenticated;

-- A business commit signals the existing private worker. Its minute Cron also
-- checks these outboxes, including when there are no financial jobs to wake it.
drop trigger if exists wow_shared_push_wake on wow_collab.chat_notifications;
create trigger wow_shared_push_wake after insert on wow_collab.chat_notifications for each statement execute function public.wow_push_queue_wake();
drop trigger if exists wow_shared_push_wake on public.wow_gallery_notification_outbox;
create trigger wow_shared_push_wake after insert on public.wow_gallery_notification_outbox for each statement execute function public.wow_push_queue_wake();
drop trigger if exists wow_shared_push_wake on wow_ops.notifications;
create trigger wow_shared_push_wake after insert on wow_ops.notifications for each statement execute function public.wow_push_queue_wake();
commit;
