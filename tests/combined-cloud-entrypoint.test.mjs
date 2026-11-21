import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createProviderTestDatabase} from '../supabase/testing/provider-fixtures.mjs';

test('the complete repeatable release installs and the production Edge entrypoint dispatches scoped modules and readiness',async(t)=>{
 const release=JSON.parse(await readFile(new URL('../supabase/release.json',import.meta.url),'utf8'));
 const db=await createProviderTestDatabase();t.after(()=>db.close());
 const migrations=await Promise.all(release.migrations.map(async name=>(await readFile(new URL('../supabase/'+name,import.meta.url),'utf8'))
   .replace(/^create extension if not exists pg_net;$/m,'-- local provider pg_net')
   .replace(/^create extension if not exists pg_cron with schema pg_catalog;$/m,'-- local provider Cron')));
 for(const migration of migrations.slice(1))await db.exec(migration);
 for(const migration of migrations)await db.exec(migration);
 const unprotected=await db.query("select ns.nspname,c.relname from pg_class c join pg_namespace ns on ns.oid=c.relnamespace where c.relkind in ('r','p') and not c.relrowsecurity and ((ns.nspname='public' and c.relname like 'wow\\_%' escape '\\') or ns.nspname like 'wow\\_%' escape '\\')");
 assert.deepEqual(unprotected.rows,[],'every application table has RLS enabled');
 const exposed=await db.query("select ns.nspname,p.proname from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where p.prosecdef and ((ns.nspname='public' and p.proname like 'wow\\_%' escape '\\') or ns.nspname like 'wow\\_%' escape '\\') and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'))");
 assert.deepEqual(exposed.rows,[],'privileged application functions are not browser RPCs');
 const w=randomUUID(),uid=randomUUID(),sid=randomUUID();
 await db.query('insert into public.wow_workspaces(id,name) values($1,$2)',[w,'Full release']);
 await db.query('insert into auth.users(id) values($1)',[uid]);
 await db.query("insert into public.wow_accounts(id,workspace_id,login_email,username,name,role,permissions) values($1,$2,'release@example.test','release','Release','owner','{}')",[uid,w]);
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,uid]);
 await db.query('insert into public.wow_sessions(session_id,account_id,session_version) values($1,$2,1)',[sid,uid]);
 const originalFetch=globalThis.fetch,originalDeno=globalThis.Deno;let serve,calls=0;
 t.after(()=>{globalThis.fetch=originalFetch;if(originalDeno===undefined)delete globalThis.Deno;else globalThis.Deno=originalDeno;});
 const base='https://'+release.projectRef+'.supabase.co';
 const env={SUPABASE_URL:base,SUPABASE_SERVICE_ROLE_KEY:'local-fixture-service',WOW_ALLOWED_ORIGINS:release.productionOrigin};
 globalThis.Deno={env:{get:key=>env[key]},serve:handler=>{serve=handler;}};
 const allowed=new Set(['wow_service','wow_gallery_service','wow_files_service','wow_chat_service','wow_finance_service','wow_operations_service','wow_assistant_service','wow_customer_auth_service','wow_public_share_service','wow_communications_service']);
 globalThis.fetch=async(url,options)=>{
  calls++;assert.equal(new URL(url).origin,base,'provider fixtures never make an external request');
  const path=new URL(url).pathname;
  if(path==='/auth/v1/user')return Response.json({id:uid});
  const fn=path.split('/').at(-1);
  try{
   if(fn==='wow_operations_health')return Response.json((await db.query('select public.wow_operations_health() v')).rows[0].v);
   assert(allowed.has(fn),'unexpected provider route '+path);
   const body=JSON.parse(options.body);
   return Response.json((await db.query('select public.'+fn+'($1,$2::jsonb) v',[body.p_action,JSON.stringify(body.p_data)])).rows[0].v);
  }catch(error){return Response.json({code:error.code,message:error.message,details:error.detail},{status:400});}
 };
 await import('../supabase/functions/wow-cloud/index.ts');assert.equal(typeof serve,'function');
 const catalog=await db.query('select permission from public.wow_permission_catalog order by permission');
 assert.deepEqual(catalog.rows.map(row=>row.permission),globalThis.WFAccountPolicy.permissionKeys.slice().sort(),'SQL and application capabilities have one exact catalog');
 const jwt='header.'+Buffer.from(JSON.stringify({session_id:sid})).toString('base64url')+'.signature';
 const call=(action,body={},authenticated=true)=>serve(new Request(base+'/functions/v1/wow-cloud',{method:'POST',headers:{'content-type':'application/json',origin:release.productionOrigin,...(authenticated?{authorization:'Bearer '+jwt}:{})},body:JSON.stringify({action,...body})}));
 assert.equal((await serve(new Request(base+'/functions/v1/wow-cloud/health'))).status,503,'a project without a heartbeat is not ready');
 for(const action of ['gallery.snapshot','chat.rooms','files.list','finance.list','payroll.list','metals.list','assistant.status','operations.snapshot','offline.ownerGrant','customerAuth.snapshot','gallery.share.status','communications.status']){
  const count=calls;assert.equal((await call(action,{},false)).status,401,action);assert.equal(calls,count,'unauthenticated input never reaches provider services');
 }
 for(const [action,body] of [['gallery.snapshot',{}],['chat.init',{}],['files.list',{}],['finance.list',{tab:'boxes'}],['payroll.list',{tab:'resources'}],['metals.list',{tab:'holdings'}],['assistant.status',{}],['operations.check',{}],['customerAuth.snapshot',{}],['gallery.share.status',{}],['communications.status',{}]]){
  const response=await call(action,body),value=await response.json();assert.equal(response.status,200,action+': '+JSON.stringify(value));
  assert.equal(value.ok,true);if(action==='assistant.status')assert.equal(value.provider.configured,false,'absence of provider secrets stays explicit');
 }
 const options=await call('auth.customerOptions',{workspaceId:w},false);
 assert.equal(options.status,200);assert.deepEqual(await options.json(),{ok:true,registrationEnabled:false,recoveryEnabled:false});
 const publicResponse=await serve(new Request(base+'/functions/v1/wow-cloud/public-share/'+randomUUID()+'/metadata'));
 assert.equal(publicResponse.status,503,'public publication stays disabled without the verified same-origin route');
 assert.equal((await serve(new Request(base+'/functions/v1/wow-cloud/mail-webhook'))).status,405);
 const unknownWebhook=await serve(new Request(base+'/functions/v1/wow-cloud/mail-webhook',{method:'POST',body:'{}'}));
 assert.notEqual(unknownWebhook.status,200,'an unsigned callback cannot acknowledge email delivery');
 const health=await serve(new Request(base+'/functions/v1/wow-cloud/health'));assert.equal(health.status,200);
 assert.deepEqual(Object.keys(await health.json()).sort(),['checkedAt','ok','service'],'readiness has no workspace or credential data');
 const count=calls;assert.equal((await call('wow_storage_maintenance',{p_action:'claim'})).status,400);assert.equal(calls,count,'private maintenance RPCs are not app actions');
 assert.equal((await serve(new Request(base+'/functions/v1/wow-cloud/health',{method:'POST'}))).status,405);
});
