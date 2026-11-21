import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createECDH,randomBytes,createPublicKey,verify} from 'node:crypto';
const require=createRequire(new URL('../supabase/package.json',import.meta.url));
const webPush=await import(require.resolve('web-push'));
const ece=require('http_ece');
const {derivePushEvents,formatPushPayload}=await import('../supabase/functions/wow-cloud/push-events.mjs');
const {normalizeSubscription,validatePushEndpoint}=await import('../supabase/functions/wow-cloud/push-security.mjs');
const {sendEncryptedPush,createPushWorker}=await import('../supabase/functions/wow-cloud/push-worker.mjs');
const row=(store,id,value,revision=1)=>({store,id,value,revision,deleted:false});
const op=(store,id,value,baseRevision=0)=>({store,id,value,baseRevision,kind:'put'});
const invoice={id:7,invNo:'W-7',companyName:'Acme',grandTotal:1250,totalPaidUSD:250,remainingUSD:1000,regDate:'2026-11-21',items:[{id:'line',qty:1,priceUSD:1250}]};
function subscription(){const key=createECDH('prime256v1');key.generateKeys();const auth=randomBytes(16);return {key,auth,value:{endpoint:'https://fcm.googleapis.com/fcm/send/test-only-token',keys:{p256dh:key.getPublicKey().toString('base64url'),auth:auth.toString('base64url')},expirationTime:null}};}

