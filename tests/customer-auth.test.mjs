import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createProviderTestDatabase} from '../supabase/testing/provider-fixtures.mjs';
import {createHandler,sha256} from '../supabase/functions/wow-cloud/core.mjs';
import {createRestDependencies} from '../supabase/functions/wow-cloud/rest.mjs';
import {createCustomerAuthActions,createCustomerAuthProvider,normalizeCustomerProfile,normalizeCustomerEmail,CUSTOMER_COUNTRIES} from '../supabase/functions/wow-cloud/modules/customer-auth.mjs';
const require=createRequire(import.meta.url),policy=require('../accounts-policy.js'),cloud=require('../modules/platform/cloud/wow-cloud-client.js');
const ui=require('../modules/customer-auth/workspace.js');
const origin='https://customer-auth-fixture.invalid',secondOrigin='https://second-auth-fixture.invalid',project='https://project-auth-fixture.invalid',password='Fixture customer password 211';
const profile={name:'Test Customer',username:'customer-one',company:'Customer Company',country:'TR',callingCode:'+90',phone:'5551234567',email:'customer@example.com'};
const token=(id)=>'fixture.'+Buffer.from(JSON.stringify({session_id:id})).toString('base64url')+'.fixture';

async function application(db){
 const wid=randomUUID(),other=randomUUID(),owner=randomUUID(),ownerSid=randomUUID(),ownerToken=token(ownerSid);
 await db.query("insert into public.wow_workspaces(id,name) values($1,'First'),($2,'Second')",[wid,other]);
 await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,'owner@example.com',now())",[owner]);
 await db.query("insert into auth.sessions(id,user_id) values($1,$2)",[ownerSid,owner]);
 await db.query("insert into public.wow_accounts(id,workspace_id,login_email,username,name,role,permissions) values($1,$2,'owner@example.com','owner','Owner','owner',array(select permission from public.wow_permission_catalog))",[owner,wid]);
 await db.query('insert into public.wow_sessions(session_id,account_id,session_version) values($1,$2,1)',[ownerSid,owner]);
 const sessions=new Map([[ownerToken,{id:owner,sid:ownerSid}]]),passwords=new Map(),links=[],calls=[];
 let sendFailure=false,passwordFailure=false,verifyCalls=0,passwordCalls=0,passwordHook;
 async function getUser(access){
  const active=sessions.get(access);if(!active)throw Object.assign(Error('AUTH_REQUIRED'),{code:'AUTH_REQUIRED',status:401});
  const user=(await db.query('select u.* from auth.users u join auth.sessions s on s.user_id=u.id where u.id=$1 and s.id=$2',[active.id,active.sid])).rows[0];
  if(!user)throw Object.assign(Error('AUTH_REQUIRED'),{code:'AUTH_REQUIRED',status:401});return user;
 }
 async function session(userId){
  const sid=randomUUID(),access=token(sid);sessions.set(access,{id:userId,sid});
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,userId]);
  return {access_token:access,refresh_token:randomUUID(),expires_in:3600,user:await getUser(access)};
 }
 const auth={getUser,async signIn(email,pass){
  const user=(await db.query('select id from auth.users where email=$1',[email])).rows[0];
  if(!user||passwords.get(user.id)!==pass)throw Object.assign(Error('AUTH_REQUIRED'),{code:'AUTH_REQUIRED',status:401});return session(user.id);
 }};
 const {rpc}=createRestDependencies({url:project,serviceKey:'sb_secret_fixture',fetch:async(raw,options)=>{
  assert.equal(new URL(raw).pathname,'/rest/v1/rpc/wow_service');const {p_action,p_data}=JSON.parse(options.body);
  try{return Response.json((await db.query('select public.wow_service($1,$2::jsonb) result',[p_action,JSON.stringify(p_data)])).rows[0].result);}
  catch(error){if(error.code==='P0001')return Response.json({code:error.code,message:error.message},{status:400});throw error;}
 }});
 const provider=createCustomerAuthProvider({url:project,serviceKey:'sb_secret_fixture',fetch:async(raw,options)=>{
  const url=new URL(raw),body=options.body?JSON.parse(options.body):{};calls.push({path:url.pathname,options,body});
  assert.equal(options.redirect,'error');assert.equal(options.headers.apikey,'sb_secret_fixture');
  try{
   if(url.pathname==='/rest/v1/rpc/wow_customer_auth_service'){
    assert.equal(options.headers.authorization,undefined);
    return Response.json((await db.query('select public.wow_customer_auth_service($1,$2::jsonb) result',[body.p_action,JSON.stringify(body.p_data)])).rows[0].result);
   }
   if(['/auth/v1/otp','/auth/v1/recover'].includes(url.pathname)){
    if(sendFailure)return Response.json({message:'Provider transport failed'},{status:503});
    let user=(await db.query('select * from auth.users where email=$1',[body.email])).rows[0];
    if(url.pathname.endsWith('/otp')){
     assert.equal(body.create_user,true);assert(!('password' in body));
     if(!user){const id=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[id,body.email]);user={id};}
    }
    assert(user);const redirect=new URL(url.searchParams.get('redirect_to'));
    assert([origin,secondOrigin].includes(redirect.origin));assert.equal(redirect.pathname,'/');assert.equal(redirect.searchParams.get('wf-cloud'),'employee');
    const challenge=new URLSearchParams(redirect.hash.slice(1)).get('challenge');assert.match(challenge,/^[A-Za-z0-9_-]{43}$/);assert(!redirect.searchParams.has('challenge'));
    const link={tokenHash:await sha256(randomUUID()),challenge,used:false,userId:user.id,email:body.email,kind:url.pathname.endsWith('/recover')?'recover':'register',redirect};links.push(link);
    return Response.json({});
   }
   if(url.pathname==='/auth/v1/verify'){
    verifyCalls++;const link=links.find(x=>x.tokenHash===body.token_hash&&!x.used);
    if(!link||body.type!==(link.kind==='recover'?'recovery':'email'))return Response.json({message:'Expired or invalid token'},{status:403});
    link.used=true;await db.query('update auth.users set email_confirmed_at=now() where id=$1',[link.userId]);
    return Response.json(await session(link.userId));
   }
   const access=options.headers.authorization?.replace(/^Bearer /,'');
   if(url.pathname==='/auth/v1/user'){
    const user=await getUser(access);passwordCalls++;
    if(passwordHook)await passwordHook({user,body});
    if(passwordFailure)return Response.json({message:'Temporary failure'},{status:503});
    passwords.set(user.id,body.password);return Response.json(user);
   }
   if(url.pathname==='/auth/v1/logout'){
    const scope=url.searchParams.get('scope');assert(['local','global'].includes(scope));const user=await getUser(access),sid=sessions.get(access).sid;
    if(scope==='global'){
     await db.query('delete from auth.sessions where user_id=$1',[user.id]);
     for(const [key,value]of sessions)if(value.id===user.id)sessions.delete(key);
    }else{await db.query('delete from auth.sessions where id=$1',[sid]);sessions.delete(access);}
    return new Response(null,{status:204});
   }
   assert.fail(url.pathname);
  }catch(error){if(error.code==='P0001')return Response.json({code:error.code,message:error.message},{status:400});throw error;}
 }});
 const customer=createCustomerAuthActions({provider,auth,origins:[origin,secondOrigin],enabled:true});
 const handler=createHandler({auth,rpc,policy,origins:[origin,secondOrigin],moduleActions:customer.actions,publicActions:customer.publicActions});
 async function api(action,payload={},access,requestOrigin=origin){
  const response=await handler(new Request(project+'/functions/v1/wow-cloud',{method:'POST',headers:{Origin:requestOrigin,'content-type':'application/json',...(access?{Authorization:'Bearer '+access}:{})},body:JSON.stringify({action,...payload})}));
  return {status:response.status,...await response.json()};
 }
 const client=(workspaceId=wid)=>cloud.create({mode:'remote',config:{enabled:true,workspaceId,endpoint:project+'/functions/v1/wow-cloud',publishableKey:'fixture'},sessionStore:{clear(){}},fetch:(url,options)=>handler(new Request(url,{...options,headers:{...options.headers,Origin:origin}}))});
 const begin=async(input={},workspaceId=wid)=>{const requestId=randomUUID();const result=await api('auth.customerRegister',{...profile,...input,workspaceId,requestId});return {requestId,result,link:links.at(-1)};};
 const verify=(requestId,link,workspaceId=wid,pass=password,requestOrigin=origin)=>api('auth.customerVerify',{requestId,workspaceId,tokenHash:link.tokenHash,challenge:link.challenge,password:pass},null,requestOrigin);
 const configure=async(registrationEnabled=true,recoveryEnabled=true)=>{
  const current=await api('customerAuth.snapshot',{},ownerToken);
  return api('customerAuth.configure',{revision:current.settings.revision,registrationEnabled,recoveryEnabled},ownerToken);
 };
 return {wid,other,owner,ownerToken,auth,provider,handler,api,client,links,calls,begin,verify,configure,session,
  setSendFailure:value=>{sendFailure=value;},setPasswordFailure:value=>{passwordFailure=value;},setPasswordHook:value=>{passwordHook=value;},verifyCalls:()=>verifyCalls,passwordCalls:()=>passwordCalls};
}

