-- Run after the additive schema, through the management connection.
-- This gate rolls all fixtures back, including three synthetic Auth rows with
-- no password, identity provider or usable login token. It never borrows a real
-- user's identity. Sequence gaps from rolled-back tests are normal. Do not
-- remove ROLLBACK or run individual fragments outside this transaction.
begin;
do $$
declare
  owner_id uuid=gen_random_uuid(); worker_id uuid=gen_random_uuid(); setup_user uuid=gen_random_uuid();
  owner_session uuid=gen_random_uuid(); worker_session uuid=gen_random_uuid();
  workspace uuid=gen_random_uuid(); setup_workspace uuid=gen_random_uuid();
  raw_email text; proof_hash text=repeat(md5(gen_random_uuid()::text),2);
  actor jsonb; employee jsonb; response jsonb; before_touch timestamptz; after_touch timestamptz;
  owner_permissions jsonb; batch_payload jsonb; initial_head bigint; initial_version bigint; found_revision bigint;
begin
  if has_function_privilege('anon','public.wow_service(text,jsonb)','execute') or
     has_function_privilege('authenticated','public.wow_service(text,jsonb)','execute') or
     has_table_privilege('authenticated','public.wow_records','select') or
     has_table_privilege('anon','public.wow_accounts','select') then raise exception 'TEST_FAILED_BROWSER_GRANTS'; end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='wow_files_server_only' and permissive='RESTRICTIVE') then raise exception 'TEST_FAILED_STORAGE_GUARD'; end if;
  insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,created_at,updated_at,is_anonymous)
    select id,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated',
      'rollback-gate-'||id::text||'@wow.invalid',now(),now(),now(),false from unnest(array[owner_id,worker_id,setup_user]) as fixture(id);
  select jsonb_agg(permission order by permission) into owner_permissions from public.wow_permission_catalog;
  insert into public.wow_workspaces(id,name) values(workspace,'WOW SQL transaction test'),(setup_workspace,'WOW setup test');
  insert into public.wow_accounts(id,workspace_id,login_email,username,name,role,permissions)
    values(owner_id,workspace,'test-owner-'||owner_id::text||'@wow.invalid','test.owner','Test owner','owner',array(select jsonb_array_elements_text(owner_permissions))),
      (worker_id,workspace,'test-worker-'||worker_id::text||'@wow.invalid','test.worker','Test worker','carpentry',array['manufacturing.view','manufacturing.edit']);
  insert into auth.sessions(id,user_id,created_at,updated_at,aal) values(owner_session,owner_id,now(),now(),'aal1'),(worker_session,worker_id,now(),now(),'aal1');
  actor=jsonb_build_object('userId',owner_id,'sessionId',owner_session);
  employee=jsonb_build_object('userId',worker_id,'sessionId',worker_session);
  response=public.wow_service('session.open',actor);
  if response->'identity'->'currentAccount'->>'role'<>'owner' then raise exception 'TEST_FAILED_OWNER_IDENTITY'; end if;
  perform public.wow_service('session.open',employee);

  -- Owner persists through idle/max boundaries; a snapshot is not activity.
  update public.wow_sessions set started_at=now()-interval '2 days',last_active_at=now()-interval '1 day' where session_id=owner_session;
  select last_active_at into before_touch from public.wow_sessions where session_id=owner_session;
  perform public.wow_service('session.snapshot',actor);
  select last_active_at into after_touch from public.wow_sessions where session_id=owner_session;
  if after_touch<>before_touch then raise exception 'TEST_FAILED_SNAPSHOT_EXTENDED_IDLE'; end if;
  update public.wow_sessions set last_active_at=now()-interval '31 minutes' where session_id=worker_session;
  begin perform public.wow_service('session.snapshot',employee);raise exception 'TEST_FAILED_IDLE_ALLOWED';
  exception when others then if sqlerrm<>'SESSION_EXPIRED' then raise; end if;end;
  update public.wow_sessions set started_at=now()-interval '9 hours',last_active_at=now() where session_id=worker_session;
  begin perform public.wow_service('session.touch',employee);raise exception 'TEST_FAILED_MAX_ALLOWED';
  exception when others then if sqlerrm<>'SESSION_EXPIRED' then raise; end if;end;
  update public.wow_sessions set started_at=now(),last_active_at=now() where session_id=worker_session;
  begin perform public.wow_service('session.snapshot',actor||jsonb_build_object('sessionId',worker_session));raise exception 'TEST_FAILED_MISMATCHED_SESSION';
  exception when others then if sqlerrm<>'AUTH_REQUIRED' then raise; end if;end;

  -- Direct Dashboard status/permission edits invalidate stale prepared writes.
  select session_version into initial_version from public.wow_accounts where id=worker_id;
  update public.wow_accounts set status='suspended' where id=worker_id;
  if (select session_version from public.wow_accounts where id=worker_id)<=initial_version then raise exception 'TEST_FAILED_DASHBOARD_VERSION'; end if;
  begin perform public.wow_service('session.snapshot',employee);raise exception 'TEST_FAILED_SUSPENSION_ALLOWED';
  exception when others then if sqlerrm<>'ACCOUNT_UNAVAILABLE' then raise; end if;end;
  update public.wow_accounts set status='active' where id=worker_id;
  begin perform public.wow_service('session.snapshot',employee);raise exception 'TEST_FAILED_REVOKED_ALLOWED';
  exception when others then if sqlerrm<>'SESSION_REVOKED' then raise; end if;end;
  update public.wow_sessions set session_version=(select session_version from public.wow_accounts where id=worker_id) where session_id=worker_session;
  begin perform public.wow_service('sync.inspect',employee||'{"records":[{"store":"products","id":"missing"}]}'::jsonb);raise exception 'TEST_FAILED_EMPLOYEE_INSPECT';
  exception when others then if sqlerrm<>'ACCESS_DENIED' then raise; end if;end;

  -- Whole batch, typed ids, exact retry replay, and independent delta cursor.
  batch_payload=actor||jsonb_build_object('batchId','test-batch-0001','deviceId','sql-test','requestHash',repeat('1',64),'expectedSessionVersion',1,
    'operations','[{"store":"products","id":7,"kind":"put","baseRevision":0,"value":{"id":7,"name":"Number"},"mediaRefs":[]},{"store":"products","id":"7","kind":"put","baseRevision":0,"value":{"id":"7","name":"String"},"mediaRefs":[]},{"store":"invoices","id":"invoice","kind":"put","baseRevision":0,"value":{"id":"invoice","invNo":"TEST-001"},"mediaRefs":[]}]'::jsonb,
    'guards','[]'::jsonb,'sourceProductIds','[]'::jsonb,'projected','[]'::jsonb);
  response=public.wow_service('sync.commit',batch_payload);
  initial_head=(response->>'commitRevision')::bigint;
  if (select count(*) from public.wow_records where workspace_id=workspace)<>3 then raise exception 'TEST_FAILED_TYPED_IDS'; end if;
  if public.wow_service('sync.commit',batch_payload)<>response then raise exception 'TEST_FAILED_REPLAY'; end if;
  if exists(select 1 from public.wow_records where workspace_id=workspace and revision<>1) then raise exception 'TEST_FAILED_REPLAY_CHANGED_REVISION'; end if;
  begin perform public.wow_service('sync.commit',batch_payload||jsonb_build_object('requestHash',repeat('2',64)));raise exception 'TEST_FAILED_REUSED_BATCH';
  exception when others then if sqlerrm<>'IDEMPOTENCY_MISMATCH' then raise; end if;end;
  response=public.wow_service('sync.pull',actor||'{"cursor":0,"limit":1}'::jsonb);
  if jsonb_array_length(response->'records')<>1 or response->>'hasMore'<>'true' or (response->>'cursor')::bigint>=initial_head then raise exception 'TEST_FAILED_PAGINATION'; end if;
  response=public.wow_service('sync.inspect',actor||'{"records":[{"store":"products","id":"missing"}]}'::jsonb);
  if response->'changes'->0->>'revision'<>'0' or response->'changes'->0->>'deleted'<>'true' then raise exception 'TEST_FAILED_MISSING_INSPECTION'; end if;

  -- A conflict in one item rolls the entire attempted batch back.
  begin
    perform public.wow_service('sync.commit',batch_payload||jsonb_build_object('batchId','test-batch-0002','operations',
      '[{"store":"products","id":7,"kind":"put","baseRevision":0,"value":{"id":7,"name":"STALE"},"mediaRefs":[]},{"store":"payments","id":"leak","kind":"put","baseRevision":0,"value":{"id":"leak"},"mediaRefs":[]}]'::jsonb));
    raise exception 'TEST_FAILED_CONFLICT_ALLOWED';
  exception when others then if sqlerrm<>'CONFLICT' then raise; end if;end;
  if exists(select 1 from public.wow_records where workspace_id=workspace and store='payments') or
     (select data_revision from public.wow_workspaces where id=workspace)<>initial_head then raise exception 'TEST_FAILED_PARTIAL_BATCH'; end if;
  begin
    perform public.wow_service('sync.commit',batch_payload||jsonb_build_object('batchId','test-batch-0003','operations',
      '[{"store":"payments","id":"also-leak","kind":"put","baseRevision":0,"value":{"id":"also-leak"},"mediaRefs":[]},{"store":"invoices","id":"duplicate","kind":"put","baseRevision":0,"value":{"id":"duplicate","invNo":" test-001 "},"mediaRefs":[]}]'::jsonb));
    raise exception 'TEST_FAILED_INVOICE_UNIQUENESS';
  exception when others then if sqlerrm<>'DUPLICATE_INVOICE_NUMBER' then raise; end if;end;
  if exists(select 1 from public.wow_records where workspace_id=workspace and store='payments') then raise exception 'TEST_FAILED_UNIQUE_PARTIAL_BATCH'; end if;
  perform public.wow_service('sync.commit',batch_payload||jsonb_build_object('batchId','test-batch-0004','operations',
    '[{"store":"products","id":7,"kind":"delete","baseRevision":1,"mediaRefs":[]}]'::jsonb));
  select revision into found_revision from public.wow_records where workspace_id=workspace and store='products' and record_id='7'::jsonb and deleted_at is not null;
  if found_revision<>2 then raise exception 'TEST_FAILED_TOMBSTONE'; end if;

  -- Immutable upload timestamps survive lost acknowledgements; raw reference
  -- expansion uses bounded seek pages instead of aggregating all related rows.
  response=public.wow_service('media.stage',actor||jsonb_build_object('record',jsonb_build_object('id','photo','storagePath',workspace::text||'/fixture/photo.png','size',3,'contentType','image/png')));
  response=public.wow_service('media.ready',actor||jsonb_build_object('storagePath',workspace::text||'/fixture/photo.png'));
  if public.wow_service('media.ready',actor||jsonb_build_object('storagePath',workspace::text||'/fixture/photo.png'))<>response then raise exception 'TEST_FAILED_MEDIA_RETRY_TIMESTAMP';end if;
  insert into public.wow_records(workspace_id,store,record_id,payload,revision,updated_by)
    select workspace,'products',to_jsonb('reference-'||g),jsonb_build_object('id','reference-'||g,'image','wfmedia:photo'),1,owner_id from generate_series(1,54) g;
  insert into public.wow_media_links(workspace_id,media_key,store,record_id)
    select workspace,'photo','products',to_jsonb('reference-'||g) from generate_series(1,54) g;
  response=public.wow_service('media.references',actor||'{"ids":["photo"]}'::jsonb);
  if jsonb_array_length(response->'references')<>50 or response->>'hasMore'<>'true' then raise exception 'TEST_FAILED_MEDIA_REFERENCE_PAGE';end if;
  response=public.wow_service('media.references',actor||jsonb_build_object('ids','["photo"]'::jsonb,'after',response->'cursor'));
  if jsonb_array_length(response->'references')<>4 or response->>'hasMore'<>'false' then raise exception 'TEST_FAILED_MEDIA_REFERENCE_CURSOR';end if;

  -- The last owner cannot disappear through SQL or Dashboard edits.
  begin update public.wow_accounts set role='custom',permissions='{}' where id=owner_id;raise exception 'TEST_FAILED_LAST_OWNER';
  exception when others then if sqlerrm<>'LAST_OWNER' then raise; end if;end;
  update public.wow_accounts set session_version=session_version+1 where id=owner_id;
  update public.wow_sessions set session_version=(select session_version from public.wow_accounts where id=owner_id) where session_id=owner_session;
  begin perform public.wow_service('sync.prepare',actor||jsonb_build_object('batchId','test-batch-0001','requestHash',repeat('1',64)));raise exception 'TEST_FAILED_OLD_PROJECTION_REPLAY';
  exception when others then if sqlerrm<>'BATCH_SESSION_CHANGED' then raise; end if;end;

  -- A consumed proof cannot enroll a second owner; no visitor becomes owner.
  insert into public.wow_setup_claims(token_hash,workspace_id,expires_at) values(proof_hash,setup_workspace,now()+interval '5 minutes');
  perform public.wow_service('setup.inspect',jsonb_build_object('claimHash',proof_hash));
  select email into raw_email from auth.users where id=setup_user;
  perform public.wow_service('setup.claim',jsonb_build_object('claimHash',proof_hash,'workspaceId',setup_workspace,'userId',setup_user,'email',raw_email,
    'profile',jsonb_build_object('role','owner','name','Test setup','username','test.setup','permissions',owner_permissions)));
  begin perform public.wow_service('setup.inspect',jsonb_build_object('claimHash',proof_hash));raise exception 'TEST_FAILED_PROOF_REPLAY';
  exception when others then if sqlerrm<>'SETUP_PROOF_INVALID' then raise; end if;end;
end $$;
select 'WOW_SQL_TRANSACTION_GATE_PASSED' as result;
rollback;
