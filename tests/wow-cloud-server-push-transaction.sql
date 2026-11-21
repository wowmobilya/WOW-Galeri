-- Run after wow-schema.sql and BEFORE real push initialization. Every fixture,
-- synthetic Auth identity, Vault entry, cron job and pg_net request is rolled
-- back. pg_net sends only after commit; this gate must end with ROLLBACK.
begin;
do $$
declare
  owner_id uuid=gen_random_uuid(); other_id uuid=gen_random_uuid(); worker_id uuid=gen_random_uuid();
  owner_session uuid=gen_random_uuid(); other_session uuid=gen_random_uuid(); worker_session uuid=gen_random_uuid();
  workspace uuid=gen_random_uuid(); other_workspace uuid=gen_random_uuid();
  actor jsonb; other_actor jsonb; employee jsonb; permissions text[];
  subscription jsonb; subscribe_data jsonb; response jsonb; initial_response jsonb; batch_payload jsonb;
  first_sub uuid; initial_head bigint; count_before bigint; queue jsonb; leased jsonb; second_job jsonb;
  test_id uuid; changed_version bigint; endpoint text='https://fcm.googleapis.com/fcm/send/rollback-only-fixture';
begin
  if exists(select 1 from public.wow_push_control where enabled or configured_at is not null) or
    exists(select 1 from vault.secrets where name like 'wow_push_%') then raise exception 'PUSH_GATE_REQUIRES_UNCONFIGURED_PUSH';end if;
  if has_function_privilege('anon','public.wow_push_worker(text,jsonb)','execute') or
    has_function_privilege('authenticated','public.wow_push_api(text,jsonb)','execute') or
    has_function_privilege('authenticated','public.wow_push_configure(jsonb)','execute') or
    has_table_privilege('authenticated','public.wow_push_subscriptions','select') or
    has_table_privilege('anon','public.wow_push_jobs','insert') then raise exception 'TEST_FAILED_PUSH_BROWSER_GRANTS';end if;
  insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,created_at,updated_at,is_anonymous)
    select id,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated',
      'rollback-push-'||id::text||'@wow.invalid',now(),now(),now(),false from unnest(array[owner_id,other_id,worker_id]) fixture(id);
  select array_agg(permission order by permission) into permissions from public.wow_permission_catalog;
  insert into public.wow_workspaces(id,name) values(workspace,'Rollback push gate'),(other_workspace,'Rollback unrelated workspace');
  insert into public.wow_accounts(id,workspace_id,login_email,username,name,role,permissions) values
    (owner_id,workspace,'owner-'||owner_id::text||'@wow.invalid','test.owner','Owner','owner',permissions),
    (other_id,other_workspace,'other-'||other_id::text||'@wow.invalid','test.other','Other owner','owner',permissions),
    (worker_id,workspace,'worker-'||worker_id::text||'@wow.invalid','test.worker','Worker','sales',array['invoices.view','invoices.edit']);
  insert into auth.sessions(id,user_id,created_at,updated_at,aal) values
    (owner_session,owner_id,now(),now(),'aal1'),(other_session,other_id,now(),now(),'aal1'),(worker_session,worker_id,now(),now(),'aal1');
  actor=jsonb_build_object('userId',owner_id,'sessionId',owner_session);
  other_actor=jsonb_build_object('userId',other_id,'sessionId',other_session);
  employee=jsonb_build_object('userId',worker_id,'sessionId',worker_session);
  perform public.wow_service('session.open',actor);perform public.wow_service('session.open',other_actor);perform public.wow_service('session.open',employee);
  begin perform public.wow_service('push.config',employee);raise exception 'TEST_FAILED_WORKER_FINANCIAL_PUSH';
  exception when others then if sqlerrm<>'ACCESS_DENIED' then raise;end if;end;
  begin perform public.wow_push_configure(jsonb_build_object('projectUrl','https://127.0.0.1','publicKey',repeat('A',87),'privateKey',repeat('B',43),'workerToken',repeat('C',64)));raise exception 'TEST_FAILED_WORKER_URL';
  exception when others then if sqlerrm<>'INVALID_PUSH_CONFIGURATION' then raise;end if;end;
  -- Deliberately nonfunctional fixture keys; no production secret is read or replaced.
  response=public.wow_push_configure(jsonb_build_object('projectUrl','https://abcdefghijklmnopqrst.supabase.co','publicKey',repeat('A',87),'privateKey',repeat('B',43),'workerToken',repeat('C',64)));
  if response->>'configured'<>'true' or response ? 'privateKey' or response ? 'workerToken' then raise exception 'TEST_FAILED_CONFIG_RESULT';end if;
  response=public.wow_push_configure(jsonb_build_object('projectUrl','https://abcdefghijklmnopqrst.supabase.co','publicKey',repeat('D',87),'privateKey',repeat('E',43),'workerToken',repeat('F',64)));
  if response->>'publicKey'<>repeat('A',87) or (select count(*) from cron.job where jobname='wow-push-retry')<>1 then raise exception 'TEST_FAILED_CONFIG_RETRY_ROTATED';end if;
  if public.wow_service('push.config',actor)<>jsonb_build_object('publicKey',repeat('A',87)) then raise exception 'TEST_FAILED_CONFIG_PUBLIC_ONLY';end if;

  subscription=jsonb_build_object('endpoint',endpoint,'keys',jsonb_build_object('p256dh',repeat('A',87),'auth',repeat('B',22)),'expirationTime',null);
  subscribe_data=jsonb_build_object('deviceId','test-device-0001','subscription',subscription,'endpointHash',encode(extensions.digest(convert_to(endpoint,'UTF8'),'sha256'),'hex'),'language','en');
  response=public.wow_service('push.subscribe',actor||subscribe_data);first_sub=(response->>'subscriptionId')::uuid;
  if public.wow_service('push.subscribe',actor||subscribe_data)<>response or (select count(*) from public.wow_push_live_subscriptions)<>1 then raise exception 'TEST_FAILED_SUBSCRIBE_IDEMPOTENT';end if;
  begin perform public.wow_service('push.subscribe',other_actor||subscribe_data);raise exception 'TEST_FAILED_ENDPOINT_HIJACK';
  exception when others then if sqlerrm<>'SUBSCRIPTION_BOUND_TO_OTHER_IDENTITY' then raise;end if;end;
  begin perform public.wow_service('push.test',other_actor||jsonb_build_object('deviceId','test-device-0001'));raise exception 'TEST_FAILED_OTHER_DEVICE_TEST';
  exception when others then if sqlerrm<>'PUSH_SUBSCRIPTION_REQUIRED' then raise;end if;end;

  batch_payload=actor||jsonb_build_object('batchId','push-batch-0001','deviceId','test-device-0001','requestHash',repeat('1',64),'expectedSessionVersion',1,
    'origin','live','guards','[]'::jsonb,'sourceProductIds','[]'::jsonb,'projected','[]'::jsonb,
    'operations','[{"store":"invoices","id":"invoice","kind":"put","baseRevision":0,"value":{"id":"invoice","invNo":"PUSH-001","grandTotal":123},"mediaRefs":[]},{"store":"payments","id":"payment","kind":"put","baseRevision":0,"value":{"id":"payment","invoiceId":"invoice","amountUSD":50},"mediaRefs":[]},{"store":"settings","id":"cashbox-entry/expense","kind":"put","baseRevision":0,"value":{"id":"cashbox-entry/expense","type":"expense","legs":[{"units":-300,"currency":"USD"}]},"mediaRefs":[]}]'::jsonb,
    'pushEvents','[{"store":"invoices","id":"invoice","revision":1,"kind":"proforma","action":"created","details":{"amount":123,"currency":"USD"}},{"store":"payments","id":"payment","revision":1,"kind":"payment","action":"created","details":{"amount":50,"currency":"USD"}},{"store":"settings","id":"cashbox-entry/expense","revision":1,"kind":"expense","action":"created","details":{"amount":3,"currency":"USD"}}]'::jsonb);
  initial_response=public.wow_service('sync.commit',batch_payload);initial_head=(initial_response->>'commitRevision')::bigint;
  if (select count(*) from public.wow_push_events)<>3 or (select count(*) from public.wow_push_jobs)<>3 then raise exception 'TEST_FAILED_ATOMIC_EVENT_FANOUT';end if;
  if exists(select 1 from public.wow_push_jobs j join public.wow_push_subscriptions s on s.id=j.subscription_id where s.account_id<>owner_id) then raise exception 'TEST_FAILED_FINANCE_RECIPIENT';end if;
  if public.wow_service('sync.commit',batch_payload)<>initial_response or (select count(*) from public.wow_push_events)<>3 or (select count(*) from public.wow_push_jobs)<>3 then raise exception 'TEST_FAILED_RETRY_DUPLICATED_PUSH';end if;

  begin
    perform public.wow_service('sync.commit',batch_payload||jsonb_build_object('batchId','push-invalid-0002','requestHash',repeat('2',64),
      'operations','[{"store":"invoices","id":"bad","kind":"put","baseRevision":0,"value":{"id":"bad"},"mediaRefs":[]}]'::jsonb,
      'pushEvents','[{"store":"invoices","id":"bad","revision":999,"kind":"proforma","action":"created","details":{}}]'::jsonb));
    raise exception 'TEST_FAILED_UNCOMMITTED_EVENT';
  exception when others then if sqlerrm<>'INVALID_PUSH_EVENT' then raise;end if;end;
  if exists(select 1 from public.wow_records where workspace_id=workspace and record_id='"bad"') or
    (select data_revision from public.wow_workspaces where id=workspace)<>initial_head then raise exception 'TEST_FAILED_EVENT_FAILURE_PARTIAL_SAVE';end if;
  perform public.wow_service('sync.commit',batch_payload||jsonb_build_object('batchId','push-bootstrap-0003','origin','bootstrap','requestHash',repeat('3',64),
    'operations','[{"store":"invoices","id":"history","kind":"put","baseRevision":0,"value":{"id":"history"},"mediaRefs":[]}]'::jsonb,'pushEvents','[]'::jsonb));
  if (select count(*) from public.wow_push_events)<>3 then raise exception 'TEST_FAILED_HISTORY_SPAM';end if;
  begin perform public.wow_service('sync.prepare',employee||jsonb_build_object('batchId','worker-history','origin','restore','requestHash',repeat('4',64)));raise exception 'TEST_FAILED_WORKER_SUPPRESSION';
  exception when others then if sqlerrm<>'ACCESS_DENIED' then raise;end if;end;

  queue=public.wow_push_worker('claim','{}')->'jobs';
  if jsonb_array_length(queue)<>3 then raise exception 'TEST_FAILED_CLAIM';end if;
  leased=queue->0;second_job=queue->1;
  if public.wow_push_worker('recheck',leased)->>'allowed'<>'true' or
    public.wow_push_worker('prepare',leased)->'recipient'->>'userId'<>owner_id::text then raise exception 'TEST_FAILED_DISPATCH_SCOPE';end if;
  perform public.wow_push_worker('finish',leased||jsonb_build_object('leaseToken',gen_random_uuid(),'status','sent'));
  if (select status from public.wow_push_jobs where id=(leased->>'jobId')::bigint)<>'leased' then raise exception 'TEST_FAILED_FORGED_LEASE';end if;
  perform public.wow_push_worker('finish',leased||'{"status":"retry","httpStatus":503,"errorCode":"PROVIDER_UNAVAILABLE","retryAfter":30}'::jsonb);
  if not exists(select 1 from public.wow_push_jobs where id=(leased->>'jobId')::bigint and status='pending' and attempts=1 and next_attempt_at>now()+interval '29 seconds' and lease_token is null) then raise exception 'TEST_FAILED_RETRY_SCHEDULE';end if;
  perform public.wow_push_worker('finish',second_job||'{"status":"dead","httpStatus":410,"errorCode":"ENDPOINT_GONE"}'::jsonb);
  if exists(select 1 from public.wow_push_live_subscriptions where id=first_sub) or exists(select 1 from public.wow_push_jobs where subscription_id=first_sub and status in ('pending','leased')) then raise exception 'TEST_FAILED_DEAD_ENDPOINT_CLEANUP';end if;
  if public.wow_push_worker('recheck',queue->2)->>'allowed'<>'false' then raise exception 'TEST_FAILED_REVOKED_DISPATCH';end if;

  perform public.wow_service('push.subscribe',actor||subscribe_data);
  response=public.wow_service('push.test',actor||jsonb_build_object('deviceId','test-device-0001'));test_id=(response->>'eventId')::uuid;
  if (select count(*) from public.wow_push_jobs where event_id=test_id)<>1 then raise exception 'TEST_FAILED_TEST_TARGET';end if;
  leased=public.wow_push_worker('claim','{}')->'jobs'->0;
  update public.wow_push_jobs set lease_until=now()-interval '1 second' where id=(leased->>'jobId')::bigint;
  response=public.wow_push_worker('recheck',leased);
  if response->>'allowed'<>'false' or
    not exists(select 1 from public.wow_push_jobs where id=(leased->>'jobId')::bigint and status='pending' and last_error='LEASE_EXPIRED') then raise exception 'TEST_FAILED_EXPIRED_LEASE_LOST_EVENT';end if;
  update public.wow_push_jobs set next_attempt_at=now() where id=(leased->>'jobId')::bigint;
  leased=public.wow_push_worker('claim','{}')->'jobs'->0;
  update auth.users set banned_until=now()+interval '1 day' where id=owner_id;
  if public.wow_push_worker('recheck',leased)->>'allowed'<>'false' then raise exception 'TEST_FAILED_BANNED_RECIPIENT';end if;
  begin perform public.wow_service('session.snapshot',actor);raise exception 'TEST_FAILED_BANNED_ACTOR';
  exception when others then if sqlerrm<>'AUTH_REQUIRED' then raise;end if;end;
  update auth.users set banned_until=null where id=owner_id;

  response=public.wow_service('push.test',actor||jsonb_build_object('deviceId','test-device-0001'));test_id=(response->>'eventId')::uuid;
  endpoint='https://fcm.googleapis.com/fcm/send/rollback-rotated-fixture';
  subscribe_data=subscribe_data||jsonb_build_object('subscription',subscription||jsonb_build_object('endpoint',endpoint),
    'endpointHash',encode(extensions.digest(convert_to(endpoint,'UTF8'),'sha256'),'hex'));
  perform public.wow_service('push.subscribe',actor||subscribe_data);
  if exists(select 1 from public.wow_push_subscriptions where id=first_sub and active) or
    (select count(*) from public.wow_push_live_subscriptions where account_id=owner_id)<>1 or
    exists(select 1 from public.wow_push_jobs where event_id=test_id and status in ('pending','leased')) then raise exception 'TEST_FAILED_ROTATION';end if;
  response=public.wow_service('push.test',actor||jsonb_build_object('deviceId','test-device-0001'));
  update public.wow_accounts set session_version=session_version+1 where id=owner_id returning session_version into changed_version;
  if exists(select 1 from public.wow_push_live_subscriptions where account_id=owner_id) or
    exists(select 1 from public.wow_push_jobs j join public.wow_push_subscriptions s on s.id=j.subscription_id where s.account_id=owner_id and j.status in ('pending','leased')) then raise exception 'TEST_FAILED_EPOCH_REVOCATION';end if;
end $$;
select 'WOW_PUSH_TRANSACTION_GATE_PASSED' as result;
rollback;
