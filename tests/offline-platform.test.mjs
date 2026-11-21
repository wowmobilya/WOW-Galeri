import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {projectDelta} from '../supabase/functions/wow-cloud/modules/delta.mjs';
import {createFilesActions} from '../supabase/functions/wow-cloud/modules/files.mjs';
import {createProviderTestDatabase} from '../supabase/testing/provider-fixtures.mjs';
const require=createRequire(import.meta.url),Store=require('../modules/platform/offline/store.js'),Transport=require('../modules/platform/offline/transport.js');
const uu=randomUUID;
const pause=()=>{let release;const promise=new Promise(r=>{release=r;});return {promise,release};};
const network=()=>Object.assign(Error('NETWORK'),{code:'NETWORK',status:0});
const defaultId=()=>({owner:'owner-A/workspace-A/local-A',scope:'principal-epoch-1',runtime:'run-1',cloudVersion:1,localVersion:1,verifiedAt:1000});
function harness(options={}) {
  const clock=options.clock||{ms:2000},factory=options.factory||new IDBFactory(),timers=new Map(),calls=[];
  let count=0,id=options.id||defaultId(),online=options.online??true,visible=true;
  let allowed=()=>true,handler=options.remote||(()=>({ok:true})),persistCalls=0;
  const store=options.store||Store.create({indexedDB:factory,now:()=>clock.ms,limits:options.limits,uuid:uu});
  const manager={estimate:async()=>({quota:options.quota??8*1024**3}),persisted:async()=>false,persist:async()=>{persistCalls++;return true;}};
  const engine=Transport.create({identity:()=>id,can:p=>allowed(p),remote:async(action,p,guard)=>{
    guard();calls.push({action,p:structuredClone(p)});return handler(action,p);
  },store,crypto:webcrypto,storageManager:manager,channel:null,now:()=>clock.ms,random:()=>0.5,isOnline:()=>online,isVisible:()=>visible,
  setTimeout(fn,ms){timers.set(++count,{fn,ms});return count;},clearTimeout:key=>timers.delete(key),
  verifySession:async()=>{id={...id,verifiedAt:++clock.ms};}});
  engine.start();
  return {factory,engine,store,calls,clock,timers,view:route=>engine.view(route),setOnline(v){online=v;engine.resumed();},hide(v){visible=!v;engine.resumed();},
    advance(n){clock.ms+=n;},setId(next){id=next;engine.update();},setAllowed(fn){allowed=fn;},remote(fn){handler=fn;},persistCalls:()=>persistCalls};
}
async function rows(store,name) {
  const db=await store.open();
  return new Promise((resolve,reject)=>{const req=db.transaction(name).objectStore(name).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
}

test('coalesced reads use normalized query scope, bounded freshness, authorized delta hydration and full recovery',async()=>{
  const h=harness(),api=h.view('chat.view'),roomId=uu(),other=uu(),hold=pause();
  let feed={messages:[{id:'1',text:'one'}],more:false,prefs:{},typing:[]},staleOnce=false;
  h.remote(async(action,p)=>{assert.equal(action,'chat.feed');await hold.promise;
    if (p._known && staleOnce){staleOnce=false;return {_delta:{base:'invalid',field:'messages',unchanged:true}};}
    return projectDelta(feed,'messages',p._known);});
  const a=api.request('chat.feed',{roomId}),b=api.request('chat.feed',{mentioned:false,query:'',roomId});hold.release();
  const result=await Promise.all([a,b]);assert.equal(h.calls.length,1);assert(result.every(r=>r._sync.source==='server'));
  assert.equal((await api.request('chat.feed',{roomId}))._sync.stale,false);assert.equal(h.calls.length,1);
  feed.messages=[{id:'9',text:'new'}];h.advance(5000);
  const changed=await api.request('chat.feed',{roomId});assert.deepEqual(changed.messages,feed.messages);
  assert.match(h.calls.at(-1).p._known.revision,/^[a-f0-9]{64}$/);
  staleOnce=true;await api.request('chat.feed',{roomId},{refresh:true});assert.equal(h.calls.length,4);assert.equal(h.calls.at(-1).p._known,undefined);
  h.setOnline(false);const saved=await api.request('chat.feed',{roomId});
  assert.equal(saved._sync.source,'device');assert.equal(saved._sync.stale,true);assert.deepEqual(saved.messages,feed.messages);
  await assert.rejects(api.request('chat.feed',{roomId:other}),{code:'OFFLINE_NOT_CACHED'});
  await assert.rejects(api.request('chat.feed',{roomId,query:'different'}),{code:'OFFLINE_NOT_CACHED'});
  h.engine.dispose();
});

test('private responses and expiring messages stay out of storage; signed endpoints and assistant requests are live only',async()=>{
  const h=harness(),api=h.view('chat.view'),roomId=uu(),url='https://private.invalid/storage/v1/object/sign/name?token=sensitive';
  h.remote((a,p)=>a==='chat.feed'?{messages:[{id:'1',text:'kept',reply:{text:'ephemeral quote',expiresAt:'2030-01-01'}},
    {id:'2',text:'disappearing',expiresAt:'2030-01-01'}],typing:[{person:'Typing now'}]}:a==='chat.members'?{members:[],extra:{access_token:'sensitive credential'}}:
    a==='chat.rooms'?{rooms:[{id:roomId,last:{text:'preview secret',expiresAt:'2030-01-01'}}]}:{url});
  await api.request('chat.feed',{roomId});await api.request('chat.rooms');await api.request('chat.members',{roomId});
  for(const action of ['chat.asset','chat.people','assistant.ask','assistant.history']) {
    await api.request(action,{});await api.request(action,{});
    assert.equal(h.calls.filter(call=>call.action===action).length,2);
  }
  h.setOnline(false);
  assert.deepEqual((await api.request('chat.feed',{roomId})).messages,[{id:'1',text:'kept',reply:null}]);
  assert.deepEqual((await api.request('chat.feed',{roomId})).typing,[]);
  assert.equal((await api.request('chat.rooms')).rooms[0].last,null);
  await assert.rejects(api.request('chat.members',{roomId}),{code:'OFFLINE_NOT_CACHED'});
  await assert.rejects(api.request('chat.asset',{}),{code:'NETWORK'});
  assert.doesNotMatch(JSON.stringify(await rows(h.store,'content')),/ephemeral quote|disappearing|preview secret|sensitive|Typing now/);
  assert.equal((await rows(h.store,'jobs')).length,0);h.engine.dispose();
});

test('pending financial instructions remain separate from posted balances and conflicts preserve the original draft',async()=>{
  const h=harness(),api=h.view('finance.view'),receipts=[],commandId=uu();
  api.subscribeReceipts(r=>receipts.push(r));h.remote((a)=>a==='finance.list'?{items:[{balance:'11.00'}]}:{ok:true});
  await api.request('finance.list',{tab:'boxes'});h.setOnline(false);
  const p={commandId,amount:'21.00',box:'main:USD'};
  const ack=await api.request('finance.transaction',p);
  assert.deepEqual(ack,{queued:true,commandId,queueId:ack.queueId});assert(!('balance' in ack));
  assert.equal((await api.request('finance.list',{tab:'boxes'})).items[0].balance,'11.00');
  assert.equal((await api.request('finance.transaction',{amount:'21.00',commandId,box:'main:USD'})).queueId,ack.queueId);
  await assert.rejects(api.request('finance.transaction',{...p,amount:'99.00'}),{code:'IDEMPOTENCY_MISMATCH'});
  h.remote(()=>{throw Object.assign(Error('INVALID_INSUFFICIENT_BALANCE'),{code:'INVALID_INSUFFICIENT_BALANCE',status:422});});
  h.setOnline(true);await api.syncNow();
  assert.equal(receipts.length,1);assert.equal(receipts[0].status,'conflict');assert.equal(receipts[0].commandId,commandId);
  assert.equal((await api.listOutbox())[0].status,'conflict');assert.equal((await api.getDraft(ack.queueId)).payload.amount,'21.00');
  await api.syncNow();assert.equal(h.calls.filter(c=>c.action==='finance.transaction').length,1);
  await api.discardDraft(ack.queueId);assert.deepEqual(await api.listOutbox(),[]);h.engine.dispose();
});

test('a crashed lease holder cannot double-post across tabs and a late acknowledgement cannot win a newer lease',async()=>{
  const h=harness({online:false}),p={requestId:uu(),roomId:uu(),text:'draft'},api=h.view('chat.view'),ack=await api.request('chat.send',p);
  const h2=harness({clock:h.clock,factory:h.factory,online:true}),api2=h2.view('chat.view'),started=pause(),finish=pause();
  h.setOnline(true);h.remote(async()=>{started.release();await finish.promise;return {id:'old'};});
  const first=api.syncNow();await started.promise;await api2.syncNow();
  assert.equal(h2.calls.length,0);
  h.advance(61000);h2.remote(()=>({id:'authoritative-replayed-id'}));await api2.syncNow();
  finish.release();await first;
  assert.equal(h2.calls.length,1);assert.equal(h2.calls[0].p.requestId,p.requestId);
  const final=(await rows(h.store,'jobs'))[0];assert.equal(final.id,ack.queueId);assert.equal(final.status,'posted');
  assert.equal(final.result.id,'authoritative-replayed-id');h.engine.dispose();h2.engine.dispose();
});

test('PostgreSQL and the production file Edge handler replay a committed upload after a lost acknowledgement and reload',async()=>{
  const db=await createProviderTestDatabase(),objects=new Map(),workspace=uu(),userId=uu(),sessionId=uu(),actor={userId,sessionId};
  let writes=0,dropped=false;
  try{
    await db.exec(await readFile(new URL('../supabase/modules/files.sql',import.meta.url),'utf8'));
    await db.query('insert into wow_workspaces(id,name) values($1,$2)',[workspace,'offline fixture']);
    await db.query('insert into auth.users(id) values($1)',[userId]);
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessionId,userId]);
    await db.query("insert into wow_accounts(id,workspace_id,login_email,username,name,role,permissions) values($1,$2,'offline@test.invalid','offline','Offline','owner','{}')",[userId,workspace]);
    await db.query('insert into wow_sessions(session_id,account_id,session_version) values($1,$2,1)',[sessionId,userId]);
    const handlers=createFilesActions({moduleRpc:async(fn,action,p)=>(await db.query('select public.wow_files_service($1,$2::jsonb) result',[action,JSON.stringify(p)])).rows[0].result,
      storage:{async put(path,bytes){writes++;objects.set(path,bytes);}}});
    const remote=async(a,p)=>{const result=await handlers[a]({actor,body:p});if(a==='files.upload'&&!dropped){dropped=true;throw network();}return result;};
    const h=harness({remote}),api=h.view('files.view');
    const p={requestId:uu(),name:'invoice.txt',mime:'text/plain',data:btoa('a bounded private file'),originalBytes:22};
    const ack=await api.request('files.upload',p);assert.equal(ack.queued,true);
    assert.equal(h.calls.filter(c=>c.action==='files.upload').length,1);assert.equal(writes,1);
    const payloads=await rows(h.store,'payload');assert.equal(payloads.length,1);assert.equal(payloads[0].value.blob.size,22);
    assert.equal(payloads[0].value.fields.data,undefined);h.engine.dispose();
    const restored=harness({clock:h.clock,factory:h.factory,remote}),v=restored.view('files.view'),receipts=[];
    v.subscribeReceipts(r=>receipts.push(r));await v.syncNow();assert.equal(restored.calls.length,0);
    h.advance(2000);await v.syncNow();assert.equal(writes,1);
    assert.equal(receipts[0].queueId,ack.queueId);assert.equal(receipts[0].status,'posted');assert.equal(receipts[0].requestId,p.requestId);
    assert.equal((await v.request('files.list',{})).count,1);const result=await v.request('files.upload',p);assert.equal(result.file.id,receipts[0].result.file.id);
    assert.equal((await rows(restored.store,'payload')).length,0);assert.equal(restored.calls.filter(c=>c.action==='files.upload').length,1);
    assert.deepEqual(restored.calls[0].p,p);restored.engine.dispose();
  }finally{await db.close();}
});

