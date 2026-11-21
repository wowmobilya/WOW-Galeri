-- Operational automation is a fixed, bounded program. It never edits a ledger,
-- customer, product, invoice, membership, credential or arbitrary source code.
begin;
create schema if not exists wow_ops;
revoke all on schema wow_ops from public,anon,authenticated;

create table if not exists wow_ops.settings (
 workspace_id uuid primary key references public.wow_workspaces(id),
 enabled boolean not null default true, revision bigint not null default 1,
 last_tick_at timestamptz, last_result jsonb, updated_at timestamptz not null default now()
);
create table if not exists wow_ops.runs (
 id bigint generated always as identity primary key,
 workspace_id uuid not null references public.wow_workspaces(id),
 started_at timestamptz not null default now(), finished_at timestamptz,
 status text not null check(status in ('running','healthy','attention','failed','disabled')),
 recovered_leases integer not null default 0, expired_rows integer not null default 0,
 issues integer not null default 0, error_code text
);
create index if not exists wow_ops_runs_workspace_idx on wow_ops.runs(workspace_id,id desc);
create table if not exists wow_ops.incidents (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.wow_workspaces(id),
 code text not null check(code in ('PUSH_BACKLOG','PUSH_FAILURES','PUSH_NOT_CONFIGURED','PUSH_SCHEDULE','RLS_DISABLED')),
 severity text not null check(severity in ('info','warning','critical')), active boolean not null,
 details jsonb not null default '{}', first_seen_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(), resolved_at timestamptz,
 acknowledged_at timestamptz, acknowledged_by uuid references public.wow_accounts(id),
 revision bigint not null default 1, unique(workspace_id,code)
);
create index if not exists wow_ops_incidents_workspace_idx on wow_ops.incidents(workspace_id,active,last_seen_at desc);
create table if not exists wow_ops.notifications (
 id bigint generated always as identity primary key, workspace_id uuid not null references public.wow_workspaces(id),
 incident_id uuid not null references wow_ops.incidents(id), revision bigint not null,
 recipient_id uuid not null references public.wow_accounts(id), created_at timestamptz not null default now(),
 handed_off_at timestamptz, unique(incident_id,revision,recipient_id)
);
create index if not exists wow_ops_notifications_pending_idx on wow_ops.notifications(id) where handed_off_at is null;
alter table wow_ops.settings enable row level security;
alter table wow_ops.runs enable row level security;
alter table wow_ops.incidents enable row level security;
alter table wow_ops.notifications enable row level security;
revoke all on all tables in schema wow_ops from public,anon,authenticated;
revoke all on all sequences in schema wow_ops from public,anon,authenticated;

create or replace function wow_ops.observe(p_workspace uuid,p_code text,p_severity text,p_active boolean,p_details jsonb default '{}')
returns void language plpgsql security definer set search_path='' as $$
declare old_row wow_ops.incidents%rowtype; new_row wow_ops.incidents%rowtype;
begin
 select * into old_row from wow_ops.incidents where workspace_id=p_workspace and code=p_code for update;
 if old_row.id is null and not p_active then return; end if;
 insert into wow_ops.incidents(workspace_id,code,severity,active,details)
 values(p_workspace,p_code,p_severity,p_active,p_details)
 on conflict(workspace_id,code) do update set severity=excluded.severity,active=excluded.active,details=excluded.details,
  last_seen_at=case when excluded.active then now() else wow_ops.incidents.last_seen_at end,
  first_seen_at=case when excluded.active and not wow_ops.incidents.active then now() else wow_ops.incidents.first_seen_at end,
  resolved_at=case when not excluded.active then coalesce(wow_ops.incidents.resolved_at,now()) else null end,
  acknowledged_at=case when excluded.active<>wow_ops.incidents.active then null else wow_ops.incidents.acknowledged_at end,
  acknowledged_by=case when excluded.active<>wow_ops.incidents.active then null else wow_ops.incidents.acknowledged_by end,
  revision=wow_ops.incidents.revision+case when excluded.active<>wow_ops.incidents.active then 1 else 0 end
 returning * into new_row;
 -- Only a new/changed incident creates notices; repeated checks do not spam.
 if old_row.id is null or old_row.active<>new_row.active then
  insert into wow_ops.notifications(workspace_id,incident_id,revision,recipient_id)
   select p_workspace,new_row.id,new_row.revision,id from public.wow_accounts
   where workspace_id=p_workspace and role='owner' and status='active'
   on conflict do nothing;
 end if;
