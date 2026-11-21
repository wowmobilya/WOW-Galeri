import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createECDH,createHash,randomBytes,randomUUID} from 'node:crypto';
import {createProviderTestDatabase} from '../supabase/testing/provider-fixtures.mjs';
import {createPushWorker} from '../supabase/functions/wow-cloud/push-worker.mjs';
const require=createRequire(new URL('../supabase/package.json',import.meta.url));
const webPush=require('web-push'),ece=require('http_ece');

test('committed chat, gallery and owner notices cross the durable encrypted worker with exact recipients and fresh authorization',async()=>{
  const db=await createProviderTestDatabase(),workspace=randomUUID(),foreign=randomUUID(),devices=new Map();
  const rows=async(sql,args=[])=>(await db.query(sql,args)).rows;
  const rpc=async(name,action,data={})=>(await rows('select public.'+name+'($1,$2::jsonb) as v',[action,JSON.stringify(data)]))[0].v;
  const foundation=(actor,action,data={})=>rpc('wow_service',action,{...data,...actor});
  const chat=(actor,action,data={})=>rpc('wow_chat_service',action,{...data,...actor});
  const gallery=(actor,action,data={})=>rpc('wow_gallery_service','gallery.'+action,{...data,...actor});
  const workerRpc=(action,data)=>rpc('wow_push_worker',action,data);
  async function account(name,role,permissions,wid=workspace){
    const userId=randomUUID(),sessionId=randomUUID();
    await rows('insert into auth.users(id) values($1)',[userId]);
    await rows('insert into public.wow_accounts(id,workspace_id,login_email,username,name,role,permissions) values($1,$2,$3,$4,$4,$5,$6::text[])',
      [userId,wid,name+'@test.invalid',name,role,permissions]);
    await rows('insert into auth.sessions(id,user_id) values($1,$2)',[sessionId,userId]);
    await foundation({userId,sessionId},'session.open');return {userId,sessionId};
  }
  async function enroll(actor,language){
    const key=createECDH('prime256v1');key.generateKeys();
    const auth=randomBytes(16),deviceId=randomUUID(),endpoint='https://fcm.googleapis.com/fcm/send/'+deviceId;
    const data={deviceId,language,endpointHash:createHash('sha256').update(endpoint).digest('hex'),subscription:{endpoint,
      keys:{auth:auth.toString('base64url'),p256dh:key.getPublicKey().toString('base64url')},expirationTime:null}};
    const result=await foundation(actor,'push.subscribe',data);
    const device={...result,deviceId,key,auth,actor,data};devices.set(endpoint,device);return device;
  }
  try{
    for(const name of ['chat','gallery','operations','notifications','notifications']){
      await db.exec(await readFile(new URL('../supabase/modules/'+name+'.sql',import.meta.url),'utf8'));
    }
    assert.deepEqual((await rows("select has_schema_privilege('authenticated','wow_notify','usage') as schema,has_function_privilege('anon','wow_notify.handoff(integer)','execute') as handoff,has_table_privilege('authenticated','public.wow_push_active_devices','select') as devices"))[0],
      {schema:false,handoff:false,devices:false});
    await rows("insert into public.wow_workspaces(id,name) values($1,'Recipients'),($2,'Unrelated')",[workspace,foreign]);
    const owner=await account('owner','owner',[]),staff=await account('staff','sales',['chat.view','orders.view']),
      buyer=await account('buyer','custom',['gallery.view','myorders.view','myorders.edit']),muted=await account('muted','sales',['chat.view']),
      outsider=await account('outsider','sales',['chat.view']),other=await account('foreign','owner',[],foreign),
      unprivileged=await account('other-staff','sales',['invoices.view']);
    const token='local-ephemeral-worker-fixture-00000000000000000000000000';
    await rows('select public.wow_push_configure($1::jsonb)',[JSON.stringify({...webPush.generateVAPIDKeys(),
      projectUrl:'https://abcdefghijklmnopqrst.supabase.co',workerToken:token})]);
    await assert.rejects(foundation(unprivileged,'push.config',{role:'owner',permissions:['chat.view']}),/ACCESS_DENIED/);
    const ownerDevice=await enroll(owner,'ar'),staffDevice=await enroll(staff,'tr'),buyerDevice=await enroll(buyer,'en');
    await enroll(muted,'fr');const outsideDevice=await enroll(outsider,'ru');await enroll(other,'en');
    assert.equal(staffDevice.financial,false);assert.equal(ownerDevice.financial,true);
    await assert.rejects(foundation(staff,'push.test',{deviceId:ownerDevice.deviceId}),/PUSH_SUBSCRIPTION_REQUIRED/);
    await assert.rejects(foundation(outsider,'push.subscribe',staffDevice.data),/SUBSCRIPTION_BOUND_TO_OTHER_IDENTITY/);

    const {roomId}=await chat(owner,'group',{name:'SECRET GROUP',members:[staff.userId,muted.userId]});
    await chat(muted,'prefs',{roomId,muted:true});
    const message={roomId,requestId:randomUUID(),text:'SECRET CHAT USD 9988'};
    const wakeCount=async()=>(await rows('select count(*)::int as n from net.local_test_calls'))[0].n;
    const wakesBefore=await wakeCount();
    const {id:messageId}=await chat(owner,'send',message);
    assert.equal(await wakeCount(),wakesBefore+1,'a committed chat alone wakes the private worker before any finance jobs exist');
    assert.equal((await chat(owner,'send',message)).id,messageId);
    await rows("insert into public.wow_records(workspace_id,store,record_id,payload,revision,updated_by) values($1,'products','7',$2::jsonb,1,$3),($1,'invoices','7',$4::jsonb,1,$3)",
      [workspace,JSON.stringify({id:7,name:'SECRET CATALOG',priceA:30.24}),owner.userId,JSON.stringify({id:7,invNo:'P7',grandTotal:700})]);
    const stock=(version,amount)=>gallery(owner,'stock',{commandId:randomUUID(),rows:[{productId:7,version,stock:amount,published:true,currency:'USD',collection:'',badge:'',specs:{}}]});
    await stock(0,4);
    await rows("select wow_ops.observe($1,'PUSH_BACKLOG','warning',true,$2::jsonb)",[workspace,JSON.stringify({internal:'SECRET OPS'})]);
    await rows("select public.wow_push_enqueue($1,$2,$3::jsonb,'live')",[workspace,owner.userId,JSON.stringify([
      {store:'invoices',id:7,revision:1,kind:'proforma',action:'created',details:{amount:700,currency:'USD',customer:'PRIVATE CUSTOMER'}}])]);
    await foundation(buyer,'push.test',{deviceId:buyerDevice.deviceId});
    assert.equal((await rows('select wow_notify.handoff(1) as n'))[0].n,3);
    assert.equal((await rows('select wow_notify.handoff(1) as n'))[0].n,0);
    await rows('update wow_collab.chat_notifications set handed_off_at=null where message_id=$1',[messageId]);
    assert.equal((await rows('select wow_notify.handoff(1) as n'))[0].n,1);
    assert.equal((await rows('select count(*)::int as n from public.wow_push_jobs'))[0].n,5);

    const attempts=[];let retryStaff=true,changeBeforeSend,maintenanceCalls=0;
    const worker=createPushWorker({generateRequestDetails:webPush.generateRequestDetails,maintenance:async()=>{maintenanceCalls++;},
      rpc:async(action,data)=>{if(action==='recheck'&&changeBeforeSend){const change=changeBeforeSend;changeBeforeSend=null;await change();}return workerRpc(action,data);},
      fetch:async(endpoint,init)=>{
        const device=devices.get(endpoint),plain=JSON.parse(ece.decrypt(Buffer.from(init.body),{version:'aes128gcm',privateKey:device.key,authSecret:device.auth}).toString());
        assert.equal(plain.userId,device.actor.userId);assert.equal(plain.bindingId,device.bindingId);assert.equal(plain.sessionVersion,1);
        attempts.push(plain);
        if(plain.kind==='chat'&&retryStaff){retryStaff=false;return new Response(null,{status:503});}
        return new Response(null,{status:201});
      }});
    const dispatch=async(credential=token)=>{const r=await worker(new Request('https://edge.invalid/push-worker',{method:'POST',headers:{'x-wow-worker-token':credential}}));return {status:r.status,data:await r.json()};};
    assert.equal((await dispatch('invalid-token-example-0000000000000000')).status,401);assert.equal(maintenanceCalls,0);
    const first=await dispatch();assert.equal(first.status,200);assert.equal(first.data.sent,4);assert.equal(first.data.retry,1);assert.equal(maintenanceCalls,1);
    const received=kind=>attempts.filter(p=>p.kind===kind).map(p=>p.userId).sort();
    assert.deepEqual(received('proforma'),[owner.userId]);assert.deepEqual(received('operations'),[owner.userId]);
    assert.deepEqual(received('chat'),[staff.userId]);assert.deepEqual(received('stock.updated'),[buyer.userId]);assert.deepEqual(received('test'),[buyer.userId]);
    assert.match(attempts.find(p=>p.kind==='proforma').body,/PRIVATE CUSTOMER/);
    const chatNotice=attempts.find(p=>p.kind==='chat');assert.equal(chatNotice.title,'Yeni mesaj');assert.deepEqual(chatNotice.params,{roomId,messageId});
    for(const item of attempts.filter(p=>p.kind!=='proforma'))assert.doesNotMatch(JSON.stringify(item),/SECRET|PRIVATE CUSTOMER|9988|price|cost/);

    // The original event is retried, then muted after encryption and immediately before the provider call.
    await rows("update public.wow_push_jobs set next_attempt_at=now() where status='pending'");
    changeBeforeSend=()=>chat(staff,'prefs',{roomId,muted:true});
    assert.equal((await dispatch()).data.cancelled,1);assert.equal(attempts.length,5);
    const pairs=await rows("select j.id from public.wow_push_jobs j join public.wow_push_events e on e.id=j.event_id where e.kind='chat' and j.status='cancelled'");
    assert.equal(pairs.length,1);

    // A stale gallery revision and even a misrouted internal finance job must fail the fresh authorization check.
    await stock(1,8);const [stale]=(await workerRpc('claim',{})).jobs;
    assert.equal((await workerRpc('prepare',stale)).event.kind,'stock.updated');await stock(2,9);
    assert.deepEqual(await workerRpc('recheck',stale),{allowed:false});
    await rows("insert into public.wow_push_jobs(event_id,subscription_id) select id,$1 from public.wow_push_events where kind='proforma'",[outsideDevice.subscriptionId]);
    const mixed=(await dispatch()).data;assert.equal(mixed.sent,1);assert.equal(mixed.cancelled,1);assert.deepEqual(received('proforma'),[owner.userId]);

    const order=await gallery(buyer,'order.place',{commandId:randomUUID(),accepted:true,note:'SECRET BUYER',items:[{productId:7,quantity:1,priceMinor:3024,currency:'USD'}]});
    await gallery(owner,'order.update',{commandId:randomUUID(),orderId:order.orderId,version:1,status:'ready',adminNote:'SECRET ORDER'});
    await dispatch();assert.deepEqual(received('order.created'),[owner.userId,staff.userId].sort());assert.deepEqual(received('order.updated'),[buyer.userId]);
    const orderNotice=attempts.find(p=>p.kind==='order.updated');assert.equal(orderNotice.route,'my-orders');assert.deepEqual(orderNotice.params,{orderId:order.orderId});
    assert.doesNotMatch(JSON.stringify(orderNotice),/SECRET|price|cost/);

    await chat(staff,'prefs',{roomId,muted:false});await chat(owner,'send',{roomId,requestId:randomUUID(),text:'revoked'});
    const [revoked]=(await workerRpc('claim',{})).jobs;
    assert.equal((await workerRpc('prepare',revoked)).event.kind,'chat');
    await rows("update public.wow_accounts set permissions=array['orders.view'] where id=$1",[staff.userId]);
    assert.deepEqual(await workerRpc('recheck',revoked),{allowed:false});
    await foundation(buyer,'push.test',{deviceId:buyerDevice.deviceId});const [expired]=(await workerRpc('claim',{})).jobs;
    await rows("update public.wow_sessions set last_active_at=now()-interval '31 minutes' where session_id=$1",[buyer.sessionId]);
    assert.deepEqual(await workerRpc('recheck',expired),{allowed:false});
    assert.deepEqual((await rows('select count(*)::int as n from public.wow_push_active_devices where account_id=any($1::uuid[])',[[staff.userId,buyer.userId]]))[0],{n:0});
  }finally{await db.close();}
});
