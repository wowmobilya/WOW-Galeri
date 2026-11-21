'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const source=path.join(__dirname,'../modules/platform/cloud/wow-cloud-sync.js');
const sync=fs.existsSync(source)?require(source):{};
const copy=value=>value==null?value:structuredClone(value);
const key=(store,id)=>JSON.stringify([store,typeof id,id]);

// A serial IndexedDB transaction fixture: writes stay private until completion,
// requests can enqueue further requests, and any abort rolls every store back.
function database(initial={}){
  const rows=new Map(Object.entries(initial).map(([name,values])=>[name,new Map(values.map(value=>[value.id,copy(value)]))]));
  const queued=[];let active=false,failure=null,holdNext=null;
  const names={contains:name=>rows.has(name),[Symbol.iterator]:function*(){yield* rows.keys();}};
  const db={name:'test-business',objectStoreNames:names,createObjectStore(name){rows.set(name,new Map());return {};},
    transaction(names,mode='readonly'){
      names=Array.isArray(names)?names:[names];for(const name of names)if(!rows.has(name))throw Error('missing '+name);
      let draft,pending=[],begun=false,ended=false,scheduled=false;
      const tx={error:null,oncomplete:null,onabort:null,onerror:null,
        abort(){if(ended)return;ended=true;pending=[];setImmediate(()=>{tx.onabort?.();release();});},
        objectStore(name){assert(names.includes(name));
          const request=work=>{if(ended)throw Error('TransactionInactiveError');const req={};pending.push(()=>{try{req.result=work();req.onsuccess?.();}catch(error){req.error=error;tx.error=error;req.onerror?.();tx.onerror?.();tx.abort();}});schedule();return req;};
          return {get:id=>request(()=>copy(draft.get(name).get(id))),getAll:()=>request(()=>copy([...draft.get(name).values()])),
            count:()=>request(()=>draft.get(name).size),clear:()=>request(()=>draft.get(name).clear()),
            put:value=>request(()=>{if(failure===name){failure=null;throw Object.assign(Error('quota'),{name:'QuotaExceededError'});}if(!value||value.id===undefined)throw Error('DataError');draft.get(name).set(value.id,copy(value));return value.id;}),
            delete:id=>request(()=>draft.get(name).delete(id)),
            openKeyCursor(){return this.openCursor();},
            openCursor(){let offset=0,entries;const req={};const advance=()=>{pending.push(()=>{entries??=[...draft.get(name)].sort((a,b)=>String(a[0]).localeCompare(String(b[0])));const entry=entries[offset++];req.result=entry?{key:entry[0],primaryKey:entry[0],value:copy(entry[1]),continue:advance}:null;req.onsuccess?.();});schedule();};advance();return req;}
          };
        }};
      function release(){active=false;startNext();}
      function schedule(){if(!begun||scheduled||ended)return;scheduled=true;setImmediate(()=>{scheduled=false;if(ended)return;if(pending.length){pending.shift()();schedule();return;}ended=true;if(mode==='readwrite')for(const name of names)rows.set(name,draft.get(name));tx.oncomplete?.();release();});}
      queued.push(()=>{const begin=()=>{begun=true;draft=new Map(names.map(name=>[name,new Map([...rows.get(name)].map(([id,row])=>[id,copy(row)]))]));schedule();};if(holdNext){const hold=holdNext;holdNext=null;hold.then(begin);}else begin();});startNext();return tx;
    }};
  function startNext(){if(active||!queued.length)return;active=true;queued.shift()();}
  return {db,rows:name=>copy([...rows.get(name).values()]),get:(name,id)=>copy(rows.get(name).get(id)),failPut:name=>{failure=name;},pauseNextTransaction(){let release;holdNext=new Promise(resolve=>{release=resolve;});return release;}};
}
function server(){
  const rows=new Map(),ledger=[],batches=new Map(),calls=[];let cursor=0,hold=null,rejectNext=null;
  function put(store,id,value,deleted=false){const previous=rows.get(key(store,id)),change={store,id,revision:(previous?.revision||0)+1,deleted,...(deleted?{}:{value:copy(value)})};rows.set(key(store,id),change);ledger.push({...change,changeCursor:++cursor});return change;}
  async function request(action,payload){calls.push({action,payload:copy(payload)});if(rejectNext){const error=rejectNext;rejectNext=null;throw error;}if(hold){const wait=hold;hold=null;await wait;}
    if(action==='sync.push'){
      if(batches.has(payload.batchId))return copy(batches.get(payload.batchId));
      const conflicts=payload.operations.filter(op=>(rows.get(key(op.store,op.id))?.revision||0)!==op.baseRevision).map(op=>({store:op.store,id:op.id,actualRevision:rows.get(key(op.store,op.id))?.revision||0,expectedRevision:op.baseRevision}));
      if(conflicts.length)throw Object.assign(Error('CONFLICT'),{code:'CONFLICT',status:409,conflicts});
      const changes=payload.operations.map(op=>put(op.store,op.id,op.value,op.kind==='delete'));
      const reply={ok:true,batchId:payload.batchId,changes,commitRevision:cursor};batches.set(payload.batchId,copy(reply));return reply;
    }
    if(action==='sync.pull'){const found=ledger.filter(row=>row.changeCursor>payload.cursor).slice(0,payload.limit),next=found.at(-1)?.changeCursor??cursor;return {ok:true,changes:found.map(({changeCursor,...row})=>copy(row)),cursor:next,hasMore:ledger.some(row=>row.changeCursor>next)};}
    if(action==='sync.inspect')return {ok:true,changes:payload.records.map(({store,id})=>copy(rows.get(key(store,id))||{store,id,revision:0,deleted:true}))};
    if(action==='media.upload')return {ok:true,record:{id:payload.id,storagePath:'test/'+payload.id+'/'+payload.data.length,kind:payload.kind,size:payload.size,updatedAt:payload.updatedAt}};
    if(action==='media.download')return {ok:true,url:'https://files.example/'+encodeURIComponent(payload.storagePath),contentType:'image/png'};
    throw Error('unknown action '+action);
  }
  return {request,calls,put,rows,batches,fail:error=>{rejectNext=error;},pause(){let release;hold=new Promise(resolve=>{release=resolve;});return release;}};
}
function harness(initial={},options={}){
  assert.equal(typeof sync.create,'function','cloud sync module must exist');
  const business=database(Object.fromEntries(['companies','products','invoices','payments','settings','media'].map(name=>[name,initial[name]||[]])));sync.upgrade(business.db);
  const remote=server(),listeners=new Set(),scheduled=new Map();let nextTimer=0,visible=true,online=true,clock=10000;
  let identity={mode:options.mode||'local',authenticated:options.authenticated!==false,workspaceId:'workspace-a',userId:'owner-a',role:options.mode==='remote'?'sales':'owner',status:'active',sessionVersion:1};
  const invalidations=[],commits=[];
  const client={getSnapshot:()=>copy(identity),cacheName:()=>business.db.name,isRemote:()=>identity.mode==='remote',isLinkedOwner:()=>identity.mode==='local',subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},request:remote.request,invalidateSession(reason){invalidations.push(reason);identity.authenticated=false;for(const fn of listeners)fn(copy(identity));}};
  const engine=sync.create({getDB:async()=>business.db,client,crypto:webcrypto,now:()=>clock,isOnline:()=>online,isVisible:()=>visible,
    setTimeout(fn,ms){const id=++nextTimer;scheduled.set(id,{fn,ms});return id;},clearTimeout:id=>scheduled.delete(id),onRemoteCommit:event=>commits.push(event),fetch:options.fetch||(async()=>({ok:true,blob:async()=>new Blob([new Uint8Array([1,2,3])],{type:'image/png'})}))});
  return {...business,engine,remote,client,invalidations,commits,scheduled,advance:ms=>{clock+=ms;},
    setIdentity(patch){Object.assign(identity,patch);for(const fn of listeners)fn(copy(identity));},setVisible:value=>{visible=value;},setOnline:value=>{online=value;}};
}
async function localBatch(h,operations,{abort=false,origin}={}){
  return new Promise((resolve,reject)=>{
    const names=h.engine.writeStores([...new Set(operations.map(op=>op.store))]);const tx=h.db.transaction(names,'readwrite');let error;
    tx.oncomplete=()=>resolve();tx.onabort=()=>reject(error||tx.error||Error('aborted'));let remaining=operations.length;
    for(const op of operations){const request=op.kind==='delete'?tx.objectStore(op.store).delete(op.id):tx.objectStore(op.store).put(op.value);request.onsuccess=()=>{if(--remaining)return;h.engine.enqueue(tx,operations,{origin,onError:cause=>{error=cause;},onQueued(){if(abort)tx.abort();}});};}
  });
}
const record=(store,id,value)=>({store,id,kind:'put',value:{id,...value}});