end $$;
revoke all on function wow_ops.observe(uuid,text,text,boolean,jsonb) from public,anon,authenticated;

create or replace function public.wow_operations_notice_payload(p_id bigint,p_recipient uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('notificationId',n.id,'workspaceId',n.workspace_id,'recipientId',n.recipient_id,
  'incidentId',i.id,'revision',i.revision,'code',i.code,'severity',i.severity,'active',i.active,'route','server-admin')
 from wow_ops.notifications n join wow_ops.incidents i on i.id=n.incident_id and i.revision=n.revision
 join public.wow_accounts a on a.id=n.recipient_id and a.workspace_id=n.workspace_id
 join public.wow_workspaces w on w.id=n.workspace_id
 where n.id=p_id and n.recipient_id=p_recipient and a.role='owner' and a.status='active'
  and w.status='active' and n.created_at>now()-interval '24 hours'
$$;
revoke all on function public.wow_operations_notice_payload(bigint,uuid) from public,anon,authenticated;
grant execute on function public.wow_operations_notice_payload(bigint,uuid) to service_role;

create or replace function public.wow_operations_tick(p_workspace uuid default null)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='1s' as $$
declare w record; setting wow_ops.settings%rowtype; run_id bigint; recovered integer; expired integer;
 n integer; active_issues integer; push_ready boolean; schedule_ok boolean; done integer=0;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('mark-robot-operations',0)) then
  return jsonb_build_object('skipped','already-running');
 end if;
 -- Limit each tick and prefer least-recently-checked workspaces, so a growing
 -- deployment does not monopolize a database connection.
 for w in select a.id from public.wow_workspaces a left join wow_ops.settings b on b.workspace_id=a.id
  where a.status='active' and (p_workspace is null or a.id=p_workspace)
  order by b.last_tick_at nulls first,a.id limit 25 loop
  insert into wow_ops.settings(workspace_id) values(w.id) on conflict do nothing;
  select * into setting from wow_ops.settings where workspace_id=w.id for update;
  insert into wow_ops.runs(workspace_id,status) values(w.id,'running') returning id into run_id;
  if not setting.enabled then
   update wow_ops.runs set status='disabled',finished_at=now() where id=run_id;
   update wow_ops.settings set last_tick_at=now(),last_result=jsonb_build_object('status','disabled') where workspace_id=w.id;
   continue;
  end if;
  begin
   recovered=0;expired=0;
   -- Preserve the original attempt budget. Never retry a sent/dead/cancelled job.
   with chosen as (select j.id from public.wow_push_jobs j join public.wow_push_events e on e.id=j.event_id
    where e.workspace_id=w.id and j.status='leased' and j.lease_until<=now()
    order by j.id for update of j skip locked limit 100)
   update public.wow_push_jobs j set status=case when j.attempts>=12 then 'failed' else 'pending' end,
    lease_until=null,lease_token=null,next_attempt_at=now()+interval '30 seconds',
    last_error=case when j.attempts>=12 then 'RETRY_LIMIT' else 'LEASE_RECOVERED' end
    from chosen where j.id=chosen.id;
   get diagnostics recovered=row_count;
   with chosen as (select token_hash from public.wow_setup_claims where workspace_id=w.id and used_at is null
    and expires_at<now()-interval '30 days' order by expires_at limit 100)
   delete from public.wow_setup_claims c using chosen where c.token_hash=chosen.token_hash;
   get diagnostics expired=row_count;
   select enabled into push_ready from public.wow_push_control where singleton;
   perform wow_ops.observe(w.id,'PUSH_NOT_CONFIGURED','info',not coalesce(push_ready,false));
   select exists(select 1 from cron.job where jobname='wow-push-retry' and active
    and schedule='* * * * *' and command='select public.wow_push_wake();') into schedule_ok;
   if coalesce(push_ready,false) and not schedule_ok then
    -- This exact reviewed schedule is the only schedule the repair can restore.
    perform cron.schedule('wow-push-retry','* * * * *','select public.wow_push_wake();');
    update cron.job set active=true where jobname='wow-push-retry';
    select exists(select 1 from cron.job where jobname='wow-push-retry' and active
     and schedule='* * * * *' and command='select public.wow_push_wake();') into schedule_ok;
   end if;
   perform wow_ops.observe(w.id,'PUSH_SCHEDULE','critical',coalesce(push_ready,false) and not schedule_ok);
   select count(*) into n from (select j.id from public.wow_push_jobs j join public.wow_push_events e on e.id=j.event_id
    where e.workspace_id=w.id and j.status='pending' and j.next_attempt_at<now()-interval '10 minutes' limit 1000) q;
   perform wow_ops.observe(w.id,'PUSH_BACKLOG','warning',n>0,jsonb_build_object('count',n,'capped',n=1000));
   select count(*) into n from (select j.id from public.wow_push_jobs j join public.wow_push_events e on e.id=j.event_id
    where e.workspace_id=w.id and j.status='failed' and e.created_at>now()-interval '24 hours' limit 1000) q;
   perform wow_ops.observe(w.id,'PUSH_FAILURES','warning',n>0,jsonb_build_object('count',n,'capped',n=1000));
   select count(*) into n from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
    where c.relkind in ('r','p') and (ns.nspname='public' and c.relname like 'wow\_%' escape '\'
     or ns.nspname like 'wow\_%' escape '\') and not c.relrowsecurity;
   perform wow_ops.observe(w.id,'RLS_DISABLED','critical',n>0,jsonb_build_object('count',n));
   if coalesce(push_ready,false) and exists(select 1 from public.wow_push_jobs j join public.wow_push_events e on e.id=j.event_id
    where e.workspace_id=w.id and j.status='pending' and j.next_attempt_at<=now()) then perform public.wow_push_wake();end if;
   select count(*) into active_issues from wow_ops.incidents where workspace_id=w.id and active;
   update wow_ops.runs set finished_at=now(),status=case when active_issues>0 then 'attention' else 'healthy' end,
    recovered_leases=recovered,expired_rows=expired,issues=active_issues where id=run_id;
   update wow_ops.settings set last_tick_at=now(),last_result=jsonb_build_object('recoveredLeases',recovered,'expiredRows',expired,
    'issues',active_issues,'status',case when active_issues>0 then 'attention' else 'healthy' end) where workspace_id=w.id;
  exception when others then
   -- Save only SQLSTATE. Messages can contain provider internals or user values.
   update wow_ops.runs set finished_at=now(),status='failed',error_code=sqlstate where id=run_id;
   update wow_ops.settings set last_tick_at=now(),last_result=jsonb_build_object('status','failed','errorCode',sqlstate) where workspace_id=w.id;
  end;
  -- Bounded maintenance of operational history; business/audit data is untouched.
  delete from wow_ops.runs where id in(select id from wow_ops.runs where workspace_id=w.id
   and started_at<now()-interval '90 days' order by id limit 500);
  delete from public.wow_push_jobs where id in(select j.id from public.wow_push_jobs j join public.wow_push_events e on e.id=j.event_id
   where e.workspace_id=w.id and e.created_at<now()-interval '90 days' and j.status in ('sent','dead','cancelled','failed') order by j.id limit 500);
  delete from public.wow_push_events where id in(select e.id from public.wow_push_events e where e.workspace_id=w.id
   and e.created_at<now()-interval '90 days' and not exists(select 1 from public.wow_push_jobs j where j.event_id=e.id) order by e.created_at limit 100);
  delete from wow_ops.notifications where id in(select id from wow_ops.notifications where workspace_id=w.id
   and handed_off_at is not null and created_at<now()-interval '90 days' order by id limit 100);
  done=done+1;
 end loop;
 return jsonb_build_object('checked',done,'checkedAt',now());
end $$;
revoke all on function public.wow_operations_tick(uuid) from public,anon,authenticated;
grant execute on function public.wow_operations_tick(uuid) to service_role;

create or replace function public.wow_operations_service(p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx jsonb; wid uuid; uid uuid; setting wow_ops.settings%rowtype; result jsonb; maintenance jsonb;
begin
 uid=(p_data->>'userId')::uuid;
 ctx=public.wow_actor(uid,(p_data->>'sessionId')::uuid,null,true,true);
 wid=(ctx->>'workspaceId')::uuid;
 if ctx->'account'->>'role' is distinct from 'owner' then raise exception using message='ACCESS_DENIED',errcode='P0001';end if;
 insert into wow_ops.settings(workspace_id) values(wid) on conflict do nothing;
 if p_action='operations.configure' then
  if jsonb_typeof(p_data->'enabled')<>'boolean' then raise exception using message='INVALID_OPERATION_SETTING',errcode='P0001';end if;
  update wow_ops.settings set enabled=(p_data->>'enabled')::boolean,revision=revision+1,updated_at=now()
   where workspace_id=wid and revision=(p_data->>'revision')::bigint returning * into setting;
  if setting.workspace_id is null then raise exception using message='CONFLICT',errcode='P0001';end if;
  insert into public.wow_audit(workspace_id,actor_id,target_type,action,details) values(wid,uid,'operations','operations.configure',jsonb_build_object('enabled',setting.enabled));
 elsif p_action='operations.check' then
  perform public.wow_operations_tick(wid);
 elsif p_action='operations.acknowledge' then
  update wow_ops.incidents set acknowledged_at=now(),acknowledged_by=uid
   where workspace_id=wid and id=(p_data->>'incidentId')::uuid;
 elsif p_action<>'operations.snapshot' then raise exception using message='UNKNOWN_ACTION',errcode='P0001';end if;
 select jsonb_build_object('enabled',enabled,'revision',revision,'lastTickAt',last_tick_at,'lastResult',last_result,
  'stale',last_tick_at is null or last_tick_at<now()-interval '15 minutes') into result from wow_ops.settings where workspace_id=wid;
 if to_regprocedure('wow_ops.storage_status(uuid)') is not null then maintenance=wow_ops.storage_status(wid);end if;
 return jsonb_build_object('settings',result,'serverTime',now(),
  'storageMaintenance',maintenance,
  'scheduler',exists(select 1 from cron.job where jobname='wow-operations' and active and schedule='*/5 * * * *' and command='select public.wow_operations_tick();'),
  'pushConfigured',coalesce((select enabled from public.wow_push_control where singleton),false),
  'queue',(select coalesce(jsonb_object_agg(status,n),'{}') from (select j.status,count(*) n from public.wow_push_jobs j
   join public.wow_push_events e on e.id=j.event_id where e.workspace_id=wid and (j.status in ('pending','leased') or e.created_at>now()-interval '24 hours') group by j.status) counts),
  'incidents',(select coalesce(jsonb_agg(to_jsonb(i) order by i.active desc,i.last_seen_at desc),'[]') from
   (select id,code,severity,active,details,first_seen_at,last_seen_at,resolved_at,acknowledged_at from wow_ops.incidents where workspace_id=wid order by active desc,last_seen_at desc limit 30) i),
  'runs',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id desc),'[]') from
   (select id,started_at,finished_at,status,recovered_leases,expired_rows,issues,error_code from wow_ops.runs where workspace_id=wid order by id desc limit 30) r));
end $$;
revoke all on function public.wow_operations_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.wow_operations_service(text,jsonb) to service_role;

-- Health checks expose availability only, never workspace data or credentials.
create or replace function public.wow_operations_health() returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('ok',
  exists(select 1 from cron.job where jobname='wow-operations' and active and schedule='*/5 * * * *' and command='select public.wow_operations_tick();')
  and not exists(select 1 from public.wow_workspaces w left join wow_ops.settings s on s.workspace_id=w.id
   where w.status='active' and coalesce(s.enabled,true) and (s.last_tick_at is null or s.last_tick_at<now()-interval '15 minutes'
    or s.last_result->>'status'='failed')),
  'service','mark-robot','schemaVersion',1,'checkedAt',now())
$$;
revoke all on function public.wow_operations_health() from public,anon,authenticated;
grant execute on function public.wow_operations_health() to service_role;

select cron.schedule('wow-operations','*/5 * * * *','select public.wow_operations_tick();');
commit;
