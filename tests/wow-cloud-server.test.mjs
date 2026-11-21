import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const policy=require('../accounts-policy.js'),dataPolicy=require('../accounts-data-policy.js'),costCore=require('../product-cost-core.js');
const {prepareBatch,normalizeProfile,projectChange,createHandler}=await import('../supabase/functions/wow-cloud/core.mjs');
const actor=(role,permissions=policy.presets(role))=>({id:'account',role,permissions,status:'active',sessionVersion:1});
const context={workspaceId:'workspace',account:actor('owner'),revision:1};
const dependencies={policy,dataPolicy,costCore,now:()=>Date.parse('2026-11-21T12:00:00Z')};
const operation=(store,id,value,baseRevision=1)=>({store,id,value,baseRevision,kind:'put'});
const row=(store,id,value,revision=1)=>({store,id,value,revision,deleted:false});

test('server rejects unknown stores, duplicate ids and changed record ids before any transaction',()=>{
  for(const operations of [[operation('secret','x',{id:'x'})],[operation('products','x',{id:'other'})],
    [operation('products','x',{id:'x'}),operation('products','x',{id:'x'})]]){
    assert.throws(()=>prepareBatch({...dependencies,context,operations,records:[],products:[]}),/INVALID/);
  }
});

test('carpenter update keeps hidden invoice prices and rejects injected finance changes',()=>{
  const account=actor('carpentry'),raw={id:7,invNo:'W7',total:900,items:[{productId:'p',name:'Desk',qty:1,priceUSD:900,costSnapshot:{unitCostUSD:100}}],manufacturingTicket:{id:'t',lines:[{id:'l',status:'pending',note:''}]}};
  const value=dataPolicy.projectRead(account,'invoices',raw);value.manufacturingTicket.lines[0].status='working';
  const prepared=prepareBatch({...dependencies,context:{...context,account},operations:[operation('invoices',7,value)],records:[row('invoices',7,raw)],products:[]});
  assert.equal(prepared.operations[0].value.total,900);assert.equal(prepared.operations[0].value.items[0].priceUSD,900);
  assert.equal(prepared.operations[0].value.manufacturingTicket.lines[0].status,'working');
  const projected=projectChange(account,prepared.operations[0],dependencies);
  assert.equal(projected.value.total,undefined);assert.equal(projected.value.items[0].costSnapshot,undefined);
  assert.throws(()=>prepareBatch({...dependencies,context:{...context,account},operations:[operation('invoices',7,{...value,total:1})],records:[row('invoices',7,raw)],products:[]}),/ACCESS_DENIED/);
});

test('sales invoices capture trusted server product costs while worker response omits them',()=>{
  const account=actor('sales'),value={id:'i',invNo:'I1',items:[{lineId:'l',productId:'p',qty:2,name:'Desk',priceUSD:100,costSnapshot:null}]};
  const prepared=prepareBatch({...dependencies,context:{...context,account},operations:[operation('invoices','i',value,0)],records:[],products:[row('products','p',{id:'p',costing:{unitCostUSD:30,currency:'USD'}})]});
  assert.equal(prepared.operations[0].value.items[0].costSnapshot.unitCostUSD,30);
  assert.equal(projectChange(account,prepared.operations[0],dependencies).value.items[0].costSnapshot,undefined);
});

test('worker settings merge retains unknown owner settings and refuses unauthorized edits',()=>{
  const account=actor('carpentry'),raw={id:'main',bankSecret:'owner-only',dailyTasks:{version:1,items:[]}};
  const value=dataPolicy.projectRead(account,'settings',raw);value.dailyTasks.items.push({id:'t',title:'Cut'});
  const prepared=prepareBatch({...dependencies,context:{...context,account},operations:[operation('settings','main',value)],records:[row('settings','main',raw)],products:[]});
  assert.equal(prepared.operations[0].value.bankSecret,'owner-only');
  assert.throws(()=>prepareBatch({...dependencies,context:{...context,account},operations:[operation('settings','main',{...value,bankSecret:'changed'})],records:[row('settings','main',raw)],products:[]}),/ACCESS_DENIED/);
});

test('stale record revision conflicts before authorization candidate is committed',()=>{
  assert.throws(()=>prepareBatch({...dependencies,context,operations:[operation('products','p',{id:'p'},2)],records:[row('products','p',{id:'p'},3)],products:[]}),error=>error.code==='CONFLICT'&&error.conflicts[0].actualRevision===3);
});

test('profile role grants cannot invent unknown or owner-only worker permissions',()=>{
  const profile=normalizeProfile({name:'Worker',username:'WORKER',role:'sales',permissions:['accounts.edit','products.view','products.edit','invented.view']},policy);
  assert.deepEqual(profile.permissions,['products.view','products.edit']);assert.equal(profile.username,'worker');
  assert.throws(()=>normalizeProfile({name:'A',username:'worker',role:'superadmin'},policy),/INVALID_ROLE/);
});

test('unauthenticated and unknown actions cannot call service-role database operations',async()=>{
  const calls=[],handler=createHandler({...dependencies,origins:['https://galeri.wowfurniture.com.tr'],rpc:async(...args)=>{calls.push(args);return{};},auth:{getUser:async()=>{throw Error('invalid');}}});
  for(const body of [{action:'sync.pull'},{action:'database.dump'}]){
    const response=await handler(new Request('https://edge.test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
    assert([400,401].includes(response.status));assert.equal((await response.json()).ok,false);
  }
  assert.equal(calls.length,0);
});

test('cross-origin browser requests are denied before auth and preflight remains bounded',async()=>{
  const handler=createHandler({...dependencies,origins:['https://galeri.wowfurniture.com.tr'],rpc:()=>assert.fail('no RPC'),auth:{}});
  const denied=await handler(new Request('https://edge.test',{method:'POST',headers:{origin:'https://other.test'},body:'{}'}));
  assert.equal(denied.status,403);assert.equal(denied.headers.get('access-control-allow-origin'),null);
  const allowed=await handler(new Request('https://edge.test',{method:'OPTIONS',headers:{origin:'https://galeri.wowfurniture.com.tr'}}));
  assert.equal(allowed.status,204);assert.equal(allowed.headers.get('access-control-allow-origin'),'https://galeri.wowfurniture.com.tr');
});