test('outbox enqueue shares the business transaction and both roll back on failure',async()=>{
  const h=harness();await h.engine.start({seedExisting:false});
  h.failPut(sync.STORES[0]);await assert.rejects(localBatch(h,[record('products',1,{name:'Table'})]));
  assert.equal(h.get('products',1),undefined);assert.equal(h.rows(sync.STORES[0]).length,0);
  await localBatch(h,[record('products',1,{name:'Table'})]);assert.equal(h.rows(sync.STORES[0]).length,1);
  await assert.rejects(localBatch(h,[record('products',2,{name:'Chair'})],{abort:true}));assert.equal(h.get('products',2),undefined);
});

test('numeric and string ids stay distinct, with chained revisions across offline batches',async()=>{
  const h=harness();await h.engine.start({seedExisting:false});
  await localBatch(h,[record('products',7,{name:'Numeric'}),record('products','7',{name:'String'})]);
  await localBatch(h,[record('products',7,{name:'Updated'})]);await h.engine.syncNow();
  const pushes=h.remote.calls.filter(row=>row.action==='sync.push');assert.equal(pushes.length,2);
  assert.deepEqual(pushes[0].payload.operations.map(op=>[typeof op.id,op.baseRevision]),[['number',0],['string',0]]);
  assert.equal(pushes[1].payload.operations[0].baseRevision,1);
  assert.equal(h.remote.rows.get(key('products',7)).value.name,'Updated');assert.equal(h.remote.rows.get(key('products','7')).value.name,'String');
  assert.equal(h.rows(sync.STORES[0]).length,0);
});