test('strict action/route permissions, isolated account scopes, expiry guards and quarantined recovery after server denial',async()=>{
  const h=harness(),v=h.view('gallery.view'),commandId=uu();
  h.setAllowed(cap=>cap!=='gallery.edit');await assert.rejects(v.request('gallery.snapshot',{manage:true}),{code:'AUTH_REQUIRED'});assert.equal(h.calls.length,0);
  h.setAllowed(()=>true);h.remote(()=>({items:[{id:'private'}]}));await v.request('gallery.snapshot');
  h.setOnline(false);const ack=await v.request('gallery.order.place',{commandId,accepted:true,items:[{productId:7,priceMinor:1200,currency:'USD',quantity:1}]});
  h.setOnline(true);h.remote(()=>{throw Object.assign(Error('ACCESS_DENIED'),{code:'ACCESS_DENIED',status:403});});
  await assert.rejects(v.request('gallery.snapshot',{},{refresh:true}),{code:'ACCESS_DENIED'});
  assert.equal((await rows(h.store,'cache')).length,0);assert.equal((await rows(h.store,'jobs'))[0].status,'quarantined');
  h.setOnline(false);await assert.rejects(v.request('gallery.snapshot'),{code:'ACCESS_REVALIDATION_REQUIRED'});
  h.setId({...defaultId(),owner:'B',scope:'B1',runtime:'B1'});const other=h.view('gallery.view');assert.deepEqual(await other.listOutbox(),[]);
  await assert.rejects(other.getDraft(ack.queueId),{code:'DRAFT_UNAVAILABLE'});await assert.rejects(v.request('gallery.snapshot'),{code:'AUTH_REQUIRED'});
  h.advance(50);h.setId({...defaultId(),scope:'new grants',runtime:'epoch2',cloudVersion:2,verifiedAt:h.clock.ms});
  const next=h.view('gallery.view');assert.equal((await next.listOutbox())[0].status,'quarantined');
  await assert.rejects(next.getDraft(ack.queueId),{code:'DRAFT_REVALIDATION_REQUIRED'});
  h.setOnline(true);h.remote(()=>({ok:true}));const draft=await next.getDraft(ack.queueId);assert.equal(draft.payload.commandId,commandId);
  assert.equal(h.calls.filter(c=>c.action==='gallery.order.place').length,0);h.engine.dispose();
});

