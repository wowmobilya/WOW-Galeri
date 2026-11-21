import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createProviderTestDatabase} from '../supabase/testing/provider-fixtures.mjs';
import {createOperationsActions} from '../supabase/functions/wow-cloud/modules/operations.mjs';
const wid='10000000-0000-4000-8000-000000000001',owner='20000000-0000-4000-8000-000000000001',worker='20000000-0000-4000-8000-000000000002';
const ownerSession='30000000-0000-4000-8000-000000000001',workerSession='30000000-0000-4000-8000-000000000002';
test('unattended operational tick recovers leases once, honors disabled mode, and never changes business records',async()=>{
 const db=await createProviderTestDatabase();
 try{
  await db.exec(await readFile(new URL('../supabase/modules/operations.sql',import.meta.url),'utf8'));
  await db.exec(`begin;
   insert into public.wow_workspaces(id,name) values('${wid}','Operations test');
   insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values
    ('${owner}','owner@example.test',now(),now(),now()),('${worker}','worker@example.test',now(),now(),now());
   insert into public.wow_accounts(id,workspace_id,login_email,username,name,role,permissions) values
    ('${owner}','${wid}','owner@example.test','owner','Owner','owner','{}'),
    ('${worker}','${wid}','worker@example.test','worker','Worker','custom','{products.view}');
   insert into auth.sessions(id,user_id,created_at,updated_at) values('${ownerSession}','${owner}',now(),now()),('${workerSession}','${worker}',now(),now());
   insert into public.wow_sessions(session_id,account_id,session_version) values('${ownerSession}','${owner}',1),('${workerSession}','${worker}',1);
   insert into public.wow_records(workspace_id,store,record_id,payload,revision,updated_by)
    values('${wid}','products','"product"','{"id":"product","name":"Unchanged product"}',1,'${owner}');
   insert into public.wow_push_subscriptions(id,workspace_id,account_id,session_id,session_version,device_id,endpoint,endpoint_hash,p256dh,auth_key)
    values('40000000-0000-4000-8000-000000000001','${wid}','${owner}','${ownerSession}',1,'owner-device-1',
     'https://fcm.googleapis.com/fcm/send/test',repeat('a',64),repeat('A',87),repeat('B',22));
   insert into public.wow_push_events(id,workspace_id,actor_id,record_store,record_id,record_revision,kind,action,details)
    values('50000000-0000-4000-8000-000000000001','${wid}','${owner}','test','"test"',1,'test','test','{}');
   insert into public.wow_push_jobs(event_id,subscription_id,status,attempts,lease_token,lease_until)
    values('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','leased',2,gen_random_uuid(),now()-interval '1 minute');
  `);
  const rpc=async(action,who=owner,sid=ownerSession,extra={})=>(await db.query('select public.wow_operations_service($1,$2::jsonb) as value',[action,JSON.stringify({userId:who,sessionId:sid,...extra})])).rows[0].value;
  await db.exec('savepoint denied');
  await assert.rejects(rpc('operations.snapshot',worker,workerSession),/ACCESS_DENIED/);
  await db.exec('rollback to savepoint denied');
  const before=(await db.query('select payload,revision from public.wow_records')).rows;
  const initial=await rpc('operations.snapshot');assert.equal(initial.settings.stale,true);assert.equal(initial.scheduler,true);
  assert.equal((await db.query('select public.wow_operations_health() h')).rows[0].h.ok,false,'external readiness fails without a first heartbeat');
  const checked=await rpc('operations.check');
  assert.equal(checked.settings.lastResult.recoveredLeases,1);
  assert.equal(checked.settings.stale,false);
  assert.equal((await db.query('select public.wow_operations_health() h')).rows[0].h.ok,true);
  await db.exec("update cron.job set schedule='0 0 * * *' where jobname='wow-operations'");
  assert.equal((await rpc('operations.snapshot')).scheduler,false,'a stale cadence is not a healthy scheduler');
  assert.equal((await db.query('select public.wow_operations_health() h')).rows[0].h.ok,false);
  await db.exec("update cron.job set schedule='*/5 * * * *' where jobname='wow-operations'");
  assert.equal(checked.queue.pending,1);
  assert(checked.incidents.some(i=>i.code==='PUSH_NOT_CONFIGURED'&&i.active));
  await rpc('operations.check');
  assert.equal((await db.query('select count(*)::int n from wow_ops.notifications')).rows[0].n,1,'unchanged incident sends one notice');
  await db.exec("update public.wow_push_control set enabled=true where singleton;select cron.schedule('wow-push-retry','0 0 * * *','select public.wow_push_wake();')");
  await rpc('operations.check');
  assert.equal((await db.query("select schedule from cron.job where jobname='wow-push-retry'")).rows[0].schedule,'* * * * *','repairs the exact reviewed push cadence');
  const settings=await rpc('operations.configure',owner,ownerSession,{enabled:false,revision:1});
  assert.equal(settings.settings.enabled,false);
  await db.exec("update public.wow_push_jobs set status='leased',attempts=12,lease_token=gen_random_uuid(),lease_until=now()-interval '1 minute'");
  const disabled=await rpc('operations.check');assert.equal(disabled.settings.lastResult.status,'disabled');
  assert.equal((await db.query('select status from public.wow_push_jobs')).rows[0].status,'leased');
  await rpc('operations.configure',owner,ownerSession,{enabled:true,revision:2});
  const capped=await rpc('operations.check');
  assert.equal(capped.queue.failed,1,'expired leases do not reset exhausted retry budgets');
  assert(capped.incidents.some(i=>i.code==='PUSH_FAILURES'&&i.active));
  await db.exec('savepoint stale');
  await assert.rejects(rpc('operations.configure',owner,ownerSession,{enabled:false,revision:1}),/CONFLICT/);
  await db.exec('rollback to savepoint stale');
  await db.exec('alter table public.wow_records disable row level security');
  const insecure=await rpc('operations.check');assert(insecure.incidents.some(i=>i.code==='RLS_DISABLED'&&i.active));
  await db.exec('alter table public.wow_records enable row level security');
  const secure=await rpc('operations.check');assert(secure.incidents.some(i=>i.code==='RLS_DISABLED'&&!i.active&&i.resolved_at));
  assert.deepEqual((await db.query('select payload,revision from public.wow_records')).rows,before);
  const permissions=await db.query("select has_function_privilege('anon','public.wow_operations_tick(uuid)','execute') a,has_function_privilege('authenticated','public.wow_operations_service(text,jsonb)','execute') b,has_schema_privilege('anon','wow_ops','usage') c");
  assert.deepEqual(permissions.rows[0],{a:false,b:false,c:false});
  await db.exec('rollback');
  assert.equal((await db.query('select count(*)::int n from wow_ops.runs')).rows[0].n,0);
 }finally{await db.close();}
});

test('Edge operations validation overwrites identity and never reports an unverified integration as verified',async()=>{
 const calls=[];const moduleRpc=async(...args)=>{calls.push(args);return {settings:{enabled:true}};};
 const actions=createOperationsActions({moduleRpc});
 const result=await actions['operations.configure']({body:{enabled:false,revision:1,userId:worker,sessionId:workerSession},actor:{userId:owner,sessionId:ownerSession}});
 assert.equal(calls[0][2].userId,owner);assert.equal(calls[0][2].sessionId,ownerSession);
 assert.equal(result.deployment.planVerified,false);assert.equal(result.deployment.emailVerified,false);
 assert.equal(result.deployment.objectBackupVerified,false);assert.equal(result.deployment.aiConfigured,false);
 await assert.rejects(actions['operations.configure']({body:{enabled:'yes',revision:1},actor:{}}),{code:'INVALID_OPERATION_SETTING'});
});