test('whole-batch conflicts retain local edits and all pending operations without partial remote writes',async()=>{
  const h=harness();await h.engine.start({seedExisting:false});h.remote.put('products','p',{id:'p',name:'Remote'});
  await localBatch(h,[record('products','p',{name:'Local'}),record('companies','c',{name:'Customer'})]);await h.engine.syncNow();
  assert.equal(h.get('products','p').name,'Local');assert.equal(h.get('companies','c').name,'Customer');
  assert.equal(h.remote.rows.has(key('companies','c')),false);assert.equal(h.rows(sync.STORES[0]).length,1);
  assert(h.rows(sync.STORES[2]).length>0);assert.equal(h.engine.getSnapshot().connection,'conflict');
});

test('pull does not overwrite a local edit committed while the request is in flight',async()=>{
  const h=harness();await h.engine.start({seedExisting:false});h.remote.put('products','p',{id:'p',name:'Remote'});
  const release=h.remote.pause(),running=h.engine.syncNow();while(!h.remote.calls.length)await new Promise(resolve=>setImmediate(resolve));
  await localBatch(h,[record('products','p',{name:'Local'})]);release();await running;
  assert.equal(h.get('products','p').name,'Local');assert.equal(h.rows(sync.STORES[0]).length,1);
  assert(h.rows(sync.STORES[2]).some(row=>row.reason==='REMOTE_CHANGE'));
});

test('tombstones retain revisions and retries use the same batch id after a lost response',async()=>{
  const h=harness();await h.engine.start({seedExisting:false});await localBatch(h,[record('products','p',{name:'Table'})]);
  const original=h.client.request;let lost=true;h.client.request=async(action,payload,options)=>{const reply=await original(action,payload,options);if(action==='sync.push'&&lost){lost=false;throw Object.assign(Error('connection lost'),{code:'NETWORK_ERROR'});}return reply;};
  await h.engine.syncNow();const batch=h.rows(sync.STORES[0])[0];assert(batch);await h.engine.syncNow();
  const pushes=h.remote.calls.filter(row=>row.action==='sync.push');assert.equal(pushes[0].payload.batchId,pushes[1].payload.batchId);assert.equal(h.remote.rows.get(key('products','p')).revision,1);
  h.remote.put('products','p',null,true);await h.engine.syncNow();assert.equal(h.get('products','p'),undefined);
  await localBatch(h,[record('products','p',{name:'Recreated'})]);await h.engine.syncNow();assert.equal(h.remote.rows.get(key('products','p')).revision,3);
});

test('verified owner bootstrap queues all six stores before pulling remote data',async()=>{
  const initial={companies:[{id:'c',name:'Company'}],products:[{id:'p',image:'wfmedia:m'}],invoices:[{id:1}],payments:[{id:2}],settings:[{id:'main',companyName:'WOW'}],media:[{id:'m',data:'data:image/png;base64,AQID',kind:'image',size:3}]};
  const h=harness(initial);await h.engine.start({seedExisting:true});
  assert(h.rows(sync.STORES[0]).length>0);await h.engine.syncNow();
  assert.deepEqual([...new Set(h.remote.calls.filter(row=>row.action==='sync.push').flatMap(row=>row.payload.operations.map(op=>op.store)))].sort(),Object.keys(initial).sort());
  assert.equal(h.remote.calls.find(row=>row.action==='media.upload').payload.data,initial.media[0].data);
  assert.equal(h.get('media','m').data,initial.media[0].data);
  await h.engine.start({seedExisting:true});assert.equal(h.rows(sync.STORES[0]).length,0);
});

test('media Blobs are uploaded explicitly and projected media pulls hydrate local image bytes',async()=>{
  const h=harness();await h.engine.start({seedExisting:false});
  await localBatch(h,[record('media','m',{data:new Blob([new Uint8Array([1,2,3])],{type:'image/png'}),kind:'image',size:3})]);await h.engine.syncNow();
  assert.equal(h.remote.calls.find(row=>row.action==='media.upload').payload.data,'data:image/png;base64,AQID');
  const pushed=h.remote.calls.find(row=>row.action==='sync.push').payload.operations[0].value;assert.equal(pushed.data,undefined);assert(pushed.storagePath);
  h.remote.put('media','other',{id:'other',storagePath:'work/media/hash.png',kind:'image',size:3});await h.engine.syncNow();
  assert.equal(h.get('media','other').data,'data:image/png;base64,AQID');
});