test('cached room removal clears its pages, quarantines forwards and fails closed for out-of-order read completions',async()=>{
  const h=harness(),v=h.view('chat.view'),roomId=uu(),hold=pause(),started=pause();
  h.remote((a)=>a==='chat.rooms'?{rooms:[{id:roomId}]}:{messages:[{id:'1',text:'restricted'}]});
  await v.request('chat.rooms');await v.request('chat.feed',{roomId});
  h.setOnline(false);const cmd=await v.request('chat.forward',{roomId,sourceRoomId:roomId,messageId:'1',requestId:uu()});
  h.setOnline(true);h.remote(async(a)=>{if(a==='chat.rooms')return {rooms:[]};started.release();await hold.promise;return {messages:[]};});
  const priorRead=v.request('chat.feed',{roomId},{refresh:true});await started.promise;
  await v.request('chat.rooms',{}, {refresh:true});
  h.setOnline(false);hold.release();await assert.rejects(priorRead,{code:'OFFLINE_NOT_CACHED'});
  await assert.rejects(v.request('chat.feed',{roomId}),{code:'OFFLINE_NOT_CACHED'});
  assert.equal((await v.listOutbox()).find(x=>x.queueId===cmd.queueId).status,'quarantined');h.engine.dispose();
});

test('confirmed downloads alone cache matching bytes; LRU evicts clean data across pages and raw uploads survive eviction',async()=>{
  const h=harness({limits:{cacheEntries:2}}),v=h.view('files.view'),fileId=uu(),blob=new Blob(['private body'],{type:'text/plain'});
  const hash=Buffer.from(await webcrypto.subtle.digest('SHA-256',await blob.arrayBuffer())).toString('hex');
  h.remote((a,p)=>a==='files.open'?{url:'https://bucket.invalid/path?token=secret',name:'one.txt',mime:'text/plain',digest:hash,expiresAt:new Date(h.clock.ms+60000).toISOString()}:{files:[],count:0});
  const local={blob,fileName:'one.txt',contentType:'text/plain',digest:hash};
  h.setAllowed(key=>key!=='files.export');
  await v.request('files.open',{fileId,download:false});
  const callsBeforeExport=h.calls.length;
  await assert.rejects(v.request('files.open',{fileId,download:true}),{code:'AUTH_REQUIRED'});
  await assert.rejects(v.request('files.share',{fileId}),{code:'AUTH_REQUIRED'});
  await assert.rejects(v.localFiles.put(fileId,local),{code:'AUTH_REQUIRED'});
  assert.equal(h.calls.length,callsBeforeExport);
  h.setAllowed(()=>true);
  await assert.rejects(v.localFiles.put(fileId,local),{code:'DOWNLOAD_PROOF_REQUIRED'});
  await v.request('files.open',{fileId,download:false});await assert.rejects(v.localFiles.put(fileId,local),{code:'DOWNLOAD_PROOF_REQUIRED'});
  await v.request('files.open',{fileId,download:true});
  await assert.rejects(v.localFiles.put(fileId,{...local,blob:new Blob(['wrong'])}),{code:'FILE_DIGEST_MISMATCH'});
  await v.localFiles.put(fileId,local);assert.equal(await (await v.localFiles.get(fileId)).blob.text(),'private body');
  const text=JSON.stringify(await rows(h.store,'content'));assert.doesNotMatch(text,/token=secret/);
  h.setOnline(false);const received=await v.request('files.upload',{requestId:uu(),name:'upload.txt',mime:'text/plain',data:btoa('only local')});
  assert.equal(received.queued,true);h.setOnline(true);h.advance(31000);await v.request('files.list',{query:'one'});
  h.advance(31000);await v.request('files.list',{query:'two'});
  assert.equal(await v.localFiles.get(fileId),null);assert.equal((await rows(h.store,'payload')).length,1);
  assert.equal((await rows(h.store,'cache')).length,2);h.engine.dispose();
});

