import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {communicationsFixture} from './fixtures/communications.mjs';
import {createCommunications,validateCommunicationAction} from '../supabase/functions/wow-cloud/modules/communications.mjs';
import {createCustomerAuthActions} from '../supabase/functions/wow-cloud/modules/customer-auth.mjs';

// Exercise the actual registration actions and SQL lifecycle. Only Auth's
// external email/password/session provider is a local fixture; no email leaves
// this process and no account/profile is inserted by the application test.
async function registeredCustomer(f,email){
 const origin='https://correspondence-registration.invalid',request=new Request(origin,{headers:{Origin:origin}});
 let link,sessionId,accessToken,passwordSet=false,logoutScope;
 const auth={getUser:async token=>{
  assert.equal(token,accessToken);
  return (await f.db.query('select u.* from auth.users u join auth.sessions s on s.user_id=u.id where s.id=$1',[sessionId])).rows[0];
 }};
 const provider={configured:true,
  rpc:async(action,data)=>(await f.db.query('select public.wow_customer_auth_service($1,$2::jsonb) value',[action,JSON.stringify(data)])).rows[0].value,
  send:async(kind,address,redirect)=>{
   assert.equal(kind,'register');assert.equal(address,email);const url=new URL(redirect);assert.equal(url.origin,origin);
   const userId=randomUUID();await f.db.query('insert into auth.users(id,email) values($1,$2)',[userId,email]);
   link={userId,tokenHash:randomUUID().replaceAll('-','')+randomUUID().replaceAll('-',''),challenge:new URLSearchParams(url.hash.slice(1)).get('challenge'),used:false};
   assert.match(link.challenge,/^[A-Za-z0-9_-]{43}$/);
  },
  verify:async(tokenHash,type)=>{
   assert.equal(type,'email');assert.equal(tokenHash,link.tokenHash);assert.equal(link.used,false);link.used=true;
   await f.db.query('update auth.users set email_confirmed_at=now() where id=$1',[link.userId]);
   sessionId=randomUUID();await f.db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessionId,link.userId]);
   accessToken='fixture.'+Buffer.from(JSON.stringify({session_id:sessionId})).toString('base64url')+'.fixture';
   return {access_token:accessToken};
  },
  setPassword:async(token,password)=>{assert.equal((await auth.getUser(token)).id,link.userId);assert.equal(password,'Verified customer fixture password');passwordSet=true;},
  signOut:async(token,scope)=>{assert.equal((await auth.getUser(token)).id,link.userId);logoutScope=scope;await f.db.query('delete from auth.sessions where user_id=$1',[link.userId]);}
 };
 const service=createCustomerAuthActions({provider,auth,origins:[origin],enabled:true});
 const snapshot=await service.actions['customerAuth.snapshot']({actor:f.owner,body:{}});
 await service.actions['customerAuth.configure']({actor:f.owner,body:{revision:snapshot.settings.revision,registrationEnabled:true,recoveryEnabled:true}});
 const requestId=randomUUID(),username='verified-idn-customer';
 await service.publicActions['auth.customerRegister']({request,body:{workspaceId:f.workspace,requestId,email,username,
  name:'Verified IDN Customer',company:'Verified Furniture Company',country:'TR',callingCode:'+90',phone:'5551234567'}});
 assert(link);assert.equal((await f.db.query('select count(*)::int n from public.wow_accounts where id=$1',[link.userId])).rows[0].n,0);
 const result=await service.publicActions['auth.customerVerify']({request,body:{workspaceId:f.workspace,requestId,
  tokenHash:link.tokenHash,challenge:link.challenge,password:'Verified customer fixture password'}});
 assert.deepEqual(result,{completed:true,username});assert.equal(passwordSet,true);assert.equal(logoutScope,'global');
 const account=(await f.db.query('select a.id,a.role,a.login_email,p.company from public.wow_accounts a join wow_customer.profiles p on p.account_id=a.id where a.id=$1',[link.userId])).rows[0];
 assert.equal(account.role,'customer');assert.equal(account.login_email,email);return account;
}