test('owner auth loss keeps atomic capture bound to the original workspace and never sends to another',async()=>{
  const h=harness();await h.engine.start({seedExisting:false});h.setIdentity({authenticated:false});
  await localBatch(h,[record('products','p',{name:'Offline'})]);await h.engine.syncNow();assert.equal(h.remote.calls.length,0);assert.equal(h.rows(sync.STORES[0]).length,1);
  h.setIdentity({authenticated:true,workspaceId:'other'});await h.engine.syncNow();assert.equal(h.remote.calls.length,0);assert.equal(h.engine.linkedScope().workspaceId,'workspace-a');
  h.setIdentity({workspaceId:'workspace-a'});await h.engine.syncNow();assert.equal(h.rows(sync.STORES[0]).length,0);
});

test('remote authorization loss locks the remote session and retains pending work',async()=>{
  const h=harness({}, {mode:'remote'});await h.engine.start({seedExisting:false});await localBatch(h,[record('products','p',{name:'Worker edit'})]);
  h.remote.fail(Object.assign(Error('revoked'),{code:'SESSION_REVOKED',status:401}));await h.engine.syncNow();
  assert.equal(h.invalidations.length,1);assert.equal(h.rows(sync.STORES[0]).length,1);assert.equal(h.engine.getSnapshot().connection,'auth-required');
  await assert.rejects(h.engine.start({seedExisting:true}),{code:'REMOTE_SEED_FORBIDDEN'});
});

test('runner is single flight, pauses offline/hidden, and keeps only one timer',async()=>{
  const h=harness();await h.engine.start({seedExisting:false});h.setOnline(false);await h.engine.syncNow();assert.equal(h.remote.calls.length,0);
  h.setOnline(true);h.setVisible(false);await h.engine.syncNow();assert.equal(h.remote.calls.length,0);
  h.setVisible(true);const release=h.remote.pause();const first=h.engine.syncNow(),second=h.engine.syncNow();while(!h.remote.calls.length)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.remote.calls.length,1);release();await Promise.all([first,second]);
  h.engine.afterCommit();h.engine.afterCommit();assert(h.scheduled.size<=1);h.engine.stop();assert.equal(h.scheduled.size,0);
});

test('multiple operations on one typed record enqueue only its final transaction value',async()=>{
  const h=harness();await h.engine.start({seedExisting:false});
  await localBatch(h,[record('products',1,{name:'First'}),record('products',1,{name:'Final'}),record('products','1',{name:'String'})]);
  await h.engine.syncNow();const ops=h.remote.calls.find(row=>row.action==='sync.push').payload.operations;
  assert.equal(ops.length,2);assert.equal(ops.find(op=>op.id===1).value.name,'Final');assert.equal(ops.find(op=>op.id==='1').value.name,'String');
});

test('an acknowledged older write cannot overwrite a newer queued local edit',async()=>{
  const h=harness();await h.engine.start({seedExisting:false});await localBatch(h,[record('products','p',{name:'Old'})]);
  const release=h.remote.pause(),running=h.engine.syncNow();while(!h.remote.calls.length)await new Promise(resolve=>setImmediate(resolve));
  await localBatch(h,[record('products','p',{name:'New'})]);release();await running;
  assert.equal(h.get('products','p').name,'New');assert.equal(h.remote.rows.get(key('products','p')).value.name,'New');
});

test('a restarted owner engine loads the durable binding without an authenticated network session',async()=>{
  const h=harness();await h.engine.start({seedExisting:false});h.engine.stop();h.setIdentity({authenticated:false});
  h.engine=sync.create({getDB:async()=>h.db,client:h.client,crypto:webcrypto,setTimeout:()=>1,clearTimeout(){}});
  await h.engine.start({seedExisting:false});await localBatch(h,[record('products','offline',{name:'Retained'})]);
  assert.equal(h.engine.linkedScope().workspaceId,'workspace-a');assert.equal(h.rows(sync.STORES[0]).length,1);assert.equal(h.remote.calls.length,0);
  h.engine.stop();
});

test('explicit keep-local resolution rebases dependent batches against fresh revisions and preserves history',async()=>{
  const h=harness();await h.engine.start({seedExisting:false});h.remote.put('products','p',{id:'p',name:'Server'});
  await localBatch(h,[record('products','p',{name:'Local one'}),record('invoices','invoice-77',{invNo:'WOW-77'})]);
  await localBatch(h,[record('products','p',{name:'Local two'})]);await h.engine.syncNow();
  const first=h.rows(sync.STORES[0])[0],second=h.rows(sync.STORES[0])[1];
  await h.engine.resolveConflict(first.batchId,{strategy:'local'});
  const rebased=h.rows(sync.STORES[0]);assert.equal(rebased.length,1);assert.notEqual(rebased[0].batchId,first.batchId);assert.notEqual(rebased[0].batchId,second.batchId);
  assert.equal(rebased[0].operations.find(row=>row.store==='products').baseRevision,1);assert.equal(rebased[0].operations.find(row=>row.store==='products').value.name,'Local two');
  assert(h.rows(sync.STORES[2]).some(row=>row.resolved&&row.originalBatches.length===2));
  await h.engine.syncNow();assert.equal(h.remote.rows.get(key('products','p')).value.name,'Local two');
  assert.equal(h.remote.rows.get(key('invoices','invoice-77')).value.invNo,'WOW-77');assert.equal(h.engine.getSnapshot().conflicts,0);
});