test('customer registration validates bounded contact information without accepting an elevated role',()=>{
 assert.equal(normalizeCustomerEmail(' CUSTOMER@Example.COM '),'customer@example.com');
 for(const value of ['owner@wow.invalid','a@b.invalid','bad@example.com\nBcc:other@host.com','a..b@example.com'])assert.throws(()=>normalizeCustomerEmail(value));
 assert.deepEqual(normalizeCustomerProfile({...profile,role:'owner',permissions:['accounts.edit']}),{name:profile.name,username:profile.username,company:profile.company,country:'TR',callingCode:'+90',phone:profile.phone});
 for(const change of [{country:'ZZ'},{callingCode:'0090'},{phone:'555 text'},{phone:'12345678901234',callingCode:'+1234'}])assert.throws(()=>normalizeCustomerProfile({...profile,...change}));
 assert.deepEqual(CUSTOMER_COUNTRIES,ui.countryCodes);assert.equal(new Set(CUSTOMER_COUNTRIES).size,249);
});

test('public customer client calls are remote-only, discard stale replies, and never store a proof',async()=>{
 let finish,requests=0;const config={enabled:true,workspaceId:randomUUID(),endpoint:project+'/functions/v1/wow-cloud',publishableKey:'fixture'};
 const local=cloud.create({config,mode:'local',getLocalSnapshot:()=>({configured:false}),sessionStore:{read(){},clear(){},write(){assert.fail('unexpected write');}},fetch:()=>{requests++;assert.fail('local customer request');}});
 await assert.rejects(local.customerAuthOptions(),{code:'REMOTE_MODE_REQUIRED'});
 const remote=cloud.create({config,mode:'remote',sessionStore:{clear(){},write(){assert.fail('proof persisted');}},fetch:async(_url,options)=>{
  requests++;const payload=JSON.parse(options.body);assert.equal(payload.action,'auth.customerRecover');assert.equal(payload.workspaceId,config.workspaceId);assert.equal(options.headers.Authorization,undefined);
  return new Promise(resolve=>{finish=()=>resolve(Response.json({ok:true,accepted:true}));});
 }});
 const pending=remote.customerRecover({email:'customer@example.com',requestId:randomUUID()});
 while(!finish)await new Promise(resolve=>setTimeout(resolve,0));await remote.signOut();finish();
 await assert.rejects(pending,{code:'AUTH_REQUIRED'});assert.equal(requests,1);assert.equal(remote.getSnapshot().authenticated,false);
});

