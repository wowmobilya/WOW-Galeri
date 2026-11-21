import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createProviderTestDatabase} from '../supabase/testing/provider-fixtures.mjs';
import {createStorageMaintenance} from '../supabase/functions/wow-cloud/modules/maintenance.mjs';
import {createRestDependencies} from '../supabase/functions/wow-cloud/rest.mjs';

const hash='a'.repeat(64),MiB=1024*1024;
const origin='https://abcdefghijklmnopqrst.supabase.co';
test('unattended Storage maintenance runs on the complete PostgreSQL release',async t=>{
  const db=await createProviderTestDatabase();
  t.after(()=>db.close());
  const release=JSON.parse(await readFile(new URL('../supabase/release.json',import.meta.url),'utf8'));
  assert(release.migrations.includes('modules/maintenance.sql'));
  for(const name of release.migrations.slice(1))await db.exec(await readFile(new URL('../supabase/'+name,import.meta.url),'utf8'));
  const wid=randomUUID(),owner={userId:randomUUID(),sessionId:randomUUID()},buyer={userId:randomUUID(),sessionId:randomUUID()};
  const rows=async(sql,args=[])=>(await db.query(sql,args)).rows;
  const one=async(sql,args=[])=>(await rows(sql,args))[0];
  const val=async(sql,args=[])=>(await one(sql,args)).v;
  const rpc=(action,data={})=>val('select public.wow_storage_maintenance($1,$2::jsonb) v',[action,JSON.stringify(data)]);
  const gallery=(action,data,actor=owner)=>val('select public.wow_gallery_service($1,$2::jsonb) v',[action,JSON.stringify({...data,...actor})]);
  const health=()=>val('select wow_ops.storage_status($1) v',[wid]);
  const lease=async()=> (await rpc('claim')).jobs;
  const metadata=(actor,size=12,id=randomUUID())=>({commandId:id,digest:hash,purpose:actor===owner?'presentation':'print',size,type:'png'});
  async function image(actor,ready,size=12){
    const input=metadata(actor,size);
    const {path}=await gallery('gallery.image.prepare',input,actor);
    if(ready)await gallery('gallery.image.commit',input,actor);
    return {input,path,id:input.commandId};
  }
  const age=(id,interval)=>db.query('update public.wow_gallery_assets set created_at=now()-$2::interval,touched_at=null where id=$1',[id,interval]);
  const lifecycle=id=>val('select lifecycle v from public.wow_gallery_assets where id=$1',[id]);
  async function rejects(action,pattern){
    await db.exec('savepoint expected_rejection');
    try{await assert.rejects(action,pattern);}finally{await db.exec('rollback to expected_rejection; release expected_rejection');}
  }
  async function scenario(title,fn){
    await t.test(title,async()=>{
      await db.exec('begin');
      try{await fn();}finally{await db.exec('rollback');}
    });
  }
  await db.query("insert into public.wow_workspaces(id,name) values($1,'Storage test')",[wid]);
  for(const [role,actor] of [['owner',owner],['customer',buyer]]){
    await db.query('insert into auth.users(id) values($1)',[actor.userId]);
    await db.query('insert into public.wow_accounts(id,workspace_id,login_email,username,name,role,permissions) values($1,$2,$3,$4,$4,$4,$5)',
      [actor.userId,wid,role+'@example.test',role,role==='owner'?[]:['myorders.view','myorders.edit','gallery.view']]);
    await db.query('insert into auth.sessions(id,user_id,created_at) values($1,$2,now())',[actor.sessionId,actor.userId]);
    await db.query('insert into public.wow_sessions(session_id,account_id,session_version) values($1,$2,1)',[actor.sessionId,actor.userId]);
  }
  await scenario('hidden slides/cards, branding, private print profiles, archived order lines and editing grace protect images',async()=>{
    const brand={};
    for(const key of ['logo','social','background','hiddenSlide','hiddenCard','liveCard','snapshot','legacyMedia','detached'])brand[key]=await image(owner,true);
    const print=await image(buyer,true),draft=await image(owner,true),recent=await image(buyer,false);
    const abandoned=await image(owner,false),old=await image(buyer,true);
    const value={logoId:brand.logo.id,ogImageId:brand.social.id,backgroundImageId:brand.background.id,
      slides:[{imageId:brand.hiddenSlide.id,visible:false}],cards:[{imageId:brand.hiddenCard.id,visible:false},{imageId:brand.liveCard.id,visible:true}]};
    const persist=(version,presentation)=>gallery('gallery.presentation',{commandId:randomUUID(),version,value:presentation});
    await persist(0,{...value,slides:[...value.slides,{imageId:brand.detached.id,visible:false}]});
    await age(brand.detached.id,'90 days');
    await persist(1,value);
    await gallery('gallery.preferences',{commandId:randomUUID(),version:0,target:'print',logoId:print.id},buyer);
    const orderId=randomUUID();
    await db.query("insert into public.wow_gallery_orders(id,workspace_id,account_id,number,customer_name,archived_at) values($1,$2,$3,'old','example',now())",[orderId,wid,buyer.userId]);
    await db.query("insert into public.wow_gallery_lines(order_id,product_id,name,price_minor,currency,quantity,image_path,position,hidden) values($1,'1','example',1,'USD',0,$2,1,true)",[orderId,brand.snapshot.path]);
    await db.query("insert into public.wow_records(workspace_id,store,record_id,payload,revision,updated_by) values($1,'media','1',$2::jsonb,1,$3)",[wid,JSON.stringify({id:1,storagePath:brand.legacyMedia.path}),owner.userId]);
    for(const [key,asset] of Object.entries(brand))if(key!=='detached')await age(asset.id,'90 days');
    await age(print.id,'90 days');await age(draft.id,'6 days');await age(recent.id,'23 hours');
    await age(abandoned.id,'26 hours');await age(old.id,'8 days');
    const jobs=await lease();assert.equal(jobs.length,2);
    const prepared=[];
    for(const handle of jobs)prepared.push({handle,...await rpc('prepare',handle)});
    assert.deepEqual(prepared.map(p=>p.path).sort(),[old.path,abandoned.path].sort());
    for(const a of [...Object.values(brand),print,draft,recent])assert.equal(await lifecycle(a.id),'active');
    await rejects(()=>gallery('gallery.image',{assetId:old.id},buyer),/ACCESS_DENIED/);
    await rejects(()=>gallery('gallery.image.prepare',old.input,buyer),/IDEMPOTENCY_MISMATCH/);
    await rejects(()=>gallery('gallery.image.commit',abandoned.input),/IDEMPOTENCY_MISMATCH/);
    await rejects(()=>persist(2,{slides:[{imageId:abandoned.id,visible:false}]}),/ACCESS_DENIED/);
    await rejects(()=>gallery('gallery.preferences',{commandId:randomUUID(),target:'print',version:1,logoId:old.id},buyer),/ACCESS_DENIED/);
    assert.equal((await gallery('gallery.image',{assetId:print.id},buyer)).path,print.path);
    for(const p of prepared)assert.equal((await rpc('finish',{...p.handle,path:p.path,outcome:'removed'})).status,'removed');
    await rejects(()=>gallery('gallery.image.prepare',abandoned.input),/IDEMPOTENCY_MISMATCH/);
    assert.equal((await health()).removed24h,2);
  });
  await scenario('a purchaser cannot monopolize shared bytes and retry, wrong lease/path and lost ACK retain the reservation',async()=>{
    const first=await image(buyer,false,4*MiB);
    for(let i=1;i<16;i++)await image(buyer,false,4*MiB);
    await rejects(()=>image(buyer,false),/INVALID_STORAGE_QUOTA/);
    await image(owner,false);
    await age(first.id,'2 days');
    const [job]=await lease(),prepared=await rpc('prepare',job);
    assert.equal(prepared.path,first.path);
    await rejects(()=>rpc('prepare',{...job,lease:randomUUID()}),/INVALID_STORAGE_LEASE/);
    await rejects(()=>rpc('finish',{...job,path:first.path+'.png',outcome:'removed'}),/INVALID_STORAGE_PATH/);
    assert.equal((await rpc('finish',{...job,path:first.path,outcome:'retry'})).status,'retry');
    const deferred=await one("select next_attempt_at>=now()+interval '5 minutes' as delayed,last_error from wow_ops.storage_jobs where id=$1",[job.id]);
    assert.deepEqual(deferred,{delayed:true,last_error:'STORAGE_UNAVAILABLE'});
    assert.equal((await health()).retrying,1);assert.deepEqual(await lease(),[]);
    await rejects(()=>image(buyer,false),/INVALID_STORAGE_QUOTA/);
    await db.query("update wow_ops.storage_jobs set next_attempt_at=now()-interval '1 second' where id=$1",[job.id]);
    const objects=new Set([first.path]),calls=[];let dropAck=true;
    let failProvider=true;
    const worker=createStorageMaintenance({maintenanceRpc:async(action,data)=>{
      if(action==='finish'&&data.outcome==='removed'&&dropAck){dropAck=false;throw Error('simulated transport loss');}
      return rpc(action,data);
    },storage:{remove:async path=>{
      assert.equal(path,first.path);
      if(failProvider){failProvider=false;throw Error('private provider failure text');}
      calls.push(objects.delete(path));
    }}});
    await assert.rejects(worker(),/STORAGE_MAINTENANCE_DEFERRED/);
    assert.equal(await lifecycle(first.id),'trash');assert.equal((await health()).retrying,1);
    assert.deepEqual(calls,[]);
    assert(await val("select next_attempt_at>=now()+interval '10 minutes' v from wow_ops.storage_jobs where id=$1",[job.id]));
    await db.query('update wow_ops.storage_jobs set next_attempt_at=now() where id=$1',[job.id]);
    await assert.rejects(worker(),/STORAGE_MAINTENANCE_DEFERRED/);
    assert.equal(await lifecycle(first.id),'trash');assert.equal((await health()).leased,1);
    await rejects(()=>rpc('prepare',job),/INVALID_STORAGE_LEASE/);
    await rejects(()=>image(buyer,false),/INVALID_STORAGE_QUOTA/);
    await db.query("update wow_ops.storage_jobs set lease_until=now()-interval '1 second' where id=$1",[job.id]);
    await worker();
    assert.deepEqual(calls,[true,false],'the second exact delete confirms the already-missing object');
    assert.equal(await lifecycle(first.id),'removed');assert.equal((await health()).removed24h,1);
    assert.equal((await rpc('finish',{...job,path:first.path,outcome:'removed'})).status,'gone');
    await image(buyer,false,4*MiB);
    await rejects(()=>gallery('gallery.image.prepare',first.input,buyer),/IDEMPOTENCY_MISMATCH/);
  });
  await scenario('an object still visible in provider metadata keeps its quota, and disabled automation stops a leased deletion',async()=>{
    const a=await image(owner,false);await age(a.id,'3 days');
    await db.query("insert into storage.objects(bucket_id,name) values('wow-files',$1)",[a.path]);
    const [job]=await lease();
    assert.equal((await rpc('finish',{...job,path:a.path,outcome:'removed'})).status,'retry');
    assert.equal(await lifecycle(a.id),'trash');
    assert.equal(await val('select last_error v from wow_ops.storage_jobs where id=$1',[job.id]),'OBJECT_PRESENT');
    await db.query('update wow_ops.storage_jobs set next_attempt_at=now() where id=$1',[job.id]);
    const [second]=await lease();
    await db.query('update wow_ops.settings set enabled=false where workspace_id=$1',[wid]);
    assert.deepEqual(await rpc('prepare',second),{status:'paused'});assert.deepEqual(await lease(),[]);
    assert.equal(await lifecycle(a.id),'trash');
  });
  await scenario('ready gallery paths are immutable, and noncanonical legacy paths cannot delete any object',async()=>{
    const a=await image(owner,true);await age(a.id,'30 days');
    await db.query("update public.wow_gallery_assets set path=$2 where id=$1",[a.id,wid+'/gallery/'+buyer.userId+'/'+randomUUID()+'.png']);
    let physicalCalls=0;
    const worker=createStorageMaintenance({maintenanceRpc:rpc,storage:{remove:async()=>{physicalCalls++;}}});
    await assert.rejects(worker(),/STORAGE_MAINTENANCE_DEFERRED/);assert.equal(physicalCalls,0);
    assert.equal(await val("select last_error v from wow_ops.storage_jobs where object_id=$1",[a.id]),'OBJECT_PROTECTED');
    assert.equal(await lifecycle(a.id),'trash');
  });
  await scenario('hourly, account-count and legacy workspace byte ceilings apply only to new reservations',async()=>{
    const first=await image(buyer,false);
    for(let i=1;i<64;i++)await image(buyer,false);
    await rejects(()=>image(buyer,false),/RATE_LIMITED/);
    assert.equal((await gallery('gallery.image.prepare',first.input,buyer)).path,first.path);
    await db.query("update public.wow_gallery_assets set created_at=now()-interval '2 hours' where workspace_id=$1",[wid]);
    for(let i=0;i<192;i++){
      const a=await image(buyer,false);await age(a.id,'2 hours');
    }
    await rejects(()=>image(buyer,false),/INVALID_STORAGE_QUOTA/);
    // Existing installations may contain more than the new per-account ceiling.
    await db.query('update public.wow_gallery_assets set size_bytes=$1 where workspace_id=$2',[MiB,wid]);
    await rejects(()=>image(owner,false),/INVALID_STORAGE_QUOTA/);
  });
  await scenario('quiet workspaces expire chat and failed personal uploads without opening the app',async()=>{
    const sql=await readFile(new URL('./storage-maintenance-chat-files.sql',import.meta.url),'utf8');
    await db.query("select set_config('fixture.workspace',$1,true),set_config('fixture.owner',$2,true),set_config('fixture.session',$3,true)",[wid,owner.userId,owner.sessionId]);
    await db.exec(sql);
  });
  await scenario('the scan rotates across workspaces and jobs stay within independent scan, lease and expiry limits',async()=>{
    for(let i=0;i<5;i++)await db.query("insert into public.wow_workspaces(id,name) values($1,'quiet fixture')",[randomUUID()]);
    const stale=[];
    for(let i=0;i<40;i++){const a=await image(owner,false);await age(a.id,'2 days');stale.push(a.id);}
    let claimed=await lease();
    assert.equal(await val('select count(*)::int v from wow_ops.settings where storage_last_scan_at is not null'),4);
    if(!claimed.length)claimed=await lease();
    assert.equal(claimed.length,12);
    assert.equal(await val("select count(*)::int v from public.wow_gallery_assets where workspace_id=$1 and lifecycle='trash'",[wid]),30);
    await lease();
    assert.equal(await val('select count(*)::int v from wow_ops.settings where storage_last_scan_at is not null'),6);
    assert(stale.length>claimed.length);
    for(const job of claimed){
      assert.deepEqual(Object.keys(job).sort(),['id','lease']);
      const target=await rpc('prepare',job);
      assert.equal(target.status,'ready');
    }
  });
  await scenario('Cron/Vault target, wake throttle, private grants and owner-only status stay constrained',async()=>{
    const priv=await one("select has_function_privilege('anon','public.wow_storage_maintenance(text,jsonb)','execute') a,has_function_privilege('authenticated','public.wow_storage_wake()','execute') b,has_schema_privilege('authenticated','wow_ops','usage') c,has_function_privilege('authenticated','wow_ops.storage_worker()','execute') d,has_table_privilege('anon','wow_ops.storage_jobs','select') e,has_function_privilege('service_role','public.wow_storage_maintenance(text,jsonb)','execute') s");
    assert.deepEqual(priv,{a:false,b:false,c:false,d:false,e:false,s:true});
    await rejects(()=>rpc('claim',{url:origin}),/INVALID_MAINTENANCE_INPUT/);
    const wake=()=>val('select public.wow_storage_wake() v');
    assert.equal(await wake(),null);assert.equal((await health()).configured,false);
    assert.equal(await val('select count(*)::int v from net.local_test_calls'),0);
    await val('select public.wow_push_configure($1::jsonb) v',[JSON.stringify({projectUrl:origin,publicKey:'a'.repeat(87),privateKey:'b'.repeat(43),workerToken:'c'.repeat(44)})]);
    assert.equal((await health()).configured,true);assert.equal((await health()).scheduler,true);
    assert(await wake());assert.equal(await wake(),null);
    assert.equal(await val('select count(*)::int v from public.wow_push_jobs'),0);
    assert.deepEqual(await one("select url,body,headers ? 'X-Wow-Worker-Token' token from net.local_test_calls"),{url:origin+'/functions/v1/wow-cloud/push-worker',body:{},token:true});
    await db.exec('update public.wow_push_control set storage_last_wake_at=null');
    for(const bad of [origin+'/other','https://zzzzzzzzzzzzzzzzzzzz.supabase.co/functions/v1/wow-cloud/push-worker',origin+'/functions/v1/wow-cloud/push-worker?x=1']){
      await db.query("update vault.secrets set secret=$1 where name='wow_push_worker_url'",[bad]);
      assert.equal(await wake(),null);assert.equal((await health()).configured,false);
    }
    assert.equal(await val('select count(*)::int v from net.local_test_calls'),1);
    await db.exec("update cron.job set schedule='0 1 * * *' where jobname='wow-storage-maintenance'");
    const facts=await health();assert.equal(facts.scheduler,false);
    assert.deepEqual(Object.keys(facts).sort(),['configured','lastScanAt','leased','pending','removed24h','retrying','scheduler']);
  });
});