test('explicit server resolution preserves discarded batches and keeps unrelated work queued',async()=>{
  const h=harness();await h.engine.start({seedExisting:false});h.remote.put('products','p',{id:'p',name:'Server'});
  await localBatch(h,[record('products','p',{name:'Local'}),record('invoices','new-invoice',{invNo:'X-2'})]);
  await localBatch(h,[record('products','p',{name:'Local newer'})]);await localBatch(h,[record('companies','independent',{name:'Untouched'})]);await h.engine.syncNow();
  const first=h.rows(sync.STORES[0])[0];await h.engine.resolveConflict(first.batchId,{strategy:'server'});
  assert.equal(h.get('products','p').name,'Server');assert.equal(h.get('invoices','new-invoice'),undefined);assert.equal(h.get('companies','independent').name,'Untouched');
  assert.equal(h.rows(sync.STORES[0]).length,1);const saved=await h.engine.exportConflict(first.batchId);
  assert.equal(saved.batches.length,2);assert.equal(saved.batches[0].operations.find(row=>row.store==='invoices').value.invNo,'X-2');
  await h.engine.syncNow();assert(h.remote.rows.has(key('companies','independent')));
});

test('conflict resolution refuses stale verification if a local edit arrived during server inspection',async()=>{
  const h=harness();await h.engine.start({seedExisting:false});h.remote.put('products','p',{id:'p',name:'Server'});await localBatch(h,[record('products','p',{name:'Local'})]);await h.engine.syncNow();
  const batch=h.rows(sync.STORES[0])[0],oldCalls=h.remote.calls.length,release=h.remote.pause();
  const resolving=h.engine.resolveConflict(batch.batchId,{strategy:'server'});while(h.remote.calls.length===oldCalls)await new Promise(resolve=>setImmediate(resolve));
  await localBatch(h,[record('products','p',{name:'New edit'})]);release();
  await assert.rejects(resolving,{code:'SYNC_QUEUE_CHANGED'});assert.equal(h.get('products','p').name,'New edit');assert.equal(h.rows(sync.STORES[0]).length,2);
});

test('workers cannot choose conflict overwrite resolutions',async()=>{
  const h=harness({}, {mode:'remote'});await h.engine.start({seedExisting:false});
  await assert.rejects(h.engine.resolveConflict('unknown',{strategy:'local'}),{code:'OWNER_REQUIRED'});
});

test('a shared IndexedDB lease prevents duplicate runners across two page instances',async()=>{
  const h=harness();await h.engine.start({seedExisting:false});
  const second=sync.create({getDB:async()=>h.db,client:h.client,crypto:webcrypto,now:()=>10000,setTimeout:()=>1,clearTimeout(){}});
  await second.start({seedExisting:false});const release=h.remote.pause(),first=h.engine.syncNow();
  while(!h.remote.calls.length)await new Promise(resolve=>setImmediate(resolve));
  await second.syncNow();assert.equal(h.remote.calls.length,1);release();await first;second.stop();
});

test('push acknowledgements never advance the independent paginated pull cursor',async()=>{
  const h=harness();await h.engine.start({seedExisting:false});
  for(let id=1;id<=120;id++)h.remote.put('products',id,{id,name:'Server '+id});
  await localBatch(h,[record('products','local',{name:'Local'})]);await h.engine.syncNow();
  const pulls=h.remote.calls.filter(row=>row.action==='sync.pull');assert.equal(pulls[0].payload.cursor,0);assert.equal(pulls.length,2);
  assert.equal(h.rows('products').length,121);assert.equal(h.get('products',1).name,'Server 1');
});

test('a media revision mismatch does not advance pull or cache bytes under the wrong revision',async()=>{
  const h=harness();await h.engine.start({seedExisting:false});h.remote.put('media','m',{id:'m',storagePath:'old/path.png',kind:'image',size:3});
  const original=h.client.request;let mismatch=true;h.client.request=async(action,payload,options)=>{if(action==='media.download'&&mismatch){mismatch=false;throw Object.assign(Error('changed'),{code:'MEDIA_REVISION_MISMATCH',status:409});}return original(action,payload,options);};
  await h.engine.syncNow();assert.equal(h.get('media','m'),undefined);assert.equal(h.engine.getSnapshot().lastSyncAt,null);
  h.remote.put('media','m',{id:'m',storagePath:'new/path.png',kind:'image',size:3});await h.engine.syncNow();
  assert.equal(h.get('media','m').storagePath,'new/path.png');assert.equal(h.get('media','m').data,'data:image/png;base64,AQID');
});

