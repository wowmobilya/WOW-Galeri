import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createProviderTestDatabase} from '../supabase/testing/provider-fixtures.mjs';
import {createHandler} from '../supabase/functions/wow-cloud/core.mjs';
import {createFinanceActions} from '../supabase/functions/wow-cloud/modules/finance.mjs';
const require=createRequire(import.meta.url),policy=require('../accounts-policy.js'),dataPolicy=require('../accounts-data-policy.js'),costCore=require('../product-cost-core.js');

test('original cashboxes and finance posting share one locked sufficient-balance invariant without rewriting historical imports',async(t)=>{
 const db=await createProviderTestDatabase();t.after(()=>db.close());
 await db.exec(await readFile(new URL('../supabase/modules/finance.sql',import.meta.url),'utf8'));
 const wid=randomUUID(),uid=randomUUID(),sid=randomUUID();
 await db.query('insert into public.wow_workspaces(id,name) values($1,$2)',[wid,'Cashbox invariant']);
 await db.query('insert into auth.users(id) values($1)',[uid]);
 await db.query("insert into public.wow_accounts(id,workspace_id,login_email,username,name,role,permissions) values($1,$2,'cash@example.test','cash','Cash','owner','{}')",[uid,wid]);
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,uid]);
 await db.query('insert into public.wow_sessions(session_id,account_id,session_version) values($1,$2,1)',[sid,uid]);
 async function invoke(fn,action,data){try{return (await db.query('select '+fn+'($1,$2::jsonb) v',[action,JSON.stringify(data)])).rows[0].v;}
  catch(error){throw Object.assign(error,{code:error.message,status:error.message.startsWith('INVALID_')?422:error.message==='ACCESS_DENIED'?403:409});}}
 const remote={rpc:(action,data)=>invoke('public.wow_service',action,data),moduleRpc:(fn,action,data)=>invoke('public.'+fn,action,data)};
 const handler=createHandler({...remote,policy,dataPolicy,costCore,auth:{getUser:async()=>({id:uid})},moduleActions:createFinanceActions(remote)});
 const jwt='header.'+Buffer.from(JSON.stringify({session_id:sid})).toString('base64url')+'.signature';
 const call=body=>handler(new Request('https://example.test/functions/v1/wow-cloud',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+jwt},body:JSON.stringify(body)}));
 const movement=(id,units,type=units<0?'expense':'receipt')=>({store:'settings',id:'cashbox-entry/'+id,kind:'put',baseRevision:0,
  value:{id:'cashbox-entry/'+id,date:'2026-11-21',type,note:'Test movement',legs:[{currency:'USD',units}]}});
 const sync=(operations,origin='live')=>call({action:'sync.push',batchId:randomUUID(),deviceId:'fixture-device',origin,operations});
 const balance=async()=>Number((await db.query("select wow_fin.balance($1,'main:USD') balance",[wid])).rows[0].balance);
 let response=await sync([movement('empty-expense',-100)]);assert.equal(response.status,422);assert.equal((await response.json()).error.code,'INVALID_INSUFFICIENT_BALANCE');assert.equal(await balance(),0);
 assert.equal((await db.query('select count(*)::int n from public.wow_batches')).rows[0].n,0,'failed balance validation rolls back records, batch receipt and events');
 assert.equal((await sync([movement('opening',10000,'opening')])).status,200);assert.equal(await balance(),100);
 response=await call({action:'finance.transaction',commandId:randomUUID(),box:'main:USD',currency:'USD',kind:'expense',amount:'60.00',description:'Native expense',day:'2026-11-21'});
 assert.equal(response.status,200);assert.equal(await balance(),40);
 assert.equal((await sync([movement('too-much',-5000)])).status,422);assert.equal(await balance(),40);
 assert.equal((await sync([movement('allowed',-4000)])).status,200);assert.equal(await balance(),0);
 assert.equal((await sync([movement('atomic-spend',-200),movement('atomic-receipt',200)])).status,200,'one atomic batch validates its final balance, not an intermediate order');
 assert.equal(await balance(),0);
 assert.equal((await sync([movement('old-deficit',-300)],'restore')).status,200,'authorized historical restore preserves the imported truth');assert.equal(await balance(),-3);
 assert.equal((await sync([movement('new-decrease',-1)])).status,422);assert.equal(await balance(),-3);
 assert.equal((await sync([movement('partial-recovery',100)])).status,200);assert.equal(await balance(),-2);
 const snapshot=await db.query("select has_function_privilege('anon','wow_fin.sync_cash_snapshot(uuid)','execute') a,has_function_privilege('authenticated','wow_fin.sync_cash_validate(uuid,jsonb)','execute') b");
 assert.deepEqual(snapshot.rows[0],{a:false,b:false});
});