test('global queue capacity and an actual failed IndexedDB write cannot acknowledge an unsaved command',async()=>{
  const h=harness({limits:{queueEntries:1},online:false}),v=h.view('chat.view'),p={roomId:uu(),requestId:uu(),text:'kept'};
  const saved=await v.request('chat.send',p);
  await assert.rejects(v.request('chat.send',{...p,requestId:uu()}),{code:'DEVICE_QUEUE_FULL'});
  assert.equal(v.getConnection().storage,'full');assert.equal((await rows(h.store,'payload')).length,1);assert.equal((await v.listOutbox())[0].queueId,saved.queueId);
  const h2=harness(),v2=h2.view('chat.view'),original=IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add=function(...args){if(this.name==='payload')throw new DOMException('full','QuotaExceededError');return original.apply(this,args);};
  try {
    await assert.rejects(v2.request('chat.send',p),{code:'DEVICE_STORAGE_FULL'});
    assert.equal((await rows(h2.store,'jobs')).length,0);assert.equal((await rows(h2.store,'payload')).length,0);
    assert.equal(h2.calls.length,0);assert.equal(v2.getConnection().storage,'full');
  }finally{IDBObjectStore.prototype.add=original;h.engine.dispose();h2.engine.dispose();}
});

test('hidden tabs make no catch-up calls, no idle poll remains, and persistent storage is requested on demand',async()=>{
  const h=harness({online:false}),v=h.view('chat.view');await v.request('chat.send',{roomId:uu(),requestId:uu(),text:'pending'});
  h.hide(true);h.setOnline(true);await v.syncNow();assert.equal(h.calls.length,0);assert.equal(h.timers.size,0);assert.equal(h.persistCalls(),0);
  h.hide(false);assert.equal(h.timers.size,1);const [timer,{fn}]=[...h.timers][0];h.timers.delete(timer);fn();await h.engine.run();
  assert.equal(h.calls.length,1);assert.equal(h.timers.size,0);
  assert.equal(await v.requestPersistence(),true);assert.equal(h.persistCalls(),1);h.engine.dispose();
});