test('remote sessions cannot attach the sync engine to an unscoped owner database',async()=>{
  const h=harness({products:[{id:'private',cost:500}]},{mode:'remote'});h.client.cacheName=()=> 'verified-worker-cache';
  await assert.rejects(h.engine.start({seedExisting:false}),{code:'REMOTE_DATABASE_SCOPE_MISMATCH'});
  assert.equal(h.get('products','private').cost,500);assert.equal(h.rows(sync.STORES[0]).length,0);assert.equal(h.remote.calls.length,0);
});

test('deterministically unsupported binary values remain visible as blocked work rather than retrying silently',async()=>{
  const h=harness();await h.engine.start({seedExisting:false});await localBatch(h,[record('products','p',{customBinary:new Blob(['private bytes'])})]);
  await h.engine.syncNow();const batch=h.rows(sync.STORES[0])[0];assert.equal(batch.status,'conflict');assert.equal(batch.error,'UNSUPPORTED_MEDIA');
  const count=h.remote.calls.filter(row=>row.action==='sync.push').length;await h.engine.syncNow();assert.equal(h.remote.calls.filter(row=>row.action==='sync.push').length,count);
  const exported=await h.engine.exportConflict(batch.batchId);const binary=exported.batches[0].operations[0].value.customBinary;
  assert.equal(binary.__wowType,'Blob');assert.equal(binary.data,'data:application/octet-stream;base64,cHJpdmF0ZSBieXRlcw==');
});

test('signing out during an image download cancels applying its pending pull',async()=>{
  let entered,release;const started=new Promise(resolve=>{entered=resolve;}),hold=new Promise(resolve=>{release=resolve;});
  const h=harness({}, {mode:'remote',fetch:async()=>{entered();await hold;return {ok:true,blob:async()=>new Blob(['image'],{type:'image/png'})};}});
  await h.engine.start({seedExisting:false});h.remote.put('media','m',{id:'m',storagePath:'path.png',kind:'image',size:5});
  const running=h.engine.syncNow();await started;h.setIdentity({authenticated:false});release();await running;
  assert.equal(h.get('media','m'),undefined);assert.equal(h.engine.getSnapshot().connection,'auth-required');
});

test('duplicate invoice validation stays blocked and an explicit retry uses the owner correction without renumbering',async()=>{
  const h=harness();await h.engine.start({seedExisting:false});await localBatch(h,[record('invoices','i',{invNo:'DUP-1'})]);
  h.remote.fail(Object.assign(Error('duplicate number'),{code:'DUPLICATE_INVOICE_NUMBER',status:409}));await h.engine.syncNow();
  const blocked=h.rows(sync.STORES[0])[0];assert.equal(blocked.status,'conflict');
  await localBatch(h,[record('invoices','i',{invNo:'CHOSEN-2'})]);await h.engine.resolveConflict(blocked.batchId,{strategy:'local'});await h.engine.syncNow();
  assert.equal(h.remote.rows.get(key('invoices','i')).value.invNo,'CHOSEN-2');assert.equal(h.rows(sync.STORES[0]).length,0);
  assert.equal((await h.engine.exportConflict(blocked.batchId)).batches[0].operations[0].value.invNo,'DUP-1');
});

test('owner verification during initial local database loading still attaches and seeds after loading completes',async()=>{
  const h=harness({products:[{id:'p',name:'Existing'}]},{authenticated:false}),release=h.pauseNextTransaction();
  const starting=h.engine.start({seedExisting:true});await new Promise(resolve=>setImmediate(resolve));
  h.setIdentity({authenticated:true});release();await starting;
  for(let i=0;i<20&&!h.engine.linkedScope();i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.engine.linkedScope()?.workspaceId,'workspace-a');
  // Wait for the same idempotent local startup to finish any seed transaction.
  await h.engine.start({seedExisting:true});assert(h.rows(sync.STORES[0]).length>0);
});

test('local startup with another cloud account stays usable and retains the original scoped outbox',async()=>{
  const h=harness();await h.engine.start({seedExisting:false});h.setIdentity({workspaceId:'other-workspace'});
  await h.engine.start({seedExisting:true});await localBatch(h,[record('products','p',{name:'Local retained'})]);
  assert.equal(h.engine.getSnapshot().connection,'scope-mismatch');assert.equal(h.engine.linkedScope().workspaceId,'workspace-a');
  await h.engine.syncNow();assert.equal(h.remote.calls.length,0);assert.equal(h.rows(sync.STORES[0]).length,1);
});

test('a failed owner bootstrap blocks network pulls until legacy records are safely queued',async()=>{
  const h=harness({products:[{id:'p',name:'Existing owner data'}]});h.remote.put('products','p',{id:'p',name:'Other remote data'});h.failPut(sync.STORES[0]);
  await assert.rejects(h.engine.start({seedExisting:true}));assert.equal(h.get('products','p').name,'Existing owner data');
  h.setIdentity({authenticated:true});await h.engine.syncNow();assert.equal(h.remote.calls.length,0);assert.equal(h.get('products','p').name,'Existing owner data');
  await h.engine.start({seedExisting:true});await h.engine.syncNow();assert.equal(h.get('products','p').name,'Existing owner data');assert.equal(h.engine.getSnapshot().connection,'conflict');
});