test('upgrading the original gallery asset table grants grace once and preserves old IDs, paths and timestamps on reapply',async t=>{
  const db=await createProviderTestDatabase();t.after(()=>db.close());
  const w=randomUUID(),u=randomUUID(),id=randomUUID(),path=w+'/gallery/'+u+'/'+id+'.png';
  await db.query("insert into public.wow_workspaces(id,name) values($1,'upgrade')",[w]);
  await db.query('insert into auth.users(id) values($1)',[u]);
  await db.query("insert into public.wow_accounts(id,workspace_id,login_email,username,name,role) values($1,$2,'upgrade@example.test','upgrade','upgrade','owner')",[u,w]);
  await db.exec('create table public.wow_gallery_assets(id uuid primary key,workspace_id uuid not null,account_id uuid not null,purpose text not null,content_type text not null,digest text not null,size_bytes integer not null,path text not null unique,ready boolean not null default false,created_at timestamptz not null default now())');
  await db.query("insert into public.wow_gallery_assets values($1,$2,$3,'print','png',$4,120,$5,true,now()-interval '8 years')",[id,w,u,hash,path]);
  const migration=await readFile(new URL('../supabase/modules/gallery.sql',import.meta.url),'utf8');
  await db.exec(migration);
  let row=(await db.query("select id,path,lifecycle,touched_at>now()-interval '1 minute' as new_grace from public.wow_gallery_assets where id=$1",[id])).rows[0];
  assert.deepEqual(row,{id,path,lifecycle:'active',new_grace:true});
  const first=(await db.query("update public.wow_gallery_assets set touched_at=now()-interval '8 days' where id=$1 returning touched_at::text",[id])).rows[0].touched_at;
  await db.exec(migration);
  row=(await db.query('select touched_at::text from public.wow_gallery_assets where id=$1',[id])).rows[0];
  assert.equal(row.touched_at,first);
});