test('local quota budget omits a large projection and bounded storage never invents an offline success for live-only actions',async()=>{
  const h=harness({quota:16000}),v=h.view('gallery.view');
  h.remote(()=>({items:['a'.repeat(800)]}));
  assert.equal((await v.request('gallery.snapshot'))._sync.source,'server');h.setOnline(false);
  await assert.rejects(v.request('gallery.snapshot'),{code:'OFFLINE_NOT_CACHED'});
  for(const action of ['gallery.image.upload','gallery.command.review','chat.profile','chat.read','files.rename','finance.archive','finance.attach','finance.attachment','finance.restore','metals.quote.live','assistant.ask']){
    await assert.rejects(v.request(action,{}),{code:'NETWORK'});
  }
  await assert.rejects(v.request('gallery.stock',{commandId:uu(),rows:[{productId:7}]}),{code:'INVALID_GALLERY_INPUT'});
  await assert.rejects(v.request('gallery.order.place',{commandId:uu(),accepted:false,items:[]}),{code:'INVALID_GALLERY_INPUT'});
  assert.deepEqual(await v.listOutbox(),[]);h.engine.dispose();
});

test('explicit download grants are invalid as soon as relevant file metadata is changed or the file is deleted',async()=>{
  const h=harness(),v=h.view('files.view'),fileId=uu(),blob=new Blob(['authorized'],{type:'text/plain'});
  const digest=Buffer.from(await webcrypto.subtle.digest('SHA-256',await blob.arrayBuffer())).toString('hex');
  h.remote(a=>a==='files.open'?{name:'brief.txt',mime:'text/plain',digest,expiresAt:new Date(h.clock.ms+60000).toISOString(),url:'signed'}:{ok:true});
  await v.request('files.open',{fileId,download:true});await v.request('files.delete',{ids:[fileId]});
  await assert.rejects(v.localFiles.put(fileId,{blob,digest,fileName:'brief.txt',contentType:'text/plain'}),{code:'DOWNLOAD_PROOF_REQUIRED'});
  assert.equal(await v.localFiles.get(fileId),null);h.engine.dispose();
});