test('events distinguish invoice, canonical payment and cashbox expense with saved amounts',()=>{
  const events=derivePushEvents({actorName:'Owner',operations:[op('invoices',7,invoice),op('payments','p',{id:'p',invoiceId:7,amount:10,amountBasis:'USD',originalAmount:350,originalCurrency:'TRY',date:'2026-11-21',receiptType:'cash'}),op('settings','cashbox-entry/e',{id:'cashbox-entry/e',type:'expense',date:'2026-11-21',note:'Delivery',legs:[{currency:'EUR',units:-12345}]})],records:[]});
  assert.deepEqual(events.map(e=>e.kind),['proforma','payment','expense']);
  assert.equal(events[1].details.amount,350);assert.equal(events[1].details.currency,'TRY');assert.equal(events[1].details.customer,'Acme');
  assert.equal(events[2].details.amount,123.45);assert.equal(events[2].details.currency,'EUR');
});
test('invoice payment mirrors and unchanged canonical rows do not generate duplicate notices',()=>{
  const payment={id:'p',invoiceId:7,amount:10,currency:'USD',date:'2026-11-21'};
  const events=derivePushEvents({operations:[op('invoices',7,{...invoice,payments:[payment],totalPaidUSD:260,remainingUSD:990},1),op('payments','p',payment,1)],records:[row('invoices',7,invoice),row('payments','p',payment)]});
  assert.equal(events.length,0);
});
test('important edits/deletes use distinct committed revision and preserve deleted record details',()=>{
  const events=derivePushEvents({operations:[op('invoices',7,{...invoice,grandTotal:1500},1),{store:'payments',id:'p',kind:'delete',baseRevision:2}],records:[row('invoices',7,invoice),row('payments','p',{id:'p',invoiceId:7,amount:10,currency:'USD'},2)]});
  assert.equal(events[0].action,'updated');assert.equal(events[0].revision,2);assert.equal(events[1].action,'deleted');assert.equal(events[1].revision,3);assert.equal(events[1].details.amount,10);
});
test('all five locale payloads are plain bounded JSON with recipient binding',()=>{
  const event={id:'event',kind:'expense',action:'created',createdAt:'2026-11-21T12:00:00Z',details:{amount:25,currency:'USD',note:'🔔'.repeat(1000)+'\u202e',actorName:'Worker'}};
  for(const language of ['ar','en','tr','fr','ru']){const p=formatPushPayload(event,{workspaceId:'workspace',userId:'owner',deviceId:'device-0001',language});assert.equal(p.language,language);assert.equal(p.deviceId,'device-0001');assert(Buffer.byteLength(JSON.stringify(p))<=3072);assert(!p.body.includes('\u202e'));assert(Array.from(p.title).length<=120);assert(Array.from(p.body).length<=450);}
});
test('SSRF guard rejects private, redirected-looking, credentialed and unknown endpoints',()=>{
  for(const value of ['http://fcm.googleapis.com/fcm/send/x','https://127.0.0.1/a','https://[::1]/a','https://fcm.googleapis.com.attacker.test/fcm/send/x','https://user@fcm.googleapis.com/fcm/send/x','https://fcm.googleapis.com:8443/fcm/send/x','https://example.com/push','https://fcm.googleapis.com/fcm/send/x#fragment'])assert.throws(()=>validatePushEndpoint(value));
  assert.equal(validatePushEndpoint('https://web.push.apple.com/test-only-token'),'https://web.push.apple.com/test-only-token');
});
test('subscription keys must be real P-256 points and a 16-byte auth secret',async()=>{
  const s=subscription();assert.equal((await normalizeSubscription(s.value)).keys.p256dh,s.value.keys.p256dh);
  await assert.rejects(normalizeSubscription({...s.value,keys:{...s.value.keys,auth:'AA'}}));
  await assert.rejects(normalizeSubscription({...s.value,keys:{...s.value.keys,p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64)]).toString('base64url')}}));
});
test('real Web Push encryption decrypts only for subscriber and signs correct VAPID audience',async()=>{
  const s=subscription(),keys=webPush.generateVAPIDKeys(),payload={eventId:'event-1',kind:'payment',title:'Receipt',body:'USD 10',workspaceId:'workspace',userId:'owner',deviceId:'device-1'};let sent;
  const result=await sendEncryptedPush({subscription:s.value,payload,vapid:{...keys,subject:'https://galeri.wowfurniture.com.tr'},generateRequestDetails:webPush.generateRequestDetails,fetch:async(url,init)=>{sent={url,init};return new Response('',{status:201});}});
  assert.equal(result.status,'sent');assert.equal(sent.init.redirect,'error');assert.equal(sent.init.headers['Content-Encoding']||sent.init.headers['content-encoding'],'aes128gcm');
  const decrypted=ece.decrypt(Buffer.from(sent.init.body),{version:'aes128gcm',privateKey:s.key,authSecret:s.auth});assert.deepEqual(JSON.parse(decrypted.toString()),payload);
  assert.throws(()=>ece.decrypt(Buffer.from(sent.init.body),{version:'aes128gcm',privateKey:s.key,authSecret:randomBytes(16)}));
  const auth=sent.init.headers.Authorization||sent.init.headers.authorization,jwt=/t=([^,\s]+)/.exec(auth)[1],parts=jwt.split('.');
  assert.equal(JSON.parse(Buffer.from(parts[1],'base64url')).aud,'https://fcm.googleapis.com');
  const raw=Buffer.from(keys.publicKey,'base64url'),publicKey=createPublicKey({key:{kty:'EC',crv:'P-256',x:raw.subarray(1,33).toString('base64url'),y:raw.subarray(33).toString('base64url')},format:'jwk'});
  assert(verify('sha256',Buffer.from(parts[0]+'.'+parts[1]),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(parts[2],'base64url')));
});
test('provider response classifies dead endpoints and bounded retry without reading private response',async()=>{
  const s=subscription(),keys=webPush.generateVAPIDKeys();
  for(const [http,status] of [[201,'sent'],[404,'dead'],[410,'dead'],[429,'retry'],[503,'retry'],[400,'failed']]){
    const result=await sendEncryptedPush({subscription:s.value,payload:{eventId:'x'},vapid:{...keys,subject:'https://galeri.wowfurniture.com.tr'},generateRequestDetails:webPush.generateRequestDetails,fetch:async()=>new Response('private provider body',{status:http,headers:{'retry-after':'120'}})});
    assert.equal(result.status,status);assert(!JSON.stringify(result).includes('private provider body'));
  }
});
test('unauthorized worker cannot claim jobs or obtain private configuration',async()=>{
  const calls=[],worker=createPushWorker({rpc:async(action)=>{calls.push(action);return{};},generateRequestDetails:()=>assert.fail('no encryption')});
  const response=await worker(new Request('https://edge.test/push-worker',{method:'POST'}));assert.equal(response.status,401);assert.deepEqual(calls,[]);
});
test('shared copy in all five locales uses validated module targets and whitelisted fields',()=>{
  const id='92b3e08e-deff-4031-9fd3-daf8b9234848',titles=new Set();
  for(const language of ['ar','en','tr','fr','ru']){
    const recipient={language,workspaceId:'w',userId:'u',deviceId:'d',bindingId:id,sessionVersion:1};
    for(const [kind,fields,route] of [
      ['chat',{roomId:id,messageId:'7'},'chat'],['operations',{active:true,route:'server-admin'},'server-admin'],
      ['order.created',{orderId:id},'gallery-orders'],['order.updated',{orderId:id},'my-orders'],['stock.updated',{productId:'7'},'gallery']
    ]){
      const notice=formatPushPayload({id,kind,details:{...fields,kind,eventId:id,note:'PRIVATE DATA',priceMinor:998877,roomName:'PRIVATE DATA',route:fields.route||'https://other.invalid'}},recipient);
      assert.equal(notice.route,route);assert.equal(notice.bindingId,id);assert.doesNotMatch(JSON.stringify(notice),/PRIVATE DATA|998877|other\.invalid/);
      if(kind==='chat')titles.add(notice.title);
    }
  }
  assert.equal(titles.size,5);
});