test('real customer email application uses Auth proof, private SQL and the normal sign-in boundary',async t=>{
 const db=await createProviderTestDatabase();t.after(()=>db.close());
 const migration=await readFile(new URL('../supabase/modules/customer-auth.sql',import.meta.url),'utf8');
 await db.exec(migration);await db.exec(migration);const app=await application(db);
 await t.test('both opt-ins are required; public extensions cannot replace core or protected actions',async()=>{
  assert.deepEqual(await app.api('auth.customerOptions',{workspaceId:app.wid}),{status:200,ok:true,registrationEnabled:false,recoveryEnabled:false});
  const before=app.links.length;assert.equal((await app.begin()).result.accepted,true);assert.equal(app.links.length,before);
  const absent=await app.api('customerAuth.configure',{registrationEnabled:true,recoveryEnabled:true,revision:1});assert.equal(absent.status,401);
  const disabled=createCustomerAuthActions({provider:app.provider,auth:app.auth,origins:[origin],enabled:false});
  assert.equal((await disabled.publicActions['auth.customerOptions']({body:{workspaceId:app.wid},request:new Request(project,{headers:{Origin:origin}})})).registrationEnabled,false);
  await assert.rejects(disabled.publicActions['auth.customerRegister']({body:{},request:new Request(project)}),{code:'CUSTOMER_AUTH_UNAVAILABLE'});
  assert.throws(()=>createHandler({publicActions:{'auth.signIn':()=>({})}}),/SERVER_CONFIGURATION/);
  assert.throws(()=>createHandler({publicActions:{'sync.push':()=>({})}}),/SERVER_CONFIGURATION/);
  assert.equal((await app.configure()).status,200);
 });
 let registration,customerId,customer;
 await t.test('mailbox proof precedes password and membership; role and permissions are server-selected',async()=>{
  registration=await app.begin({role:'owner',permissions:['server.edit'],password:'attacker initial password'});
  assert.equal(registration.result.accepted,true);assert.equal(app.passwordCalls(),0);
  assert.equal((await db.query('select count(*)::int n from public.wow_accounts where role=\'customer\'')).rows[0].n,0);
  const done=await app.verify(registration.requestId,registration.link);assert.deepEqual(done,{status:200,ok:true,completed:true,username:profile.username});
  assert(!('session' in done));const row=(await db.query('select * from public.wow_accounts where username=$1',[profile.username])).rows[0];customerId=row.id;
  assert.equal(row.role,'customer');assert.deepEqual(row.permissions,policy.presets('customer'));
  assert.equal((await db.query('select public.wow_customer_auth_service(\'customerAuth.profile\',$1::jsonb) value',[JSON.stringify({userId:app.owner,sessionId:JSON.parse(Buffer.from(app.ownerToken.split('.')[1],'base64url')).session_id,accountId:customerId})])).rows[0].value.profile.phone,profile.phone);
  customer=app.client();await customer.signIn({username:profile.username,password});assert.equal(customer.getSnapshot().currentAccount.role,'customer');
  await assert.rejects(customer.request('customerAuth.configure',{registrationEnabled:false,recoveryEnabled:false,revision:2}),{code:'ACCESS_DENIED'});
  assert.equal((await app.api('customerAuth.profile',{accountId:app.owner},null)).status,401);
  const contact=(await db.query('select wow_customer.contact($1) value',[customerId])).rows[0].value;
  assert.deepEqual(contact,{email:profile.email,phone:'+905551234567',name:profile.name,company:profile.company});
 });
 await t.test('used links, mismatched workspaces and expired requests never create a second membership',async()=>{
  const verifies=app.verifyCalls();assert.equal((await app.verify(registration.requestId,registration.link)).status,401);assert.equal(app.verifyCalls(),verifies);
  const other=await app.begin({email:'other@example.com',username:'another-customer'});
  assert.equal((await app.verify(other.requestId,other.link,app.other)).status,401);assert.equal(app.verifyCalls(),verifies);
  await db.query("update wow_customer.requests set expires_at=now()-interval '1 second' where id=$1",[other.requestId]);
  assert.equal((await app.verify(other.requestId,other.link)).status,401);assert.equal(app.verifyCalls(),verifies);
  assert.equal((await db.query("select count(*)::int n from public.wow_accounts where role='customer'")).rows[0].n,1);
 });
 await t.test('an email proof for a different mailbox cannot satisfy a request or change any password',async()=>{
  const one=await app.begin({email:'proof-one@example.com',username:'proof-one'}),two=await app.begin({email:'proof-two@example.com',username:'proof-two'});
  const passwords=app.passwordCalls();assert.equal((await app.verify(one.requestId,{...two.link,challenge:one.link.challenge})).status,401);assert.equal(app.passwordCalls(),passwords);
  assert.equal((await db.query("select count(*)::int n from public.wow_accounts where username in ('proof-one','proof-two')")).rows[0].n,0);
 });
 await t.test('recovery gives identical responses for owner, unknown and eligible email while preserving staff roles',async()=>{
  const results=[],before=app.links.length;
  for(const email of ['missing@example.com','owner@example.com',profile.email])results.push(await app.api('auth.customerRecover',{workspaceId:app.wid,requestId:randomUUID(),email}));
  for(const result of results)assert.deepEqual(result,{status:200,ok:true,accepted:true});assert.equal(app.links.length,before+1);
  const link=app.links.at(-1),requestId=link.redirect.searchParams.get('request'),next=password+' updated';
  assert.equal((await app.verify(requestId,link,app.wid,next)).status,200);
  await assert.rejects(customer.request('session.snapshot'));const nextClient=app.client();await nextClient.signIn({username:profile.username,password:next});
  assert.equal(nextClient.getSnapshot().currentAccount.sessionVersion,3);
  const owner=(await db.query('select role,session_version from public.wow_accounts where id=$1',[app.owner])).rows[0];assert.deepEqual(owner,{role:'owner',session_version:1});
  customer=nextClient;
 });
 await t.test('a lost or failed password-provider response still revokes old application sessions',async()=>{
  // Reset only this test email's rate window; the production endpoint cannot.
  await db.query("update wow_customer.limits set window_start=now()-interval '2 hours' where bucket like 'mail:%'");
  const requestId=randomUUID();await app.api('auth.customerRecover',{workspaceId:app.wid,requestId,email:profile.email});app.setPasswordFailure(true);
  const result=await app.verify(requestId,app.links.at(-1));assert.equal(result.status,503);app.setPasswordFailure(false);
  assert.equal((await db.query('select count(*)::int n from public.wow_sessions where account_id=$1 and closed_at is null',[customerId])).rows[0].n,0);
  await assert.rejects(customer.request('session.snapshot'));
 });
 await t.test('provider acceptance and delivery failure are honest status counters, never sent-mail assertions',async()=>{
  app.setSendFailure(true);const request=await app.begin({email:'failed-mail@example.com',username:'failed-mail'});app.setSendFailure(false);
  assert.deepEqual(request.result,{status:200,ok:true,accepted:true});
  const status=await app.api('customerAuth.snapshot',{},app.ownerToken);assert.equal(status.failed24h,1);assert(status.accepted24h>0);assert.equal(status.completed24h,2);
  assert(!JSON.stringify(status).includes('failed-mail@example.com'));assert(!JSON.stringify(status).includes('delivered'));
 });
 await t.test('bad proof attempts and unique-address flooding have durable bounds',async()=>{
  const request=await app.begin({email:'limited@example.com',username:'limited'}),before=app.verifyCalls();
  for(let i=0;i<15;i++)assert.equal((await app.verify(request.requestId,{tokenHash:'a'.repeat(64),challenge:request.link.challenge})).status,401);
  assert.equal(app.verifyCalls()-before,12);assert.equal((await db.query('select attempts from wow_customer.requests where id=$1',[request.requestId])).rows[0].attempts,12);
  await db.query("update wow_customer.limits set attempts=90 where workspace_id=$1 and bucket='requests'",[app.wid]);
  const next=await app.begin({email:'new-limited@example.com'});assert.equal(next.result.status,429);
 });
 await t.test('origins, disabled configuration, private contact fields and direct RPC permissions fail closed',async()=>{
  const response=await app.handler(new Request(project+'/functions/v1/wow-cloud',{method:'POST',headers:{Origin:'https://evil.invalid','content-type':'application/json'},body:JSON.stringify({action:'auth.customerOptions',workspaceId:app.wid})}));assert.equal(response.status,403);
  const noOrigin=await app.handler(new Request(project+'/functions/v1/wow-cloud',{method:'POST',body:JSON.stringify({action:'auth.customerOptions',workspaceId:app.wid})}));assert.equal(noOrigin.status,403);
  await app.configure(false,false);assert.equal((await app.api('auth.customerOptions',{workspaceId:app.wid})).registrationEnabled,false);
  const permissions=(await db.query("select has_function_privilege('anon','public.wow_customer_auth_service(text,jsonb)','execute') anon,has_function_privilege('authenticated','wow_customer.contact(uuid)','execute') auth")).rows[0];assert.deepEqual(permissions,{anon:false,auth:false});
  const tables=(await db.query("select c.relrowsecurity rls from pg_class c join pg_namespace n on c.relnamespace=n.oid where n.nspname='wow_customer' and c.relkind='r'")).rows;assert.equal(tables.length,4);assert(tables.every(x=>x.rls));
  await db.query("update wow_customer.requests set expires_at=now()-interval '8 days'");await db.query('select wow_customer.prune()');assert.equal((await db.query('select count(*)::int n from wow_customer.requests')).rows[0].n,0);
  assert.equal((await db.query("select count(*)::int n from cron.job where jobname='wow-customer-auth-prune' and schedule='17 * * * *'")).rows[0].n,1);
 });
});

