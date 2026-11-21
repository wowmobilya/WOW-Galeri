'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const acorn=require('acorn');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const copy=value=>value===undefined?undefined:structuredClone(value);
function extract(name){
  const start=html.indexOf('function '+name+'(');
  assert(start>=0,name+' exists');
  const async=html.slice(start-6,start)==='async ';
  const source=html.slice(async?start-6:start);
  return source.slice(0,acorn.parseExpressionAt(source,0,{ecmaVersion:'latest'}).end);
}
function storage(initial={},options={}){
  const saved=new Map(Object.entries(initial).map(([name,rows])=>[name,new Map(rows.map(row=>[row.id,copy(row)]))]));
  const seen=[];let after=0,backup=0,pending=[];
  function advance(){const work=pending[0];if(!work)return;try{work();}finally{pending.shift();if(pending.length)queueMicrotask(advance);}}
  const database={transaction(names,mode){
    names=Array.isArray(names)?names:[names];seen.push([...names]);
    const work=[];let draft,aborted=false;
    const tx={error:null,abort(){aborted=true;},objectStore(name){
      assert(names.includes(name),'transaction must include '+name);
      const request=run=>{const result={};work.push(()=>{try{result.result=run();result.onsuccess?.();}catch(error){result.error=error;tx.error=error;result.onerror?.();aborted=true;}});return result;};
      return {get:id=>request(()=>copy(draft.get(name).get(id))),getAll:()=>request(()=>copy([...draft.get(name).values()])),
        put:row=>request(()=>{if(options.failStore===name)throw Error('QuotaExceededError');draft.get(name).set(row.id,copy(row));return row.id;}),
        delete:id=>request(()=>draft.get(name).delete(id))};
    }};
    pending.push(()=>{draft=new Map(names.map(name=>[name,new Map([...(saved.get(name)||[])].map(([id,row])=>[id,copy(row)]))]));
      while(work.length&&!aborted)work.shift()();
      if(aborted){tx.onabort?.();return;}
      if(mode==='readwrite')for(const [name,rows]of draft)saved.set(name,rows);
      tx.oncomplete?.();
    });if(pending.length===1)queueMicrotask(advance);return tx;
  }};
  const context=vm.createContext({db:database,Blob,console,structuredClone,WF_MEDIA_STORE:'media',WF_MEDIA_PERSISTED:new Set(),
    wfStorageWriteError(){},wfDriveOnDatabaseCommit(){backup++;},initDB:async()=>database,wfReconnectDB:async()=>database,
    wfDehydrateClone(value,media){if(value?.testImage){media.set('image',{id:'image',data:value.testImage});return {...value,testImage:'wfmedia:image'};}return copy(value);}});
  context.window=context;
  if(options.linked!==false)context.WFCloudSyncEngine={
    linkedScope:()=>({workspaceId:'w',userId:'owner'}),
    writeStores:names=>[...new Set([...names,'wf_cloud_outbox','wf_cloud_meta'])],
    enqueue(tx,operations,{onError}={}){
      const request=tx.objectStore('wf_cloud_outbox').put({id:'batch',operations:copy(operations)});
      request.onerror=()=>{onError?.(request.error);tx.abort();};
    },afterCommit(){after++;}
  };
  vm.runInContext(extract('wfWriteBatch'),context);
  return {context,seen,get:(name,id)=>copy(saved.get(name)?.get(id)),counts:()=>({after,backup})};
}
test('business rows and outbox commit together using final merged rows and media',async()=>{
  const f=storage({settings:[{id:'main',companyName:'Old',dailyTasks:{kept:true}}]});
  const results=await f.context.wfWriteBatch([
    {store:'settings',id:'main',type:'merge',value:{companyName:'New'},merge:(latest,value)=>({...latest,...value})},
    {store:'products',value:{id:42,name:'Chair',testImage:'data:image/png;base64,QUFB'}}
  ]);
  assert.equal(results[0].companyName,'New');
  assert.equal(f.get('settings','main').dailyTasks.kept,true);
  const queued=f.get('wf_cloud_outbox','batch');
  assert(queued,'a committed write must have a durable outbox entry');
  const setting=queued.operations.find(row=>row.store==='settings');
  assert.deepEqual(setting.value,f.get('settings','main'));
  assert.equal(queued.operations.find(row=>row.store==='products').value.id,42);
  assert.equal(queued.operations.find(row=>row.store==='media').value.data,'data:image/png;base64,QUFB');
  assert.deepEqual(f.counts(),{after:1,backup:1});
});
test('an outbox quota failure rolls back the business write and suppresses success hooks',async()=>{
  const f=storage({products:[{id:'p',name:'Original'}]},{failStore:'wf_cloud_outbox'});
  await assert.rejects(f.context.wfWriteBatch([{store:'products',value:{id:'p',name:'Unsaved'}}]),/QuotaExceededError/);
  assert.equal(f.get('products','p').name,'Original');
  assert.equal(f.get('wf_cloud_outbox','batch'),undefined);
  assert.deepEqual(f.counts(),{after:0,backup:0});
});
test('business transaction failures never enqueue or schedule an upload',async()=>{
  const f=storage({products:[{id:'p',name:'Original'}]},{failStore:'products'});
  await assert.rejects(f.context.wfWriteBatch([{store:'products',value:{id:'p',name:'Unsaved'}}]),/QuotaExceededError/);
  assert.equal(f.get('wf_cloud_outbox','batch'),undefined);assert.equal(f.counts().after,0);
});
test('delete operations retain numeric versus string keys in durable sync',async()=>{
  const f=storage({companies:[{id:7,name:'Numeric'},{id:'7',name:'Text'}]});
  await f.context.wfWriteBatch([{store:'companies',type:'delete',id:7}]);
  assert.equal(f.get('companies',7),undefined);assert.equal(f.get('companies','7').name,'Text');
  const operation=f.get('wf_cloud_outbox','batch').operations[0];
  assert.equal(operation.id,7);assert.equal(operation.kind,'delete');
});
test('an unlinked local workspace keeps its ordinary write transaction',async()=>{
  const f=storage({},{linked:false});await f.context.wfWriteBatch([{store:'companies',value:{id:'c'}}]);
  assert.deepEqual(f.seen,[['companies']]);assert.equal(f.get('companies','c').id,'c');
});
test('full backup replacement is refused while its persistent cloud binding exists',async()=>{
  let validated=0;const context=vm.createContext({WFCloudSyncEngine:{linkedScope:()=>({workspaceId:'w'})},
    wfValidateBackup(){validated++;return true;},S:{lang:'en'},showToast(){}});context.window=context;
  vm.runInContext(extract('wfReplaceStoresFromBackup'),context);
  await assert.rejects(Promise.resolve().then(()=>context.wfReplaceStoresFromBackup({})),error=>error.code==='CLOUD_RESTORE_REQUIRES_RECONCILIATION');
  assert.equal(validated,0,'do not clear any linked data');
});
test('remote database selection refuses unauthenticated access before opening any local database',async()=>{
  const opened=[],context=vm.createContext({setTimeout,clearTimeout,indexedDB:{open(name){opened.push(name);throw Error('unexpected open');}},
    WFCloudClient:{isRemoteMode:()=>true},WFCloud:{cacheName(){throw Object.assign(Error('AUTH_REQUIRED'),{code:'AUTH_REQUIRED'});}}});context.window=context;
  vm.runInContext("let db,WF_DB_OPENING;const DB_NAME='WowFurnitureDB',DB_VER=8,WF_DB_STORES=['settings'];\n"+extract('wfBusinessDBName')+'\n'+extract('initDB'),context);
  await assert.rejects(context.initDB(),/AUTH_REQUIRED/);assert.deepEqual(opened,[]);
});
test('a verified remote session opens only its scoped cache and creates cloud metadata stores',async()=>{
  const opened=[],names=new Set(),created=[],connection={version:8,objectStoreNames:{contains:name=>names.has(name)},
    createObjectStore(name,options){names.add(name);created.push({name,...options});},close(){}};
  const context=vm.createContext({setTimeout,clearTimeout,indexedDB:{open(name){opened.push(name);const request={};queueMicrotask(()=>{request.result=connection;request.onupgradeneeded?.();request.onsuccess?.();});return request;}},
    WFCloudClient:{isRemoteMode:()=>true},WFCloud:{cacheName:()=> 'WowFurnitureRemoteDB_v1_workspace_worker'}});context.window=context;
  const storeDeclaration=html.match(/const WF_DB_STORES=\[[^\n]+/)[0];
  vm.runInContext("let db,WF_DB_OPENING;const DB_NAME='WowFurnitureDB',DB_VER=8;\n"+storeDeclaration+'\n'+extract('wfBusinessDBName')+'\n'+extract('initDB'),Object.assign(context,{WF_MEDIA_STORE:'media'}));
  await context.initDB();assert.deepEqual(opened,['WowFurnitureRemoteDB_v1_workspace_worker']);
  for(const name of ['wf_cloud_outbox','wf_cloud_meta','wf_cloud_conflicts'])assert(created.some(row=>row.name===name&&row.keyPath==='id'));
});
test('cloud startup requires initial authorized pull only for remote workspaces',async()=>{
  for(const remote of [false,true]){
    const calls=[];const engine={async start(options){calls.push(copy(options));if(remote)throw Error('REMOTE_INITIAL_SYNC_REQUIRED');}};
    const context=vm.createContext({initDB:async()=>({}),WFCloudClient:{isRemoteMode:()=>remote},WFCloud:{},
      WFCloudSync:{create:()=>engine},dispatchEvent(){},CustomEvent:class{},wfApplyCloudChanges(){}});context.window=context;
    vm.runInContext('let WF_CLOUD_INITIALIZING=null;\n'+extract('wfInitializeCloudSync'),context);
    if(remote)await assert.rejects(context.wfInitializeCloudSync(),/REMOTE_INITIAL_SYNC_REQUIRED/);else await context.wfInitializeCloudSync();
    assert.deepEqual(calls,[{seedExisting:!remote,initialPull:remote}]);
  }
});