test('a changed employee permission version reloads old records from zero, removes broader fields and quarantines unsent work',async()=>{
  const h=harness({}, {mode:'remote'}),request=h.client.request;
  h.remote.put('products','p',{id:'p',name:'Desk',unitCost:30});
  h.remote.put('payments','pay',{id:'pay',amount:90});
  h.client.request=async(action,payload,options)=>{
    const version=h.client.getSnapshot().sessionVersion,reply=await request(action,payload,options);
    if(action==='sync.pull'&&version!==2){
      reply.changes=reply.changes.filter(change=>change.store!=='payments');
      for(const change of reply.changes)if(change.value)delete change.value.unitCost;
    }
    return reply;
  };
  await h.engine.start({initialPull:true});
  assert.deepEqual(h.get('products','p'),{id:'p',name:'Desk'});assert.equal(h.get('payments','pay'),undefined);
  await localBatch(h,[record('products','offline',{name:'Unsent edit'})]);
  const oldBatch=h.rows(sync.STORES[0])[0];h.engine.stop();h.setIdentity({sessionVersion:2});
  await h.engine.start({initialPull:true});
  assert.equal(h.get('products','p').unitCost,30);assert.equal(h.get('payments','pay').amount,90);
  assert.equal(h.get('products','offline'),undefined);assert.equal(h.remote.rows.has(key('products','offline')),false);
  assert.equal(h.engine.getSnapshot().pending,0);assert.equal(h.engine.getSnapshot().quarantined,1);
  assert.deepEqual(h.rows(sync.STORES[2]).find(row=>row.reason==='PERMISSIONS_CHANGED').original,oldBatch);
  assert.deepEqual(await h.engine.listConflicts(),[]);await assert.rejects(h.engine.exportConflict(oldBatch.batchId),{code:'CONFLICT_NOT_FOUND'});
  h.engine.stop();h.setIdentity({sessionVersion:3});await h.engine.start({initialPull:true});
  assert.deepEqual(h.get('products','p'),{id:'p',name:'Desk'});assert.equal(h.get('payments','pay'),undefined);
  assert.equal(h.engine.getSnapshot().quarantined,1);assert.equal(h.engine.linkedScope().sessionVersion,3);
  assert.deepEqual(h.remote.calls.filter(call=>call.action==='sync.pull').map(call=>call.payload.cursor),[0,0,0]);
  await localBatch(h,[record('products','new',{name:'New permission version'})]);await h.engine.syncNow();
  assert.deepEqual(h.remote.calls.filter(call=>call.action==='sync.push').map(call=>call.payload.operations[0].id),['new']);
});

test('upgrading an employee database without a stored permission version is atomic and preserves the original pending batch',async()=>{
  const h=harness({payments:[{id:'old',amount:250}]},{mode:'remote'}),[outbox,meta,conflicts]=sync.STORES;
  const scope=JSON.stringify(['remote','workspace-a','owner-a']);
  const binding={id:'binding',schemaVersion:1,mode:'remote',workspaceId:'workspace-a',userId:'owner-a',scope,deviceId:'legacy'};
  const pending={id:'batch:1',batchId:'legacy-edit',scope,deviceId:'legacy',status:'pending',operations:[{store:'payments',id:'old',kind:'put',value:{id:'old',amount:250},baseRevision:0}]};
  await new Promise((resolve,reject)=>{
    const tx=h.db.transaction([outbox,meta],'readwrite');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
    tx.objectStore(meta).put(binding);tx.objectStore(meta).put({id:'scope:'+scope,scope,cursor:70,nextOrdinal:2});tx.objectStore(outbox).put(pending);
  });
  h.failPut(conflicts);await assert.rejects(h.engine.start({initialPull:true}));
  assert.deepEqual(h.get(meta,'binding'),binding);assert.deepEqual(h.get(outbox,pending.id),pending);assert.equal(h.get('payments','old').amount,250);assert.equal(h.remote.calls.length,0);
  await h.engine.start({initialPull:true});
  assert.equal(h.get('payments','old'),undefined);assert.equal(h.get(meta,'scope:'+scope),undefined);
  assert.deepEqual(h.rows(conflicts)[0].original,pending);assert.equal(h.rows(outbox).length,0);
  assert.deepEqual(h.remote.calls.map(call=>[call.action,call.payload.cursor]),[['sync.pull',0]]);
});

