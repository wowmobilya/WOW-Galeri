import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {createProviderTestDatabase} from '../supabase/testing/provider-fixtures.mjs';
import {createFinanceActions,validateFinanceAction} from '../supabase/functions/wow-cloud/modules/finance.mjs';

const sample={box:'main:USD',currency:'USD',kind:'income',amount:'1.01',description:'receipt',day:'2025-06-30',commandId:randomUUID()};
test('rejects imprecise money, invalid dates and identity spoofing',async()=>{
  for(const amount of ['1e5',1.222,'0.001','-4','0'])assert.throws(()=>validateFinanceAction('finance.transaction',{...sample,amount}));
  assert.throws(()=>validateFinanceAction('finance.transaction',{...sample,day:'2025-02-29'}));
  const actor={userId:randomUUID(),sessionId:randomUUID()};
  const api=createFinanceActions({moduleRpc:async(name,action,b)=>({name,action,b})});
  const result=await api['finance.transaction']({actor,body:{...sample,userId:'forged',sessionId:'forged',workspace:'another'}});
  assert.equal(result.name,'wow_finance_service');assert.equal(result.b.userId,actor.userId);assert.equal(result.b.sessionId,actor.sessionId);
  assert.equal(result.b.workspace,undefined);
});
test('live capture checks access first, accepts server observations only, and retains the saved receipt on retry',async()=>{
 const actor={userId:randomUUID(),sessionId:randomUUID()},body={base:'gold',counter:'USD',commandId:randomUUID(),observation:{raw:'1'}};
 let lookups=0,saved;const rpc=async(name,action,d)=>{if(action.endsWith('.check'))return {receipt:saved};return saved={id:d.commandId,raw:d.observation.raw,source:d.observation.source};};
 const unavailable=createFinanceActions({moduleRpc:rpc});
 await assert.rejects(()=>unavailable['metals.quote.live']({actor,body}),{code:'QUOTE_UNAVAILABLE'});
 const api=createFinanceActions({moduleRpc:rpc,quoteProvider:async()=>{lookups++;return {raw:'2782.11',source:'fixture',at:'2025-01-01T00:00:00Z',unit:'troy_ounce'};}});
 assert.equal((await api['metals.quote.live']({actor,body})).raw,'2782.11');
 await api['metals.quote.live']({actor,body});assert.equal(lookups,1);
});
test('cash, metal, payroll, replay, permissions and archive are atomic in PostgreSQL',async()=>{
 const db=await createProviderTestDatabase();
 try{
   await db.exec(await readFile(new URL('../supabase/modules/finance.sql',import.meta.url),'utf8'));
   await db.exec(await readFile(new URL('../supabase/modules/finance.sql',import.meta.url),'utf8'));
   await db.exec(await readFile(new URL('./finance-transaction.sql',import.meta.url),'utf8'));
 }catch(e){throw Error([e.message,e.detail,e.where].filter(Boolean).join('\n'),{cause:e});}finally{await db.close();}
});