test('the REST adapter accepts only exact immutable keys and specific Storage acknowledgements',async()=>{
  const w=randomUUID(),a=randomUUID(),id=randomUUID(),path=w+'/gallery/'+a+'/'+id+'.webp';
  let response=()=>Response.json([{name:path}]);
  const calls=[],deps=createRestDependencies({url:origin,serviceKey:'sb_secret_fixture',fetch:async(url,options)=>{
    calls.push({url,options});return response();
  }});
  await deps.storage.remove(path);
  const last=calls.at(-1);
  assert.equal(last.url,origin+'/storage/v1/object/wow-files');assert.equal(last.options.redirect,'error');
  assert.deepEqual(JSON.parse(last.options.body),{prefixes:[path]});
  for(const invalid of [origin+'/'+path,path+'.png',path+'/',path+'?x=1',path.replace('/gallery/','/gallery/../'),path.replace('.webp','.svg')])
    assert.throws(()=>deps.storage.remove(invalid),/INVALID_STORAGE_PATH/);
  assert.equal(calls.length,1);
  for(const success of [()=>Response.json([]),()=>Response.json({code:'NoSuchKey'},{status:404})]){
    response=success;await deps.storage.remove(path);
  }
  for(const invalidAck of [()=>Response.json({}),()=>Response.json([{name:path+'.old'}]),()=>Response.json({code:'NoSuchBucket'},{status:404}),
    ()=>Response.json({code:'AccessDenied'},{status:403}),()=>Response.json({},{status:503})]){
    response=invalidAck;await assert.rejects(deps.storage.remove(path),/STORAGE_UNAVAILABLE/);
  }
  response=()=>Response.json({jobs:[]});await deps.maintenanceRpc('claim',{});
  assert.equal(calls.at(-1).url,origin+'/rest/v1/rpc/wow_storage_maintenance');
  assert.throws(()=>deps.moduleRpc('wow_storage_maintenance','claim',{}),/SERVER_CONFIGURATION/);
});
