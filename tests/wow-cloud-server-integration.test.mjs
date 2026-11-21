import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHandler,sha256} from '../supabase/functions/wow-cloud/core.mjs';
import {createRestDependencies} from '../supabase/functions/wow-cloud/rest.mjs';
import {initializePush} from '../supabase/management/initialize-push.mjs';
const require=createRequire(import.meta.url);
const policy=require('../accounts-policy.js'),dataPolicy=require('../accounts-data-policy.js'),costCore=require('../product-cost-core.js');
const userId='11111111-1111-4111-8111-111111111111',sessionId='22222222-2222-4222-8222-222222222222';
const workspaceId='33333333-3333-4333-8333-333333333333';
const jwt='header.'+Buffer.from(JSON.stringify({session_id:sessionId})).toString('base64url')+'.signature';
const deps={policy,dataPolicy,costCore,auth:{getUser:async token=>{assert.equal(token,jwt);return {id:userId};}}};
const owner={id:userId,name:'Owner',role:'owner',permissions:policy.presets('owner'),status:'active',sessionVersion:1};
const request=(body,token=jwt)=>new Request('https://edge.test/functions/v1/wow-cloud',{
  method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});

test('server-only module actions require a verified actor and cannot replace public or core actions',async()=>{
  let called=0;
  const handler=createHandler({...deps,moduleActions:{'chat.rooms':async({body,actor})=>{
    called++;assert.deepEqual(actor,{userId,sessionId});assert.equal(body.userId,'spoofed');return {rooms:[]};
  }}});
  assert.equal((await handler(request({action:'chat.rooms',userId:'spoofed'},null))).status,401);
  assert.equal(called,0);
  const response=await handler(request({action:'chat.rooms',userId:'spoofed'}));
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,rooms:[]});assert.equal(called,1);
  assert.throws(()=>createHandler({...deps,moduleActions:{'auth.signIn':async()=>({})}}),/SERVER_CONFIGURATION/);
  assert.equal((await handler(request({action:'database.dump'}))).status,400);
});

test('REST uses opaque server keys only as apikey, verified user JWTs as bearer, and a fixed module RPC allowlist',async()=>{
  const calls=[],fetch=async(url,options)=>{calls.push({url,options});return Response.json({id:userId});};
  const remote=createRestDependencies({url:'https://project.example',serviceKey:'sb_secret_test',fetch});
  await remote.rpc('session.snapshot',{userId,sessionId});
  assert.equal(calls[0].options.headers.apikey,'sb_secret_test');assert.equal(calls[0].options.headers.authorization,undefined);
  await remote.auth.getUser(jwt);assert.equal(calls[1].options.headers.authorization,'Bearer '+jwt);
  await remote.moduleRpc('wow_chat_service','chat.rooms',{userId,sessionId});
  assert(calls[2].url.endsWith('/rest/v1/rpc/wow_chat_service'));
  assert.deepEqual(JSON.parse(calls[2].options.body),{p_action:'chat.rooms',p_data:{userId,sessionId}});
  assert.throws(()=>remote.moduleRpc('wow_push_configure','run',{}),/SERVER_CONFIGURATION/);
  const legacy=createRestDependencies({url:'https://project.example',serviceKey:'legacy.jwt.key',fetch});
  await legacy.rpc('session.snapshot',{});assert.equal(calls.at(-1).options.headers.authorization,'Bearer legacy.jwt.key');
});

test('storage deletion accepts only exact immutable chat/files object paths returned by server cleanup queues',async()=>{
  const calls=[],remote=createRestDependencies({url:'https://project.example',serviceKey:'sb_secret_test',fetch:async(url,options)=>{calls.push({url,options});return Response.json([]);}});
  const path='files/'+workspaceId+'/'+userId+'/'+sessionId+'/'+('a'.repeat(64));
  await remote.storage.remove(path);
  assert(calls[0].url.endsWith('/storage/v1/object/wow-files'));assert.equal(calls[0].options.method,'DELETE');
  assert.deepEqual(JSON.parse(calls[0].options.body),{prefixes:[path]});
  for(const wrong of ['',workspaceId+'/image.png','files/'+workspaceId,'files/../private','chat/'+workspaceId+'/'+userId+'/'+sessionId+'/'+('a'.repeat(64))+'/'])assert.throws(()=>remote.storage.remove(wrong),/INVALID_STORAGE_PATH/);
  assert.equal(calls.length,1);
});

