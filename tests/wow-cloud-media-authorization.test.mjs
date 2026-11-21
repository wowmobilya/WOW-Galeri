import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createProviderTestDatabase} from '../supabase/testing/provider-fixtures.mjs';
import {createHandler} from '../supabase/functions/wow-cloud/core.mjs';
const require=createRequire(import.meta.url);
const policy=require('../accounts-policy.js'),dataPolicy=require('../accounts-data-policy.js'),costCore=require('../product-cost-core.js');

test('new media references require existing visible authority or exact actor uploads, with commit-time race protection',async(t)=>{
 const db=await createProviderTestDatabase();t.after(()=>db.close());
 const wid=randomUUID(),owner=randomUUID(),worker=randomUUID(),ownerSession=randomUUID(),workerSession=randomUUID();
 await db.query('insert into public.wow_workspaces(id,name) values($1,$2)',[wid,'Media authorization']);
 for(const [uid,sid,role,permissions] of [[owner,ownerSession,'owner',[]],[worker,workerSession,'custom',['products.view','products.edit']]]){
  await db.query('insert into auth.users(id) values($1)',[uid]);
  await db.query('insert into public.wow_accounts(id,workspace_id,login_email,username,name,role,permissions) values($1,$2,$3,$4,$4,$5,$6)',[uid,wid,uid+'@example.test',role,role,permissions]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,uid]);
  await db.query('insert into public.wow_sessions(session_id,account_id,session_version) values($1,$2,1)',[sid,uid]);
 }
 async function seed(store,id,value,refs=[]){
  await db.query('insert into public.wow_records(workspace_id,store,record_id,payload,revision,updated_by) values($1,$2,$3::jsonb,$4::jsonb,1,$5)',[wid,store,JSON.stringify(id),JSON.stringify(value),owner]);
  for(const media of refs)await db.query('insert into public.wow_media_links(workspace_id,media_key,store,record_id) values($1,$2,$3,$4::jsonb)',[wid,media,store,JSON.stringify(id)]);
 }
 const secret={id:'private-photo',storagePath:wid+'/private-fixture.png',contentType:'image/png',size:3};
 const visible={id:'public-photo',storagePath:wid+'/visible-fixture.png',contentType:'image/png',size:3};
 await seed('media',secret.id,secret);await seed('media',visible.id,visible);
 await seed('invoices','private-invoice',{id:'private-invoice',image:'wfmedia:'+secret.id},[secret.id]);
 await seed('products','hidden-cost',{id:'hidden-cost',name:'Visible name',costing:{invoicePhoto:'wfmedia:'+secret.id}},[secret.id]);
 await seed('products','visible-source',{id:'visible-source',name:'Allowed source',image:'wfmedia:'+visible.id},[visible.id]);
 const token=sid=>'header.'+Buffer.from(JSON.stringify({session_id:sid})).toString('base64url')+'.signature';
 let beforeCommit=null;
 const handler=createHandler({policy,dataPolicy,costCore,auth:{getUser:async jwt=>({id:jwt===token(ownerSession)?owner:worker})},storage:{sign:async()=>assert.fail('the test does not sign an unproven asset')},
  rpc:async(action,data)=>{
   if(action==='sync.commit'&&data.userId===worker&&beforeCommit){const run=beforeCommit;beforeCommit=null;await run();}
   try{return (await db.query('select public.wow_service($1,$2::jsonb) v',[action,JSON.stringify(data)])).rows[0].v;}
   catch(error){throw Object.assign(error,{code:error.message,status:error.message==='CONFLICT'?409:error.message==='ACCESS_DENIED'?403:503});}
  }});
 const call=async(body,sid=workerSession)=>handler(new Request('https://example.test/functions/v1/wow-cloud',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token(sid)},body:JSON.stringify(body)}));
 const put=(id,image,baseRevision=0,extra={})=>({store:'products',id,kind:'put',baseRevision,value:{id,name:'Product',...(image?{image}:{}),...extra}});
 const push=async(operations,sid=workerSession)=>call({action:'sync.push',batchId:randomUUID(),deviceId:'device-fixture',operations},sid);
 const denied=await push([put('copied-private','wfmedia:'+secret.id)]);assert.equal(denied.status,403);
 assert.equal((await db.query("select count(*)::int n from public.wow_records where store='products' and record_id='\"copied-private\"'")).rows[0].n,0);
 assert.equal((await push([put('hidden-cost','wfmedia:'+secret.id,1)])).status,403,'a protected field cannot become a visible authorization witness');
 assert.equal((await push([{store:'media',id:secret.id,kind:'put',baseRevision:1,value:secret},put('bootstrap-private','wfmedia:'+secret.id)])).status,403,'candidate references and unchanged private metadata cannot authorize themselves');
 const own={id:'worker-photo',storagePath:wid+'/worker-fixture.png',contentType:'image/png',size:3,updatedAt:'2026-11-21T00:00:00Z'};
 await db.query('insert into public.wow_media_uploads(workspace_id,account_id,record_id,storage_path,content_type,size,ready) values($1,$2,$3::jsonb,$4,$5,3,true)',[wid,worker,JSON.stringify(own.id),own.storagePath,own.contentType]);
 assert.equal((await push([{store:'media',id:own.id,kind:'put',baseRevision:0,value:own},put('own-image','wfmedia:'+own.id)])).status,200);
 assert.equal((await push([put('own-next-batch','wfmedia:'+own.id)])).status,200,'an exact earlier actor upload remains usable after its metadata was committed');
 assert.equal((await push([put('reuse-visible','wfmedia:'+visible.id)])).status,200);
 const hiddenEdit=await push([put('hidden-cost',null,1,{name:'Updated safe title'})]);assert.equal(hiddenEdit.status,200);
 const preserved=(await db.query("select payload from public.wow_records where store='products' and record_id='\"hidden-cost\"'")).rows[0].payload;
 assert.equal(preserved.costing.invoicePhoto,'wfmedia:'+secret.id);
 // Use a second visible image, whose only authorization witness is removed by
 // a legitimate owner batch after preparation and before worker commit.
 const race={id:'race-photo',storagePath:wid+'/race-fixture.png',contentType:'image/png',size:3};
 await seed('media',race.id,race);await seed('products','race-source',{id:'race-source',name:'Racing source',image:'wfmedia:'+race.id},[race.id]);
 beforeCommit=async()=>{assert.equal((await push([put('unrelated-update',null)],ownerSession)).status,200);};
 assert.equal((await push([put('unrelated-race', 'wfmedia:'+own.id)])).status,200,'an unrelated concurrent write retries proof internally instead of blocking the staff outbox');
 beforeCommit=async()=>{assert.equal((await push([put('race-source',null,1)],ownerSession)).status,200);};
 const stale=await push([put('racing-copy','wfmedia:'+race.id)]);assert.equal(stale.status,403);
 const error=await stale.json();assert.equal(error.error.code,'ACCESS_DENIED');assert(!JSON.stringify(error).includes('race-source'));
 assert.equal((await db.query("select count(*)::int n from public.wow_records where record_id='\"racing-copy\"'")).rows[0].n,0);
 const retryBody={action:'sync.push',batchId:randomUUID(),deviceId:'device-fixture',operations:[put('bounded-race','wfmedia:'+own.id)]};
 let disturbances=0;const disturb=async()=>{assert.equal((await push([put('other-'+(++disturbances),null)],ownerSession)).status,200);beforeCommit=disturb;};
 beforeCommit=disturb;const busy=await call(retryBody);assert.equal(busy.status,503);assert.equal((await busy.json()).error.code,'MEDIA_RECHECK_REQUIRED');assert.equal(disturbances,3);
 beforeCommit=null;const accepted=await (await call(retryBody)).json(),replayed=await (await call(retryBody)).json();
 assert.equal(accepted.ok,true);assert.deepEqual(replayed,accepted,'bounded contention preserves the stable retry identity');
 assert.equal((await db.query('select count(*)::int n from public.wow_batches where batch_id=$1',[retryBody.batchId])).rows[0].n,1);
 await seed('media',7,{id:7,storagePath:wid+'/numeric.png'});
 await assert.rejects(seed('media','7',{id:'7',storagePath:wid+'/string.png'}),error=>error.constraint==='wow_records_media_key_idx',
  'database uniqueness prevents typed media aliases from sharing the same string reference');
});