test('transactional correspondence: private contacts, reviewed commands, immutable sends, revoked authority and durable outcomes',async(t)=>{
 const f=await communicationsFixture();t.after(()=>f.db.close());
 await f.db.exec(await readFile(new URL('../supabase/modules/communications.sql',import.meta.url),'utf8'));
 await t.test('source access is workspace scoped; contact projection excludes unrelated private fields',async()=>{
  const contacts=await f.call('contacts',{kind:'company'},f.staff);
  assert.equal(contacts.items[0].email,f.company.email);assert.equal(contacts.items[0].phone,'+905551234567');
  const order=(await f.call('recipient',{source:{kind:'order',id:f.order}},f.staff)).contact;
  assert.equal(order.order,'ORDER-123');assert(!JSON.stringify(order).includes('private staff note'));
  await assert.rejects(()=>f.call('contacts',{kind:'company'},f.limited),/ACCESS_DENIED/);
  await assert.rejects(()=>f.call('contacts',{kind:'company'},f.customer),/ACCESS_DENIED/);
  await assert.rejects(()=>f.call('recipient',{source:{kind:'order',id:f.order}},f.foreign),/INVALID_RECIPIENT/);
  await assert.rejects(()=>f.call('recipient',{source:{kind:'company',id:'7'}},f.owner),/INVALID_RECIPIENT/);
 });
 await t.test('draft and template idempotency, state versions and archive/source rights are authoritative',async()=>{
  const data={id:randomUUID(),version:0,commandId:randomUUID(),language:'en',channel:'email',source:{kind:'company',id:7},subject:'Review',body:'Text'};
  const first=(await f.call('save',data,f.staff)).message;
  assert.equal((await f.call('save',data,f.staff)).message.id,first.id);
  await assert.rejects(()=>f.call('save',{...data,body:'Different'},f.staff),/IDEMPOTENCY_MISMATCH/);
  await assert.rejects(()=>f.call('save',{...data,commandId:randomUUID(),body:'Stale'},f.staff),/CONFLICT/);
  await assert.rejects(()=>f.call('detail',{id:first.id},f.foreign),/ACCESS_DENIED/);
  await assert.rejects(()=>f.call('detail',{id:first.id},f.limited),/ACCESS_DENIED/);
  assert.equal((await f.call('list',{},f.limited)).items.length,0);
  const template={id:randomUUID(),version:0,commandId:randomUUID(),name:'Order',language:'en',subject:'Order {{order}}',body:'Hello {{name}}, {{status}}.'};
  await f.call('template.save',template);await f.call('template.save',template);
  assert.equal((await f.call('templates')).items.length,1);
  await assert.rejects(()=>f.call('template.save',{...template,commandId:randomUUID(),id:randomUUID(),body:'{{password}}'}),/INVALID_TEMPLATE_VARIABLE/);
 });
 await t.test('explicit email request stores exactly one provider receipt and replay cannot resend',async()=>{
  const message=await f.draft(),data={id:message.id,version:message.version,commandId:randomUUID()};
  const first=await f.call('send',data),second=await f.call('send',data);
  assert.equal(first.message.status,'accepted');assert.equal(second.message.status,'accepted');assert.equal(f.sends.length,1);
  const payload=f.sends[0].payload;assert.equal(payload.to.length,1);assert.equal(payload.to[0],f.company.email);
  assert.equal(payload.from,'WOW FURNITURE <info@wowfurniture.com.tr>');assert.equal(payload.text,message.body);assert.equal(payload.html,undefined);
  assert.equal(payload.tags.find(x=>x.name==='wow_message').value,message.id);
  await assert.rejects(()=>f.call('save',{id:message.id,version:first.message.version,commandId:randomUUID(),source:message.source,language:'en',channel:'email',subject:'Changed',body:'Changed'}),/CONFLICT/);
  await assert.rejects(()=>f.call('send',{...data,commandId:randomUUID()}),/CONFLICT/);
 });
 await t.test('device handoffs are prepared only and never invoke the mail provider',async()=>{
  const before=f.sends.length,message=await f.draft({channel:'whatsapp'});
  const prepared=await f.call('prepare',{id:message.id,version:message.version,commandId:randomUUID()});
  assert.equal(prepared.message.status,'prepared');assert.equal(f.sends.length,before);
  const invalid=await f.draft({source:{kind:'order',id:f.order},channel:'whatsapp'});
  await assert.rejects(()=>f.call('prepare',{id:invalid.id,version:invalid.version,commandId:randomUUID()}),/INVALID_RECIPIENT_CONTACT/);
 });
 await t.test('verified ACE-domain registration resolves an order contact and expiry before preparation cancels its queued mail',async()=>{
  const email='buyer@shop.xn--p1ai',customer=await registeredCustomer(f,email),orderId=randomUUID();
  await f.db.query("insert into public.wow_gallery_orders(id,workspace_id,account_id,number,customer_name) values($1,$2,$3,'ORDER-IDN','Verified IDN Customer')",[orderId,f.workspace,customer.id]);
  const source={kind:'order',id:orderId},contact=(await f.call('recipient',{source},f.staff)).contact;
  assert.equal(contact.email,email);assert.equal(contact.phone,'+905551234567');assert.equal(contact.company,customer.company);
  const message=await f.draft({source});
  assert.equal((await f.call('send',{id:message.id,version:message.version,commandId:randomUUID()})).message.status,'accepted');
  assert.deepEqual(f.sends.at(-1).payload.to,[email]);
  const pending=await f.draft({source});await f.queue(pending);
  const claim=(await f.workerRpc('claim',{id:pending.id})).jobs[0],before=f.sends.length;
  await f.db.query("update public.wow_accounts set expires_at=now()-interval '1 second' where id=$1",[customer.id]);
  assert.equal((await f.db.query('select wow_customer.contact($1) contact',[customer.id])).rows[0].contact,null);
  assert.equal((await f.workerRpc('prepare',claim)).status,'cancelled');await f.service.process(pending.id);assert.equal(f.sends.length,before);
  await assert.rejects(()=>f.call('recipient',{source}),/INVALID_RECIPIENT/);
  assert(!(await f.call('contacts',{kind:'order'})).items.some(item=>item.id===orderId));
  await f.db.query('update public.wow_accounts set expires_at=null where id=$1',[customer.id]);
  await f.db.query('update auth.users set is_anonymous=true where id=$1',[customer.id]);
  assert.equal((await f.db.query('select wow_customer.contact($1) contact',[customer.id])).rows[0].contact,null);
  assert.equal((await f.call('recipient',{source})).contact.email,'','a rejected enrolled contact never falls back to its confirmed Auth email');
 });
 await t.test('legacy order fallback rejects expired or anonymous recipient accounts at the provider boundary',async()=>{
  const source={kind:'order',id:f.order},before=f.sends.length;
  const expired=await f.draft({source});await f.queue(expired);
  await f.db.query("update public.wow_accounts set expires_at=now()-interval '1 second' where id=$1",[f.customer.userId]);
  await f.service.process(expired.id);assert.equal((await f.call('detail',{id:expired.id})).message.status,'cancelled');
  await f.db.query('update public.wow_accounts set expires_at=null where id=$1',[f.customer.userId]);
  const anonymous=await f.draft({source});await f.queue(anonymous);
  await f.db.query('update auth.users set is_anonymous=true where id=$1',[f.customer.userId]);
  assert.equal((await f.call('recipient',{source})).contact.email,'');
  await f.service.process(anonymous.id);assert.equal((await f.call('detail',{id:anonymous.id})).message.status,'cancelled');assert.equal(f.sends.length,before);
  await f.db.query('update auth.users set is_anonymous=false where id=$1',[f.customer.userId]);
 });
 await t.test('changed contacts and revoked sender grants stop a claimed job before the provider call',async()=>{
  const actor=await f.member(f.workspace,'custom',['communications.view','communications.edit','communications.export','customers.view']);
  const message=await f.draft({actor});await f.queue(message,actor);
  const claimed=(await f.workerRpc('claim',{id:message.id})).jobs[0];
  await f.db.query("update public.wow_accounts set permissions=array['communications.view','customers.view'] where id=$1",[actor.userId]);
  assert.equal((await f.workerRpc('prepare',claimed)).status,'cancelled');
  const altered=await f.draft();await f.queue(altered);
  await f.db.query("update public.wow_records set payload=jsonb_set(payload,'{email}','\"new@example.test\"') where workspace_id=$1 and store='companies'",[f.workspace]);
  await f.service.process(altered.id);assert.equal((await f.call('detail',{id:altered.id})).message.status,'cancelled');
  await f.db.query("update public.wow_records set payload=jsonb_set(payload,'{email}',$2::jsonb) where workspace_id=$1 and store='companies'",[f.workspace,JSON.stringify(f.company.email)]);
 });
 await t.test('lost provider response and lost SQL acknowledgment reuse the exact payload and key',async()=>{
  let attempted=0;const keys=[],bodies=[];const providerId=randomUUID();
  const provider={configured:true,from:f.provider.from,send:async job=>{attempted++;keys.push(job.idempotencyKey);bodies.push(job.payload);if(attempted===1)throw Error('unknown');return {id:providerId};}};
  let loseAck=true;const workerRpc=async(action,data)=>{
   if(action==='finish'&&data.outcome==='accepted'&&loseAck){loseAck=false;throw Error('database temporarily unavailable');}
   return f.workerRpc(action,data);
  };
  const service=createCommunications({moduleRpc:f.moduleRpc,workerRpc,provider}),message=await f.draft();await f.queue(message);
  await service.process(message.id);assert.equal((await f.call('detail',{id:message.id})).message.status,'retry');
  await f.db.query("update wow_mail.messages set next_attempt_at=now()-interval '1 minute' where id=$1",[message.id]);
  await assert.rejects(()=>service.process(message.id),/MAIL_WORKER_UNAVAILABLE/);
  await f.db.query("update wow_mail.messages set lease_until=now()-interval '1 second' where id=$1",[message.id]);
  await service.process(message.id);
  assert.equal((await f.call('detail',{id:message.id})).message.status,'accepted');assert.equal(attempted,3);
  assert.equal(new Set(keys).size,1);assert.deepEqual(bodies,[bodies[0],bodies[0],bodies[0]]);
 });
 await t.test('old retry windows and stale leases cannot cause a new duplicate send',async()=>{
  const message=await f.draft();await f.queue(message);
  await f.db.query("update wow_mail.messages set first_attempt_at=now()-interval '24 hours',attempts=1 where id=$1",[message.id]);
  const job=(await f.workerRpc('claim',{id:message.id})).jobs[0];
  assert.equal((await f.workerRpc('prepare',{...job,lease:randomUUID()})).status,'gone');
  assert.equal((await f.workerRpc('prepare',job)).status,'uncertain');
  const after=(await f.call('detail',{id:message.id})).message;assert.equal(after.status,'uncertain');
  await assert.rejects(()=>f.call('send',{id:message.id,version:after.version,commandId:randomUUID()}),/ACCESS_DENIED/);
 });
 await t.test('authenticated provider events bind to the frozen recipient and resist replay or delayed downgrade',async()=>{
  const message=await f.draft();await f.call('send',{id:message.id,version:message.version,commandId:randomUUID()});
  const row=(await f.db.query('select * from wow_mail.messages where id=$1',[message.id])).rows[0];
  const data={id:message.id,workspace:f.workspace,digest:row.send_digest,providerId:row.provider_id,status:'delivered',at:new Date().toISOString(),eventId:'evt-'+randomUUID(),to:f.company.email,from:f.provider.from};
  await f.workerRpc('event',{...data,to:'intruder@example.test'});assert.equal((await f.call('detail',{id:message.id})).message.status,'accepted');
  await f.workerRpc('event',data);await f.workerRpc('event',data);assert.equal((await f.call('detail',{id:message.id})).message.status,'delivered');
  await f.workerRpc('event',{...data,status:'delayed',at:new Date(Date.now()+1000).toISOString(),eventId:'evt-'+randomUUID()});
  assert.equal((await f.call('detail',{id:message.id})).message.status,'delivered');
  assert.equal((await f.db.query('select count(*)::int n from wow_mail.events where id=$1',[data.eventId])).rows[0].n,1);
 });
 await t.test('bulk deletion redacts content, cannot cross source/workspace rights, and retains anti-replay identity',async()=>{
  const a=await f.draft(),b=await f.draft(),commandId=randomUUID();
  await assert.rejects(()=>f.call('delete',{ids:[a.id,b.id],commandId},f.limited),/ACCESS_DENIED/);
  const result=await f.call('delete',{ids:[a.id,b.id],commandId});assert.equal(result.ids.length,2);
  await f.call('delete',{ids:[a.id,b.id],commandId});
  const row=(await f.db.query('select subject,body,recipient,send_payload,archived_at from wow_mail.messages where id=$1',[a.id])).rows[0];
  assert.equal(row.subject,'');assert.equal(row.body,'');assert.deepEqual(row.recipient,{});assert.equal(row.send_payload,null);assert(row.archived_at);
  await assert.rejects(()=>f.call('detail',{id:a.id}),/ACCESS_DENIED/);
  await assert.rejects(()=>f.call('save',{id:a.id,version:0,commandId:randomUUID(),source:a.source,channel:'email',language:'en',subject:'Again',body:'Again'}),/CONFLICT/);
 });
 await t.test('disabled automation and invalid worker configuration are quiet; due mail wakes without push jobs',async()=>{
  const message=await f.draft();await f.queue(message);
  assert.equal((await f.db.query('select public.wow_communications_wake() value')).rows[0].value,null);
  await f.db.query('select public.wow_push_configure($1::jsonb)',[JSON.stringify({projectUrl:'https://abcdefghijklmnopqrst.supabase.co',
   publicKey:'A'.repeat(87),privateKey:'B'.repeat(43),workerToken:'C'.repeat(64)})]);
  await f.db.query('insert into wow_ops.settings(workspace_id,enabled) values($1,false) on conflict(workspace_id) do update set enabled=false',[f.workspace]);
  assert.deepEqual((await f.workerRpc('claim',{id:message.id})).jobs,[]);
  assert.equal((await f.db.query('select public.wow_communications_wake() value')).rows[0].value,null);
  await f.db.query('update wow_ops.settings set enabled=true where workspace_id=$1',[f.workspace]);
  const wake=(await f.db.query('select public.wow_communications_wake() value')).rows[0].value;assert(wake);
  const call=(await f.db.query('select url,headers from net.local_test_calls where id=$1',[wake])).rows[0];
  assert.equal(call.url,'https://abcdefghijklmnopqrst.supabase.co/functions/v1/wow-cloud/push-worker');assert.equal(call.headers['X-Wow-Worker-Token'],'C'.repeat(64));
  assert.equal((await f.db.query('select public.wow_communications_wake() value')).rows[0].value,null,'minute wake is throttled independently');
  const cron=(await f.db.query("select schedule,command from cron.job where jobname='wow-customer-correspondence'")).rows[0];
  assert.deepEqual(cron,{schedule:'* * * * *',command:'select public.wow_communications_wake();'});
  await f.service.process(message.id);
 });
 await t.test('nonretryable payload/provider rejection stops the worker without a retry storm',async()=>{
  let attempts=0;const provider={configured:true,from:f.provider.from,send:async()=>{attempts++;throw Object.assign(Error('INVALID_MAIL_PAYLOAD'),{permanent:true});}};
  const service=createCommunications({moduleRpc:f.moduleRpc,workerRpc:f.workerRpc,provider}),message=await f.draft();await f.queue(message);
  await service.process(message.id);await service.process(message.id);
  assert.equal(attempts,1);assert.equal((await f.call('detail',{id:message.id})).message.status,'failed');
 });
 await t.test('bounded batches and sender hourly budget limit explicit queued operations',async()=>{
  const actor=await f.member(f.workspace,'custom',['communications.view','communications.edit','communications.export','customers.view']);
  for(let i=0;i<20;i++){const message=await f.draft({actor});await f.queue(message,actor);}
  const overflow=await f.draft({actor});await assert.rejects(()=>f.queue(overflow,actor),/RATE_LIMITED/);
  const claimed=await f.workerRpc('claim',{});assert.equal(claimed.jobs.length,6);assert.equal(new Set(claimed.jobs.map(x=>x.id)).size,6);
  const next=await f.workerRpc('claim',{});assert.equal(next.jobs.length,6);assert(!next.jobs.some(x=>claimed.jobs.some(y=>y.id===x.id)));
 });
 await t.test('repeated installation leaves RLS and private functions closed to browser roles',async()=>{
  const exposed=(await f.db.query("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='wow_mail' or p.proname like 'wow_communications%') and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'))")).rows;
  assert.deepEqual(exposed,[]);
  const tables=(await f.db.query("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='wow_mail' and c.relkind='r' and not c.relrowsecurity")).rows;
  assert.deepEqual(tables,[]);
 });
});

test('communication validation rejects malformed source ids, headers, unknown variables and unbounded commands',()=>{
 const commandId=randomUUID(),id=randomUUID();
 const draft={id,version:0,commandId,source:{kind:'company',id:7},channel:'email',language:'en',subject:'Hi',body:'Body'};
 assert.throws(()=>validateCommunicationAction('communications.save',{...draft,subject:'Hi\r\nBcc: victim@example.test'}));
 assert.throws(()=>validateCommunicationAction('communications.save',{...draft,body:'x'.repeat(10001)}));
 assert.throws(()=>validateCommunicationAction('communications.save',{...draft,source:{kind:'account',id}}));
 assert.throws(()=>validateCommunicationAction('communications.delete',{commandId,ids:[id,id]}));
 assert.throws(()=>validateCommunicationAction('communications.delete',{commandId,ids:Array.from({length:51},()=>randomUUID())}));
 assert.throws(()=>validateCommunicationAction('communications.worker',{id}));
});