test('lost upload acknowledgements replay canonical staged metadata without changing durable batch hashes',async()=>{
  let time=Date.parse('2026-11-21T12:00:00Z'),canonical,uploads=0;
  const handler=createHandler({...deps,now:()=>time,storage:{put:async()=>{uploads++;}},rpc:async(action,data)=>{
    if(action==='session.snapshot')return {workspaceId,identity:{currentAccount:owner}};
    if(action==='media.stage'){
      canonical??={...data.record,updatedAt:'2026-11-21T12:00:00+00:00'};
      return {record:canonical};
    }
    if(action==='media.ready')return {record:canonical};
    assert.fail('unexpected RPC '+action);
  }});
  const input={action:'media.upload',id:'photo',data:'data:image/png;base64,AQID'};
  const first=await (await handler(request(input))).json();time+=86400000;
  const retry=await (await handler(request(input))).json();
  assert.equal(first.ok,true);assert.deepEqual(retry,first);assert.equal(uploads,2);
  const batch=record=>({deviceId:'device-1',operations:[{store:'media',id:'photo',kind:'put',baseRevision:0,value:record}],origin:'live'});
  assert.equal(await sha256(JSON.stringify(batch(first.record))),await sha256(JSON.stringify(batch(retry.record))));
});

test('committed event drafts come from validated business candidates, never a client-supplied push event',async()=>{
  const calls=[];
  const handler=createHandler({...deps,rpc:async(action,data)=>{
    calls.push({action,data});
    if(action==='sync.prepare')return {context:{workspaceId,account:owner},records:[],products:[],uploads:[],relatedInvoices:[]};
    if(action==='sync.commit')return {batchId:data.batchId,changes:data.projected,commitRevision:1};
    assert.fail(action);
  }});
  const response=await handler(request({action:'sync.push',batchId:'batch-00000001',deviceId:'device-1',origin:'live',
    operations:[{store:'invoices',id:'invoice-1',kind:'put',baseRevision:0,value:{id:'invoice-1',invNo:'P-101',grandTotal:345,items:[]}}],
    pushEvents:[{kind:'test',details:{title:'Injected'}}]}));
  assert.equal(response.status,200);
  const committed=calls.find(x=>x.action==='sync.commit').data;
  assert.equal(committed.pushEvents.length,1);assert.equal(committed.pushEvents[0].kind,'proforma');
  assert.equal(committed.pushEvents[0].revision,1);assert.equal(committed.pushEvents[0].details.reference,'P-101');
  assert(!JSON.stringify(committed.pushEvents).includes('Injected'));
  assert.deepEqual({userId:committed.userId,sessionId:committed.sessionId},{userId,sessionId});
});

test('workers cannot suppress notifications; historical owner origins are explicit and part of retry identity',async()=>{
  const input={action:'sync.push',batchId:'batch-00000002',deviceId:'device-1',operations:[{store:'products',id:'p',kind:'put',baseRevision:0,value:{id:'p',name:'Product'}}]};
  const hashes=[],commits=[];let account={...owner,role:'sales',permissions:policy.presets('sales')};
  const handler=createHandler({...deps,rpc:async(action,data)=>{
    if(action==='sync.prepare'){hashes.push(data.requestHash);return {context:{workspaceId,account},records:[],products:[],uploads:[]};}
    if(action==='sync.commit'){commits.push(data);return {batchId:data.batchId,changes:data.projected,commitRevision:1};}
    assert.fail(action);
  }});
  assert.equal((await handler(request({...input,origin:'bootstrap'}))).status,403);assert.equal(commits.length,0);
  account=owner;
  assert.equal((await handler(request({...input,origin:'bootstrap'}))).status,200);assert.deepEqual(commits.at(-1).pushEvents,[]);
  assert.equal((await handler(request({...input,origin:'restore'}))).status,200);assert.deepEqual(commits.at(-1).pushEvents,[]);
  assert.equal((await handler(request(input))).status,200);assert.equal(commits.at(-1).origin,'live');
  assert.notEqual(hashes.at(-1),hashes.at(-2));assert.notEqual(hashes.at(-2),hashes.at(-3));
});

