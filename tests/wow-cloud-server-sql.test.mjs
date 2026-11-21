import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createProviderTestDatabase} from '../supabase/testing/provider-fixtures.mjs';

// Real PostgreSQL executes the application's SQL. Only provider-owned Auth,
// Storage, Vault, pg_net and Cron integration surfaces are local test fixtures.
// No network request, account credential, paid resource or remote mutation is
// possible in this in-memory test. Live provider compatibility is a separate gate.


test('PostgreSQL compiles the real schema and passes rolled-back identity, CAS, idempotency, queue and permission gates',async()=>{
  const db=await createProviderTestDatabase();
  try{
    const gate=await readFile(new URL('./wow-cloud-server-transaction.sql',import.meta.url),'utf8');
    const results=await db.exec(gate);
    assert(results.some(result=>result.rows?.some(row=>row.result==='WOW_SQL_TRANSACTION_GATE_PASSED')));
    const pushGate=await readFile(new URL('./wow-cloud-server-push-transaction.sql',import.meta.url),'utf8');
    const pushResults=await db.exec(pushGate);
    assert(pushResults.some(result=>result.rows?.some(row=>row.result==='WOW_PUSH_TRANSACTION_GATE_PASSED')));
    const state=await db.query('select (select count(*) from auth.users) users,(select count(*) from public.wow_workspaces) workspaces,(select count(*) from vault.secrets) secrets,(select count(*) from net.local_test_calls) network_calls');
    assert.deepEqual(state.rows[0],{users:0,workspaces:0,secrets:0,network_calls:0});
  }catch(error){
    // PostgreSQL diagnostics are useful; reprinting the whole migration/gate
    // after a failure obscures the exact failing statement.
    throw new Error([error.message,error.where,error.internalQuery].filter(Boolean).join('\n'));
  }finally{await db.close();}
});