test('an old authenticated tab cannot read cached rows or replay after a different tab freezes the same binding',async()=>{
  const h=harness(),other=harness({factory:h.factory,clock:h.clock}),v=h.view('finance.view'),v2=other.view('finance.view');
  h.remote(()=>({items:[{balance:'protected'}]}));await v.request('finance.list',{tab:'boxes'});
  await v2.listOutbox();h.remote(()=>{throw Object.assign(Error('SESSION_REVOKED'),{code:'SESSION_REVOKED',status:401});});
  await assert.rejects(v.request('finance.list',{tab:'boxes'},{refresh:true}),{code:'SESSION_REVOKED'});
  other.setOnline(false);await assert.rejects(v2.request('finance.list',{tab:'boxes'}),{code:'SCOPE_CHANGED'});
  await assert.rejects(v2.request('finance.transaction',{commandId:uu()}),{code:'ACCESS_REVALIDATION_REQUIRED'});
  assert.equal(other.calls.length,0);h.engine.dispose();other.engine.dispose();
});

test('the additive owner-grant schema upgrade preserves an existing command and its payload from v1',async()=>{
  const factory=new IDBFactory(),id=defaultId(),queueId=uu(),commandId=uu();
  const old=await new Promise((resolve,reject)=>{
    const req=factory.open('MarkRobotPrivateModules_v1',1);
    req.onupgradeneeded=()=>{
      req.result.createObjectStore('bindings',{keyPath:'owner'});
      for(const n of ['cache','content','jobs','payload']){const s=req.result.createObjectStore(n,{keyPath:'id'});
        if(n==='jobs'||n==='cache')s.createIndex('owner','owner');if(n==='jobs')s.createIndex('intent','intent',{unique:true});}
    };req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  const seal=uu(),fields={commandId,description:'old private expense'};
  await new Promise((resolve,reject)=>{
    const tx=old.transaction(['bindings','jobs','payload'],'readwrite');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
    tx.objectStore('bindings').put({...id,seal,seq:1,versions:{},frozen:false});
    tx.objectStore('jobs').put({id:queueId,owner:id.owner,scope:id.scope,seal,origin:'finance.view',required:['finance.view','finance.edit'],action:'finance.transaction',
      commandKey:commandId,idField:'commandId',intent:JSON.stringify([id.owner,commandId]),fingerprint:'original',family:'money',bytes:100,status:'pending',createdAt:1000,ordinal:1,attempts:0,nextAt:0});
    tx.objectStore('payload').put({id:queueId,value:{fields,blob:null,blobHash:null}});
  });
  old.close();
  const h=harness({factory,online:false}),v=h.view('finance.view');
  assert.equal((await h.store.open()).version,2);assert((await h.store.open()).objectStoreNames.contains('grantState'));
  assert.equal((await v.listOutbox())[0].queueId,queueId);assert.deepEqual((await v.getDraft(queueId)).payload,fields);
  h.setOnline(true);await v.syncNow();assert.deepEqual(h.calls,[{action:'finance.transaction',p:fields}]);h.engine.dispose();
});