test('email proof binding and permanent customer principals survive interleaved identity changes',async t=>{
 const db=await createProviderTestDatabase();t.after(()=>db.close());
 await db.exec(await readFile(new URL('../supabase/modules/customer-auth.sql',import.meta.url),'utf8'));
 const app=await application(db);await app.configure();
 await db.query('insert into wow_customer.settings(workspace_id,registration_enabled,recovery_enabled) values($1,true,true)',[app.other]);
 async function register(email,username){const attempt=await app.begin({email,username});assert.equal((await app.verify(attempt.requestId,attempt.link)).status,200);return attempt.link.userId;}
 async function recovery(email){const requestId=randomUUID();const result=await app.api('auth.customerRecover',{workspaceId:app.wid,requestId,email});assert.equal(result.status,200);return {requestId,link:app.links.at(-1)};}
 await t.test('same-mailbox links cannot be substituted across separate requests, enabled workspaces or origins',async()=>{
  const a=await app.begin({email:'shared-mailbox@example.com',username:'first-mailbox'}),requestB=randomUUID();
  const responseB=await app.api('auth.customerRegister',{...profile,email:'shared-mailbox@example.com',username:'second-mailbox',requestId:requestB,workspaceId:app.other},null,secondOrigin);
  assert.deepEqual(responseB,{status:200,ok:true,accepted:true});const b=app.links.at(-1);assert.notEqual(a.link.challenge,b.challenge);
  const stored=(await db.query('select challenge_hash,profile from wow_customer.requests where id=$1',[requestB])).rows[0];
  assert.equal(stored.challenge_hash,await sha256(b.challenge));assert(!JSON.stringify(stored).includes(b.challenge));
  const before=app.verifyCalls(),writes=app.passwordCalls();
  const crossed=await app.verify(requestB,a.link,app.other,password,secondOrigin);assert.equal(crossed.status,401);
  assert.equal((await app.verify(a.requestId,b,app.wid,password,origin)).status,401);
  assert.equal((await app.verify(requestB,b,app.other,password,origin)).status,401);
  assert.equal(app.verifyCalls(),before);assert.equal(app.passwordCalls(),writes);assert.equal(a.link.used,false);assert.equal(b.used,false);
  // A direct private claim with a foreign challenge also fails independently
  // of the preceding inspect check, before any password write is authorized.
  const verified=await app.session(b.userId);await db.query('update auth.users set email_confirmed_at=now() where id=$1',[b.userId]);
  const claim=await app.provider.rpc('claim',{workspaceId:app.other,origin:secondOrigin,requestId:requestB,challengeHash:await sha256(a.link.challenge),
   userId:b.userId,sessionId:JSON.parse(Buffer.from(verified.access_token.split('.')[1],'base64url')).session_id,lease:randomUUID()});
  assert.equal(claim.allowed,false);assert.equal((await db.query('select state from wow_customer.requests where id=$1',[requestB])).rows[0].state,'requested');
  assert.equal((await app.verify(requestB,b,app.other,password,secondOrigin)).status,200);
  assert.equal((await db.query('select workspace_id from public.wow_accounts where id=$1',[b.userId])).rows[0].workspace_id,app.other);
 });
 await t.test('owner API and direct role edits cannot promote a recoverable customer during the Auth password await',async()=>{
  const id=await register('role-race@example.com','role-race'),attempt=await recovery('role-race@example.com');
  let signal,release;const reached=new Promise(resolve=>{signal=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  app.setPasswordHook(async()=>{signal();await gate;});
  const pending=app.verify(attempt.requestId,attempt.link,app.wid,password+' recovered');await reached;
  try{
   for(const role of ['owner','manager','sales','custom']){
    const result=await app.api('accounts.update',{accountId:id,payload:{role}},app.ownerToken);
    assert.equal(result.status,403);assert.equal(result.error.code,'CUSTOMER_PRINCIPAL_ROLE_FIXED');
   }
   await assert.rejects(db.query("update public.wow_accounts set role='owner' where id=$1",[id]),/CUSTOMER_PRINCIPAL_ROLE_FIXED/);
   assert.equal((await db.query('select role from public.wow_accounts where id=$1',[id])).rows[0].role,'customer');
  }finally{app.setPasswordHook(null);release();}
  assert.equal((await pending).status,200);const fresh=app.client();await fresh.signIn({username:'role-race',password:password+' recovered'});
  assert.equal(fresh.getSnapshot().currentAccount.role,'customer');
  const legacy=randomUUID();await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[legacy,legacy+'@wow.invalid']);
  await db.query("insert into public.wow_accounts(id,workspace_id,login_email,username,name,role,permissions) values($1,$2,$3,'managed-login','Managed','custom',array['gallery.view'])",[legacy,app.wid,legacy+'@wow.invalid']);
  assert.equal((await app.api('accounts.update',{accountId:legacy,payload:{role:'manager'}},app.ownerToken)).status,200);
  assert.equal((await db.query('select role from public.wow_accounts where id=$1',[legacy])).rows[0].role,'manager');
 });
 await t.test('an unrelated mailbox proof closes only its new Auth session and preserves the existing account session',async()=>{
  const a=await register('logout-a@example.com','logout-a'),b=await register('logout-b@example.com','logout-b');
  const existing=await app.auth.signIn('logout-b@example.com',password);
  const opened=await app.api('auth.signIn',{workspaceId:app.wid,username:'logout-b',password});assert.equal(opened.status,200);
  const requestA=await recovery('logout-a@example.com'),requestB=await recovery('logout-b@example.com');
  const writes=app.passwordCalls();
  const result=await app.verify(requestA.requestId,{...requestB.link,challenge:requestA.link.challenge});assert.equal(result.status,401);assert.equal(app.passwordCalls(),writes);
  assert.equal((await app.auth.getUser(existing.access_token)).id,b);
  assert.equal((await app.api('session.snapshot',{},opened.session.access_token)).status,200);
  const last=app.calls.filter(call=>call.path==='/auth/v1/logout').at(-1);assert(last);assert.equal(last.options.headers.authorization.startsWith('Bearer '),true);
  assert.equal((await db.query('select count(*)::int n from public.wow_sessions where account_id=$1 and closed_at is null',[b])).rows[0].n,1);
  assert.equal((await db.query('select session_version from public.wow_accounts where id=$1',[a])).rows[0].session_version,1);
 });
 await t.test('suspension during the provider await stays authoritative and cannot be undone by recovery completion',async()=>{
  const id=await register('status-race@example.com','status-race'),attempt=await recovery('status-race@example.com');
  let signal,release;const reached=new Promise(resolve=>{signal=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  app.setPasswordHook(async()=>{signal();await gate;});const pending=app.verify(attempt.requestId,attempt.link,app.wid,password+' replaced');await reached;
  try{assert.equal((await app.api('accounts.status',{accountId:id,status:'suspended'},app.ownerToken)).status,200);}
  finally{app.setPasswordHook(null);release();}
  assert.equal((await pending).status,401);assert.equal((await db.query('select status from public.wow_accounts where id=$1',[id])).rows[0].status,'suspended');
  const denied=await app.api('auth.signIn',{workspaceId:app.wid,username:'status-race',password:password+' replaced'});assert.notEqual(denied.status,200);
  assert.equal((await db.query('select count(*)::int n from public.wow_sessions where account_id=$1 and closed_at is null',[id])).rows[0].n,0);
 });
});
