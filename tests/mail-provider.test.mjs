import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {createMailProvider,mailSender,validMailAddress} from '../supabase/functions/wow-cloud/modules/mail-provider.mjs';
import {createCommunications} from '../supabase/functions/wow-cloud/modules/communications.mjs';
import {normalizeCustomerEmail} from '../supabase/functions/wow-cloud/modules/customer-auth.mjs';

const now=Date.now(),apiKey='re_fixture_key_only_123456',secret='whsec_'+Buffer.from('fixture webhook signing key only').toString('base64');
const job=()=>{const id=randomUUID(),workspace=randomUUID();return {id,workspace,digest:'a'.repeat(64),idempotencyKey:'wow-mail/'+workspace+'/'+id,
 payload:{from:mailSender,to:["o'brien!box=tag@example.test"],subject:'Reviewed subject',text:'Plain <script>alert(1)</script> body'}};};
function event(job,overrides={}){return {type:'email.delivered',created_at:new Date(now).toISOString(),data:{email_id:randomUUID(),from:mailSender,to:job.payload.to,
 tags:{wow_message:job.id,wow_workspace:job.workspace,wow_digest:job.digest}},...overrides};}
function signed(payload,{id='msg_'+randomUUID(),stamp=Math.floor(now/1000),signature,body}={}){
 const raw=body??JSON.stringify(payload),hash=createHmac('sha256',Buffer.from(secret.slice(6),'base64')).update(id+'.'+stamp+'.'+raw).digest('base64');
 return new Request('https://fixture.example/mail-webhook',{method:'POST',headers:{'svix-id':id,'svix-timestamp':String(stamp),'svix-signature':signature??'v1,'+hash,'content-type':'application/json'},body:raw});
}
test('mail adapter has an explicit enable gate, fixed sender and endpoint, immutable idempotency and no credential output',async()=>{
 let calls=0;const value=job(),providerId=randomUUID();
 const fetcher=async(url,request)=>{calls++;assert.equal(url,'https://api.resend.com/emails');assert.equal(request.method,'POST');
  assert.equal(request.redirect,'error');assert.equal(request.headers.Authorization,'Bearer '+apiKey);assert.equal(request.headers['Idempotency-Key'],value.idempotencyKey);
  const payload=JSON.parse(request.body);assert.equal(payload.text,value.payload.text);assert.equal(payload.html,undefined);assert.equal(payload.from,mailSender);
  assert.deepEqual(payload.to,value.payload.to);assert.equal(payload.tags.length,3);return Response.json({id:providerId});};
 const absent=createMailProvider({apiKey,fetch:fetcher});assert.equal(absent.configured,false);await assert.rejects(()=>absent.send(value),{code:'MAIL_NOT_CONFIGURED'});assert.equal(calls,0);
 const provider=createMailProvider({apiKey,enabled:true,fetch:fetcher});assert.deepEqual(await provider.send(value),{id:providerId});assert.equal(calls,1);
 assert(!JSON.stringify(provider).includes(apiKey));
 await assert.rejects(()=>provider.send({...value,payload:{...value.payload,from:'Wrong <wrong@example.test>'}}),{code:'INVALID_MAIL_PAYLOAD',permanent:true});
 assert.equal(calls,1);
});
test('supported mailbox grammar matches customer auth and validates before any queued provider payload',()=>{
 for(const address of ["o'brien@example.test",'box!tag=reply@example.test','name+sale@example.test','local/part@example.test','local`part@example.test','buyer@shop.xn--p1ai','buyer@xn--exmple-cua.com']){
  assert.equal(normalizeCustomerEmail(address),address);assert.equal(validMailAddress(address),true);
 }
 for(const address of ['other@example.test\r\nBcc:attacker@example.test','a..b@example.test','unknown@wow.invalid','x'.repeat(65)+'@example.test','https://internal',
  '.buyer@example.test','buyer.@example.test','buyer@-example.test','buyer@example-.test','buyer@shop.xn--bad-','buyer@'+'x'.repeat(64)+'.test']){
  assert.equal(validMailAddress(address),false);assert.throws(()=>normalizeCustomerEmail(address));
 }
});
test('definite provider rejection differs from uncertain transport, timeout and malformed responses',async()=>{
 for(const [status,permanent] of [[400,true],[401,true],[403,true],[422,true],[409,false],[429,false],[500,false]]){
  const provider=createMailProvider({apiKey,enabled:true,fetch:async()=>Response.json({message:'server-secret'},{status})});
  await assert.rejects(()=>provider.send(job()),error=>{assert.equal(error.code,'MAIL_PROVIDER_UNAVAILABLE');assert.equal(error.permanent===true,permanent);assert(!error.message.includes('server-secret'));return true;});
 }
 for(const response of [()=>Response.json({id:'wrong'}),()=>new Response('not JSON',{headers:{'content-type':'text/html'}}),
  ()=>new Response('x'.repeat(98305),{headers:{'content-type':'application/json'}})]){
  const provider=createMailProvider({apiKey,enabled:true,fetch:async()=>response()});await assert.rejects(()=>provider.send(job()),error=>error.code==='MAIL_PROVIDER_UNAVAILABLE'&&!error.permanent);
 }
 const provider=createMailProvider({apiKey,enabled:true,timeoutMs:2,fetch:(_,request)=>new Promise((_,reject)=>request.signal.addEventListener('abort',()=>reject(Error('secret')),{once:true}))});
 await assert.rejects(()=>provider.send(job()),{code:'MAIL_PROVIDER_UNAVAILABLE'});
});
test('provider retrieval verifies frozen message and recipient bindings and does not infer a delivery from an open event',async()=>{
 const value=job(),providerId=randomUUID();let state='delivered';
 const provider=createMailProvider({apiKey,enabled:true,now:()=>now,fetch:async(url,request)=>{
  assert.equal(url,'https://api.resend.com/emails/'+providerId);assert.equal(request.method,'GET');
  return Response.json({id:providerId,last_event:state,from:mailSender,to:value.payload.to,
   tags:[{name:'wow_message',value:value.id},{name:'wow_workspace',value:value.workspace},{name:'wow_digest',value:value.digest}]});}});
 const result=await provider.retrieve({...value,providerId});assert.equal(result.status,'delivered');assert.equal(result.providerId,providerId);
 await assert.rejects(()=>provider.retrieve({...value,workspace:randomUUID(),providerId}));
 state='opened';assert.equal(await provider.retrieve({...value,providerId}),null);
});
test('Svix raw-body HMAC verification rejects forged, expired, future, tampered and oversized callbacks',async()=>{
 const value=event(job()),provider=createMailProvider({webhookSecret:secret,now:()=>now});
 const verified=await provider.verifyWebhook(signed(value));assert.equal(verified.status,'delivered');assert.equal(verified.providerId,value.data.email_id);
 for(const request of [signed(value,{signature:'v1,'+Buffer.alloc(32).toString('base64')}),signed(value,{stamp:Math.floor(now/1000)-301}),signed(value,{stamp:Math.floor(now/1000)+301})]){
  await assert.rejects(()=>provider.verifyWebhook(request),{code:'INVALID_MAIL_SIGNATURE'});
 }
 const good=signed(value),wrong=new Request(good.url,{method:'POST',headers:good.headers,body:JSON.stringify({...value,type:'email.bounced'})});
 await assert.rejects(()=>provider.verifyWebhook(wrong),{code:'INVALID_MAIL_SIGNATURE'});
 await assert.rejects(()=>provider.verifyWebhook(signed(value,{body:'x'.repeat(32769)})));
 const unrelated=event(job());delete unrelated.data.tags;assert.equal(await provider.verifyWebhook(signed(unrelated)),null);
 const officiallyDocumented=createMailProvider({webhookSecret:'whsec_plJ3nmyCDGBKInavdOK15jsl',now:()=>1731705121000});
 const req=new Request('https://fixture.example/webhook',{method:'POST',headers:{'svix-id':'msg_loFOjxBNrRLzqYUf','svix-timestamp':'1731705121','svix-signature':'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0='},body:'{"event_type":"ping","data":{"success":true}}'});
 // Successful verification reaches the application shape validator, not signature rejection.
 await assert.rejects(()=>officiallyDocumented.verifyWebhook(req),{code:'INVALID_MAIL_EVENT'});
});
test('webhook HTTP handler authenticates before any SQL call and does not expose raw provider errors',async()=>{
 let calls=0;const provider=createMailProvider({webhookSecret:secret,now:()=>now}),service=createCommunications({provider,moduleRpc:async()=>{},workerRpc:async(action,data)=>{calls++;assert.equal(action,'event');return {ok:true};}});
 const value=event(job());assert.equal((await service.webhook(signed(value))).status,200);assert.equal(calls,1);
 assert.equal((await service.webhook(signed(value,{signature:'v1,'+Buffer.alloc(32).toString('base64')}))).status,401);assert.equal(calls,1);
 assert.equal((await service.webhook(new Request('https://fixture.example/webhook'))).status,405);
});