test('a stale tab cannot restore a broader projected response, enqueue an edit or downgrade the saved binding',async()=>{
  const h=harness({}, {mode:'remote'});
  await h.engine.start({initialPull:true});h.remote.put('payments','bill',{id:'bill',amount:70});
  const before=h.remote.calls.length,release=h.remote.pause(),oldRun=h.engine.syncNow();
  while(h.remote.calls.length===before)await new Promise(resolve=>setImmediate(resolve));
  const freshClient={...h.client,getSnapshot:()=>({...h.client.getSnapshot(),authenticated:true,sessionVersion:2}),
    subscribe:()=>()=>{},request:async(action,payload)=>{
      const reply=await h.remote.request(action,payload);
      if(action==='sync.pull')reply.changes=reply.changes.filter(change=>change.store!=='payments');
      return reply;
    }};
  const fresh=sync.create({getDB:async()=>h.db,client:freshClient,crypto:webcrypto,setTimeout:()=>1,clearTimeout(){}});
  await fresh.start({initialPull:true});release();await oldRun;
  assert.equal(h.get('payments','bill'),undefined);assert.deepEqual(h.invalidations,['SESSION_REVOKED']);
  h.setIdentity({authenticated:true});await assert.rejects(localBatch(h,[record('payments','stale',{amount:1})]),{code:'SESSION_REVOKED'});
  assert.equal(h.get('payments','stale'),undefined);await assert.rejects(h.engine.start(),{code:'SESSION_REVOKED'});
  assert.equal(h.get(sync.STORES[1],'binding').sessionVersion,2);fresh.stop();h.engine.stop();
});

test('owner bootstraps and restores retain their origin through retries, while worker edits can only be live',async()=>{
  const h=harness({products:[{id:'p',name:'Existing'}]});await h.engine.start({seedExisting:true});
  await localBatch(h,[record('companies','restored',{name:'Restore'})],{origin:'restore'});
  await localBatch(h,[record('products','new',{name:'Live'})]);
  assert.deepEqual(h.rows(sync.STORES[0]).map(row=>row.origin),['bootstrap','restore','live']);
  const original=h.client.request;let drop=true;
  h.client.request=async(action,payload,options)=>{
    const reply=await original(action,payload,options);
    if(drop&&action==='sync.push'){drop=false;throw Object.assign(Error('lost acknowledgement'),{code:'NETWORK'});}return reply;
  };
  await h.engine.syncNow();await h.engine.syncNow();
  const pushes=h.remote.calls.filter(call=>call.action==='sync.push').map(call=>call.payload);
  assert.deepEqual(pushes.map(batch=>batch.origin),['bootstrap','bootstrap','restore','live']);assert.deepEqual(pushes[0],pushes[1]);
  const worker=harness({}, {mode:'remote'});await worker.engine.start();
  for(const origin of ['bootstrap','restore'])await assert.rejects(localBatch(worker,[record('products','p',{name:'Uncommitted'})],{origin}),{code:'INVALID_SYNC_ORIGIN'});
  assert.equal(worker.get('products','p'),undefined);assert.equal(worker.rows(sync.STORES[0]).length,0);
  await localBatch(worker,[record('products','p',{name:'Worker edit'})]);await worker.engine.syncNow();
  assert.equal(worker.remote.calls.find(call=>call.action==='sync.push').payload.origin,'live');
});

test('a live owner correction stays live when it resolves a bootstrap conflict, including after an owner session version change',async()=>{
  const h=harness({products:[{id:'p',name:'Bootstrap'}]});
  h.remote.put('products','p',{id:'p',name:'Server'});await h.engine.start({seedExisting:true});
  await localBatch(h,[record('products','p',{name:'Owner correction'})]);
  const binding=h.engine.linkedScope().scopeKey;h.setIdentity({sessionVersion:2});await h.engine.start();
  assert.equal(h.engine.linkedScope().scopeKey,binding);assert.equal(h.engine.getSnapshot().quarantined,0);
  await h.engine.syncNow();const held=h.rows(sync.STORES[0])[0];await h.engine.resolveConflict(held.batchId,{strategy:'local'});
  await h.engine.syncNow();assert.equal(h.remote.calls.filter(call=>call.action==='sync.push').at(-1).payload.origin,'live');
  assert.equal(h.remote.rows.get(key('products','p')).value.name,'Owner correction');
});

test('a delayed sync authorization failure cannot revoke a newer login for the same employee and permissions',async()=>{
  const h=harness({}, {mode:'remote'});h.setIdentity({authGeneration:1});await h.engine.start();
  const request=h.client.request;let arrived,release;
  const pending=new Promise(resolve=>{arrived=resolve;}),hold=new Promise(resolve=>{release=resolve;});
  h.client.request=async()=>{arrived();await hold;throw Object.assign(Error('Old login expired'),{code:'SESSION_REVOKED',status:401});};
  const running=h.engine.syncNow();await pending;
  h.setIdentity({authGeneration:2});h.client.request=request;release();await running;
  assert.equal(h.client.getSnapshot().authenticated,true);assert.deepEqual(h.invalidations,[]);
  await h.engine.syncNow();assert.equal(h.engine.getSnapshot().connection,'idle');
});