test('worker media access seeks bounded reference pages and requires a visible reference before signing',async()=>{
  const account={...owner,role:'custom',permissions:['products.view']},record={store:'media',id:'photo',revision:1,value:{id:'photo',storagePath:workspaceId+'/immutable',contentType:'image/png'}};
  let pages=0,signs=0;
  const handler=createHandler({...deps,storage:{sign:async(path)=>{signs++;assert.equal(path,record.value.storagePath);return 'https://signed.example/photo';}},rpc:async(action,data)=>{
    if(action==='session.snapshot')return {workspaceId,identity:{currentAccount:account}};
    if(action==='media.resolve')return {records:[record]};
    if(action==='media.references'){
      pages++;
      if(pages===1)return {references:[{store:'settings',id:'main',value:{id:'main',ownerPrivate:'wfmedia:photo'}}],cursor:{store:'settings',id:'main'},hasMore:true};
      assert.deepEqual(data.after,{store:'settings',id:'main'});
      return {references:[{store:'products',id:'p',value:{id:'p',image:'wfmedia:photo'}}],cursor:{store:'products',id:'p'},hasMore:false};
    }
    assert.fail(action);
  }});
  const response=await handler(request({action:'media.download',id:'photo',storagePath:record.value.storagePath}));
  assert.equal(response.status,200);assert.equal(pages,2);assert.equal(signs,1);
  assert.equal((await handler(request({action:'media.references',ids:['photo']}))).status,400);
});

test('pathological media reference expansion fails explicitly within its budget and never signs an unproven asset',async()=>{
  let pages=0;
  const handler=createHandler({...deps,storage:{sign:()=>assert.fail('unproven media')},rpc:async action=>{
    if(action==='session.snapshot')return {workspaceId,identity:{currentAccount:{...owner,role:'custom',permissions:['products.view']}}};
    if(action==='media.resolve')return {records:[{store:'media',id:'photo',revision:1,value:{id:'photo',storagePath:'private'}}]};
    if(action==='media.references')return {references:[],cursor:{store:'settings',id:++pages},hasMore:true};
    assert.fail(action);
  }});
  const response=await handler(request({action:'media.download',id:'photo',storagePath:'private'}));
  assert.equal(response.status,503);assert.equal((await response.json()).error.code,'MEDIA_LOOKUP_LIMIT');assert.equal(pages,16);
});

test('management push initialization sends secret material only to the configured project and returns public metadata',async()=>{
  const projectUrl='https://abcdefghijklmnopqrst.supabase.co',privateKey='B'.repeat(43),publicKey='A'.repeat(87);
  let called=0;
  const fetch=async(url,options)=>{
    called++;assert.equal(url,projectUrl+'/rest/v1/rpc/wow_push_configure');assert.equal(options.redirect,'error');
    assert.equal(options.headers.authorization,undefined);assert.equal(options.headers.apikey,'sb_secret_fixture');
    const body=JSON.parse(options.body);assert.equal(body.p_data.projectUrl,projectUrl);assert.equal(body.p_data.privateKey,privateKey);
    assert.match(body.p_data.workerToken,/^[A-Za-z0-9_-]{64}$/);
    return Response.json({configured:true,publicKey,cronJobId:1,privateKey,workerToken:body.p_data.workerToken});
  };
  const result=await initializePush({projectUrl,serviceKey:'sb_secret_fixture',generateVAPIDKeys:()=>({publicKey,privateKey}),fetch});
  assert.deepEqual(result,{configured:true,publicKey,cronJobId:1});assert.equal(called,1);
  await assert.rejects(initializePush({projectUrl:'https://127.0.0.1',serviceKey:'sb_secret_fixture',generateVAPIDKeys:()=>({}),fetch}),/INVALID_PUSH_CONFIGURATION/);
  assert.equal(called,1);
});
