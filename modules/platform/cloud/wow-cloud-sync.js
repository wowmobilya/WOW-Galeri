/* Durable, scoped synchronization. Local business changes and their outbox
   entries share one IndexedDB transaction. The server authorizes every request. */
(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.WFCloudSync=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const BUSINESS=Object.freeze(['companies','products','invoices','payments','settings','media']);
  const STORES=Object.freeze(['wf_cloud_outbox','wf_cloud_meta','wf_cloud_conflicts']);
  const [OUTBOX,META,CONFLICTS]=STORES;
  const MAX_OPERATIONS=100,MAX_MEDIA_BYTES=8*1024*1024,LEASE_MS=120000;
  const BLOCKED_CODES=new Set(['CONFLICT','DUPLICATE_INVOICE_NUMBER','INVALID_RECORD','RECORD_TOO_LARGE','UNSUPPORTED_MEDIA','MEDIA_TOO_LARGE','UNSUPPORTED_SYNC_VALUE','INVALID_OPERATION','INVALID_BATCH','SYNC_BATCH_TOO_LARGE']);
  const clone=value=>value==null?value:root.structuredClone(value);
  const error=(code,cause)=>Object.assign(new Error(code),{code,...(cause?{cause}:{})});
  const validId=id=>typeof id==='string'||typeof id==='number'&&Number.isFinite(id);
  const sameId=(a,b)=>typeof a===typeof b&&a===b;
  const recordKey=(store,id)=>JSON.stringify([store,typeof id,id]);
  const scopeKey=value=>{
    const parts=[value.mode,value.workspaceId,value.userId];
    if(value.mode==='remote'&&value.sessionVersion!==undefined)parts.push(value.sessionVersion);
    return JSON.stringify(parts);
  };
  const scopeMetaId=scope=>'scope:'+scope;
  const recordMetaId=(scope,store,id)=>'record:'+scope+':'+recordKey(store,id);
  function upgrade(db){for(const store of STORES)if(!db.objectStoreNames.contains(store))db.createObjectStore(store,{keyPath:'id'});}
  function transact(db,stores,mode,work){
    return new Promise((resolve,reject)=>{
      let tx,result,failure;
      const fail=cause=>{failure=cause;try{tx?.abort();}catch(_){}if(!tx)reject(cause);};
      try{
        tx=db.transaction(stores,mode);
        tx.oncomplete=()=>resolve(result);tx.onerror=()=>{failure=tx.error||failure;};
        tx.onabort=()=>reject(failure||tx.error||error('SYNC_TRANSACTION_ABORTED'));
        work(tx,value=>{result=value;},fail);
      }catch(cause){fail(cause);}
    });
  }
  function normalizeOperations(operations){
    if(!Array.isArray(operations)||!operations.length)throw error('INVALID_SYNC_BATCH');
    const unique=new Map();
    for(const source of operations){
      const kind=source.kind||source.type==='delete'&&'delete'||'put',id=source.id??source.value?.id;
      if(!BUSINESS.includes(source.store)||!['put','delete'].includes(kind)||!validId(id))throw error('INVALID_SYNC_OPERATION');
      if(kind==='put'&&(!source.value||typeof source.value!=='object'||!sameId(source.value.id,id)))throw error('INVALID_SYNC_RECORD');
      const value={store:source.store,id,kind,...(kind==='put'?{value:clone(source.value)}:{})};
      unique.set(recordKey(value.store,id),value);
    }
    if(unique.size>MAX_OPERATIONS)throw error('SYNC_BATCH_TOO_LARGE');
    return [...unique.values()];
  }
  function jsonValue(value,seen=new WeakSet()){
    if(value===null||typeof value==='string'||typeof value==='boolean')return value;
    if(typeof value==='number'){if(!Number.isFinite(value))throw error('UNSUPPORTED_SYNC_VALUE');return value;}
    if(value===undefined)return undefined;
    if(typeof value!=='object'||typeof Blob!=='undefined'&&value instanceof Blob)throw error('UNSUPPORTED_MEDIA');
    if(value instanceof Date)return value.toISOString();
    if(seen.has(value))throw error('UNSUPPORTED_SYNC_VALUE');seen.add(value);
    let result;
    if(Array.isArray(value))result=value.map(item=>jsonValue(item,seen)??null);
    else{
      const proto=Object.getPrototypeOf(value);if(proto!==Object.prototype&&proto!==null)throw error('UNSUPPORTED_SYNC_VALUE');
      result={};for(const [key,item]of Object.entries(value)){const converted=jsonValue(item,seen);if(converted!==undefined)Object.defineProperty(result,key,{value:converted,enumerable:true,writable:true,configurable:true});}
    }
    seen.delete(value);return result;
  }
  async function dataURL(value,{forExport=false}={}){
    if(typeof value==='string'){
      if(!/^data:image\/(?:png|jpeg|webp|gif|avif|svg\+xml);base64,[a-zA-Z0-9+/=\r\n]+$/.test(value))throw error('UNSUPPORTED_MEDIA');
      if(value.length>Math.ceil(MAX_MEDIA_BYTES*4/3)+256)throw error('MEDIA_TOO_LARGE');return value;
    }
    if(typeof Blob==='undefined'||!(value instanceof Blob))throw error('UNSUPPORTED_MEDIA');
    if(value.size>(forExport?64*1024*1024:MAX_MEDIA_BYTES))throw error(forExport?'CONFLICT_EXPORT_TOO_LARGE':'MEDIA_TOO_LARGE');
    if(!forExport&&!/^image\/(?:png|jpeg|webp|gif|avif|svg\+xml)$/.test(value.type))throw error('UNSUPPORTED_MEDIA');
    const bytes=new Uint8Array(await value.arrayBuffer());let binary='';
    for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
    return 'data:'+(value.type||'application/octet-stream')+';base64,'+root.btoa(binary);
  }
  function create(options={}){
    const {getDB,client}=options;
    if(typeof getDB!=='function'||typeof client?.request!=='function'||typeof client?.getSnapshot!=='function')throw error('SYNC_ADAPTER_REQUIRED');
    const crypto=options.crypto||root.crypto,now=options.now||Date.now;
    if(typeof crypto?.getRandomValues!=='function')throw error('CRYPTO_UNAVAILABLE');
    const uuid=()=>crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint8Array(16)),value=>value.toString(16).padStart(2,'0')).join('');
    const runnerId=uuid(),isOnline=options.isOnline||(()=>root.navigator?.onLine!==false),isVisible=options.isVisible||(()=>root.document?.visibilityState!=='hidden');
    const later=options.setTimeout||root.setTimeout.bind(root),cancel=options.clearTimeout||root.clearTimeout.bind(root);
    const fetch=options.fetch||root.fetch?.bind(root),pollMs=options.pollMs||30000;
    let db,binding=null,started=false,starting=null,flight=null,timer=null,failures=0,epoch=0,unsubscribe=null,initialPulled=false,resolving=false,bootstrapPending=false;
    let state={connection:'unlinked',pending:0,conflicts:0,quarantined:0,lastSyncAt:null,lastError:null};
    const listeners=new Set(),disposers=[];
    const snapshot=()=>Object.freeze({...state,linked:!!binding,scope:binding?Object.freeze({mode:binding.mode,workspaceId:binding.workspaceId,userId:binding.userId,scopeKey:binding.scope,...(binding.mode==='remote'?{sessionVersion:binding.sessionVersion}:{})}):null,
      status:state.connection,pendingCount:state.pending,conflictCount:state.conflicts,error:state.lastError});
    function publish(patch={}){
      state={...state,...patch};const value=snapshot();
      for(const fn of listeners)try{fn(value);}catch(_){}
      try{options.onStatus?.(value);if(root.CustomEvent)root.dispatchEvent?.(new root.CustomEvent('wf-cloud-sync-change',{detail:value}));}catch(_){}
      return value;
    }
    function linkedScope(){return snapshot().scope;}
    function verified(){
      const current=client.getSnapshot();
      if(!current?.authenticated||!current.workspaceId||!current.userId)return null;
      if(!['local','remote'].includes(current.mode)||current.mode==='local'&&current.role!=='owner')return null;
      const scope={mode:current.mode,workspaceId:current.workspaceId,userId:current.userId};
      if(current.mode==='remote'){
        if(!Number.isSafeInteger(current.sessionVersion)||current.sessionVersion<1)return null;
        scope.sessionVersion=current.sessionVersion;
      }
      return scope;
    }
    function authorized(){const current=verified();return !!current&&!!binding&&scopeKey(current)===binding.scope;}
    // Another tab can verify a newer permission version while a request is in
    // flight. Check the persisted binding inside the transaction that reads or
    // writes the employee cache so a stale tab cannot repopulate the new one.
    function withBinding(tx,work,fail){
      if(binding.mode!=='remote'){work();return;}
      const expected=binding.scope,check=tx.objectStore(META).get('binding');
      check.onsuccess=()=>{
        try{
          if(!authorized()||binding.scope!==expected||check.result?.scope!==expected)throw error('SESSION_REVOKED');
          work();
        }catch(cause){fail(cause);}
      };
    }
    function scopedTransaction(stores,mode,work){
      const names=binding.mode==='remote'?[...new Set([...stores,META])]:stores;
      return transact(db,names,mode,(tx,set,fail)=>withBinding(tx,()=>work(tx,set,fail),fail));
    }
    function cancelTimer(){if(timer!==null){cancel(timer);timer=null;}}
    function schedule(ms=150){
      cancelTimer();if(!started||!binding||resolving||bootstrapPending||!isOnline()||!isVisible()||!authorized())return;
      timer=later(()=>{timer=null;syncNow().catch(()=>{});},ms);
    }
    async function counts(){
      if(!db||!binding)return;
      const result=await scopedTransaction([OUTBOX,CONFLICTS],'readonly',(tx,set)=>{let pending,conflicts,quarantined=0;const finish=()=>{if(pending!==undefined&&conflicts!==undefined)set({pending,conflicts,quarantined});};
        const a=tx.objectStore(OUTBOX).count(),store=tx.objectStore(CONFLICTS),b=store.openKeyCursor?store.openKeyCursor():store.openCursor();let count=0;
        a.onsuccess=()=>{pending=a.result;finish();};b.onsuccess=()=>{const cursor=b.result;if(cursor){const id=String(cursor.primaryKey);if(id.startsWith('quarantine:'))quarantined++;else if(!id.startsWith('history:'))count++;cursor.continue();}else{conflicts=count;finish();}};});
      publish(result);
    }
    function resetProjection(tx){
      for(const name of [...BUSINESS,META])tx.objectStore(name).clear();
      const conflicts=tx.objectStore(CONFLICTS),history=conflicts.openKeyCursor();
      history.onsuccess=()=>{const cursor=history.result;if(!cursor)return;
        if(!String(cursor.primaryKey).startsWith('quarantine:'))conflicts.delete(cursor.primaryKey);
        cursor.continue();
      };
      const outbox=tx.objectStore(OUTBOX),pending=outbox.openCursor();
      pending.onsuccess=()=>{const cursor=pending.result;if(!cursor)return;
        const batch=cursor.value;
        conflicts.put({id:'quarantine:'+batch.scope+':'+batch.batchId,scope:batch.scope,reason:'PERMISSIONS_CHANGED',quarantinedAt:now(),original:batch});
        outbox.delete(cursor.primaryKey);cursor.continue();
      };
    }
    async function attach(){
      db=await getDB();for(const name of STORES)if(!db.objectStoreNames.contains(name))throw error('SYNC_SCHEMA_REQUIRED');
      const current=verified();
      if(client.getSnapshot().mode==='remote'&&!current)throw error('AUTH_REQUIRED');
      if(current?.mode==='remote'&&(typeof client.cacheName!=='function'||db.name==='WowFurnitureDB'||db.name!==client.cacheName()))throw error('REMOTE_DATABASE_SCOPE_MISMATCH');
      const remote=current?.mode==='remote',names=remote?[...BUSINESS,...STORES]:[META];
      let reset=false;
      const result=await transact(db,names,'readwrite',(tx,set,fail)=>{
        const os=tx.objectStore(META),req=os.get('binding');
        req.onsuccess=()=>{try{
          let next=req.result;const previousDeviceId=next?.deviceId;
          if(next&&(next.schemaVersion!==1||!['local','remote'].includes(next.mode)||!next.workspaceId||!next.userId||next.scope!==scopeKey(next)||!next.deviceId))throw error('SYNC_BINDING_INVALID');
          if(remote){
            const latest=verified();if(!latest||scopeKey(latest)!==scopeKey(current))throw error('SESSION_REVOKED');
            if(next&&(next.mode!=='remote'||next.workspaceId!==current.workspaceId||next.userId!==current.userId))throw error('REMOTE_DATABASE_SCOPE_MISMATCH');
            if(next?.sessionVersion!==undefined&&(!Number.isSafeInteger(next.sessionVersion)||next.sessionVersion<1))throw error('SYNC_BINDING_INVALID');
            if(next?.sessionVersion>current.sessionVersion)throw error('SESSION_REVOKED');
            if(next?.sessionVersion!==current.sessionVersion){resetProjection(tx);reset=true;next=null;}
          }
          if(!next&&current){next={id:'binding',schemaVersion:1,...current,scope:scopeKey(current),deviceId:previousDeviceId||uuid(),createdAt:now()};os.put(next);}
          set(next||null);
        }catch(cause){fail(cause);}};
      });
      binding=result;
      if(reset){
        epoch++;initialPulled=false;publish({lastSyncAt:null});
        try{options.onRemoteCommit?.({projectionReset:true,stores:[...BUSINESS],changes:[]});}catch(_){}
      }
      if(binding&&current&&scopeKey(current)!==binding.scope){publish({connection:'scope-mismatch',lastError:'WORKSPACE_RELINK_REQUIRED'});throw error('WORKSPACE_RELINK_REQUIRED');}
      return binding;
    }
    function writeStores(stores){return binding?[...new Set([...stores,OUTBOX,META])]:[...stores];}
    function enqueue(tx,operations,callbacks={}){
      if(!binding){if(client.getSnapshot().mode==='remote')throw error('SYNC_NOT_LINKED');return null;}
      if(typeof callbacks==='function')callbacks={onError:callbacks};
      let batchId;
      const fail=cause=>{try{callbacks.onError?.(cause);}finally{try{tx.abort();}catch(_){}}};
      try{
        const changes=normalizeOperations(operations),scope=binding.scope,deviceId=binding.deviceId,origin=callbacks.origin??'live';batchId=uuid();
        if(!['live','bootstrap','restore'].includes(origin)||origin!=='live'&&binding.mode!=='local')throw error('INVALID_SYNC_ORIGIN');
        withBinding(tx,()=>{
          const metadata=tx.objectStore(META),outbox=tx.objectStore(OUTBOX),head=metadata.get(scopeMetaId(scope));
          head.onerror=()=>fail(head.error||error('SYNC_METADATA_READ_FAILED'));
          head.onsuccess=()=>{
            try{
              const info=head.result||{id:scopeMetaId(scope),scope,cursor:0,nextOrdinal:1,seeded:false};
              if(!Number.isSafeInteger(info.nextOrdinal)||info.nextOrdinal<1)throw error('SYNC_METADATA_INVALID');
              const records=new Array(changes.length);let remaining=changes.length;
              changes.forEach((op,index)=>{
                const id=recordMetaId(scope,op.store,op.id),req=metadata.get(id);
                req.onerror=()=>fail(req.error||error('SYNC_METADATA_READ_FAILED'));
                req.onsuccess=()=>{try{
                  const item=req.result||{id,scope,store:op.store,recordId:op.id,revision:0,pending:[],deleted:false};
                  if(!Number.isSafeInteger(item.revision)||item.revision<0||!Array.isArray(item.pending))throw error('SYNC_METADATA_INVALID');
                  records[index]=item;if(--remaining)return;
                  const wire=changes.map((change,position)=>{
                    const meta=records[position],baseRevision=meta.revision+meta.pending.length;
                    metadata.put({...meta,pending:[...meta.pending,batchId]});return {...change,baseRevision};
                  });
                  metadata.put({...info,nextOrdinal:info.nextOrdinal+1});
                  const row={id:'batch:'+String(info.nextOrdinal).padStart(20,'0')+':'+batchId,batchId,scope,deviceId,origin,ordinal:info.nextOrdinal,createdAt:now(),status:'pending',operations:wire};
                  const put=outbox.put(row);put.onerror=()=>fail(put.error||error('SYNC_OUTBOX_WRITE_FAILED'));put.onsuccess=()=>callbacks.onQueued?.(batchId);
                }catch(cause){fail(cause);}};
              });
            }catch(cause){fail(cause);}
          };
        },fail);
      }catch(cause){fail(cause);}
      return batchId;
    }
    async function seedExisting(){
      if(!binding)return;
      if(binding.mode!=='local')throw error('REMOTE_SEED_FORBIDDEN');
      await scopedTransaction([...BUSINESS,OUTBOX,META],'readwrite',(tx,set,fail)=>{
        const metadata=tx.objectStore(META),check=metadata.get(scopeMetaId(binding.scope));
        check.onsuccess=()=>{
          if(check.result?.seeded){set(false);return;}
          let storeIndex=0,batch=[];
          const flush=next=>{if(!batch.length){next();return;}const current=batch;batch=[];enqueue(tx,current,{origin:'bootstrap',onError:fail,onQueued:next});};
          const finish=()=>flush(()=>{const last=metadata.get(scopeMetaId(binding.scope));last.onsuccess=()=>{metadata.put({...last.result,id:scopeMetaId(binding.scope),scope:binding.scope,cursor:last.result?.cursor||0,nextOrdinal:last.result?.nextOrdinal||1,seeded:true});set(true);};});
          const scan=()=>{
            if(storeIndex===BUSINESS.length){finish();return;}
            const store=BUSINESS[storeIndex++],req=tx.objectStore(store).openCursor();
            req.onsuccess=()=>{
              const cursor=req.result;if(!cursor){flush(scan);return;}
              const value=cursor.value,id=value?.id;
              if(!validId(id)){fail(error('INVALID_SYNC_RECORD'));return;}
              const known=metadata.get(recordMetaId(binding.scope,store,id));
              known.onsuccess=()=>{
                if(!known.result)batch.push({store,id,kind:'put',value});
                if(batch.length>=(store==='media'?1:50))flush(()=>cursor.continue());else cursor.continue();
              };
            };
          };
          scan();
        };
      });
      await counts();
    }
    async function acquireLease(){
      return scopedTransaction([META],'readwrite',(tx,set)=>{
        const os=tx.objectStore(META),id='lease:'+binding.scope,req=os.get(id);
        req.onsuccess=()=>{const previous=req.result;if(previous&&previous.owner!==runnerId&&previous.expiresAt>now()){set(false);return;}
          os.put({id,owner:runnerId,expiresAt:now()+LEASE_MS});set(true);};
      });
    }
    async function releaseLease(){
      if(!db||!binding)return;
      await scopedTransaction([META],'readwrite',(tx)=>{const os=tx.objectStore(META),id='lease:'+binding.scope,req=os.get(id);req.onsuccess=()=>{if(req.result?.owner===runnerId)os.delete(id);};});
    }
    async function firstBatch(){
      return scopedTransaction([OUTBOX],'readonly',(tx,set)=>{const req=tx.objectStore(OUTBOX).openCursor();req.onsuccess=()=>{const cursor=req.result;if(!cursor){set(null);return;}if(cursor.value.scope===binding.scope){set(cursor.value);return;}cursor.continue();};});
    }
    async function preparePush(batch){
      const operations=[],media=new Map();
      for(const op of batch.operations){
        if(op.store==='media'&&op.kind==='put'){
          let record;
          if(op.value.data!==undefined){
            const data=await dataURL(op.value.data);
            const uploaded=await client.request('media.upload',{...jsonValue({...op.value,data:undefined}),id:op.id,data},{authenticated:true});
            record=uploaded?.record;if(!record||!sameId(record.id,op.id)||typeof record.storagePath!=='string')throw error('INVALID_MEDIA_RESPONSE');
            media.set(recordKey(op.store,op.id),{data,storagePath:record.storagePath});
          }else{record=jsonValue(op.value);if(typeof record.storagePath!=='string')throw error('UNSUPPORTED_MEDIA');}
          operations.push({...op,value:record});
        }else operations.push(op.kind==='delete'?{...op}:{...op,value:jsonValue(op.value)});
      }
      return {operations,media};
    }
    function changesValid(changes,{allowMissing=false}={}){
      if(!Array.isArray(changes)||changes.length>2000)throw error('INVALID_SYNC_RESPONSE');
      const result=new Map();
      for(const value of changes){
        if(!BUSINESS.includes(value.store)||!validId(value.id)||!Number.isSafeInteger(value.revision)||value.revision<(allowMissing?0:1)||value.revision===0&&!value.deleted||typeof value.deleted!=='boolean'||
          !value.deleted&&(!value.value||!sameId(value.value.id,value.id)))throw error('INVALID_SYNC_RESPONSE');
        const key=recordKey(value.store,value.id),previous=result.get(key);if(!previous||value.revision>=previous.revision)result.set(key,clone(value));
      }
      return [...result.values()];
    }
    async function knownRecords(changes){
      return scopedTransaction([META],'readonly',(tx,set)=>{const found=new Map();set(found);for(const change of changes){const req=tx.objectStore(META).get(recordMetaId(binding.scope,change.store,change.id));req.onsuccess=()=>found.set(recordKey(change.store,change.id),req.result);}});
    }
    async function materialize(changes,media=new Map(),force=false){
      const known=await knownRecords(changes),result=[];
      for(const change of changes){
        const key=recordKey(change.store,change.id),meta=known.get(key);
        if(change.store!=='media'||change.deleted||!force&&(meta?.revision>=change.revision||meta?.pending?.length)){result.push(change);continue;}
        const inline=media.get(key);
        if(inline&&inline.storagePath===change.value.storagePath){result.push({...change,value:{...change.value,data:inline.data}});continue;}
        if(change.value.data!==undefined){result.push({...change,value:{...change.value,data:await dataURL(change.value.data)}});continue;}
        const signed=await client.request('media.download',{id:change.id,storagePath:change.value.storagePath},{authenticated:true});
        if(!signed?.url||!/^https:\/\//.test(signed.url)||typeof fetch!=='function')throw error('INVALID_MEDIA_RESPONSE');
        const response=await fetch(signed.url,{method:'GET',credentials:'omit'});if(!response.ok)throw error('MEDIA_DOWNLOAD_FAILED');
        const blob=await response.blob();result.push({...change,value:{...change.value,data:await dataURL(blob)}});
      }
      return result;
    }
    function notifyRemote(changes){
      if(!changes.length)return;
      try{options.onRemoteCommit?.({stores:[...new Set(changes.map(row=>row.store))],changes:changes.map(({store,id,deleted})=>({store,id,deleted}))});}catch(_){}
    }
    async function acknowledge(batch,reply,media,runEpoch){
      if(reply?.ok!==true||reply.batchId!==batch.batchId)throw error('INVALID_SYNC_RESPONSE');
      let changes=changesValid(reply.changes);
      if(changes.length!==batch.operations.length)throw error('INVALID_SYNC_RESPONSE');
      for(const op of batch.operations){const match=changes.find(row=>row.store===op.store&&sameId(row.id,op.id));
        if(!match||match.revision!==op.baseRevision+1||match.deleted!==(op.kind==='delete'))throw error('INVALID_SYNC_RESPONSE');}
      // Media just uploaded by this batch is already available locally. It need
      // not be downloaded again, and the full bytes never enter JSON records.
      changes=changes.map(change=>{const cached=media.get(recordKey(change.store,change.id));return cached&&cached.storagePath===change.value?.storagePath?{...change,value:{...change.value,data:cached.data}}:change;});
      const applied=[];
      await scopedTransaction([OUTBOX,META,CONFLICTS,...new Set(changes.map(change=>change.store))],'readwrite',(tx,set,fail)=>{
        const pending=tx.objectStore(OUTBOX).get(batch.id);pending.onsuccess=()=>{
          if(!active(runEpoch)){fail(error('SYNC_CANCELLED'));return;}
          if(!pending.result){set(false);return;}
          if(pending.result.batchId!==batch.batchId||pending.result.scope!==binding.scope){fail(error('SYNC_STATE_INVALID'));return;}
          for(const change of changes){const id=recordMetaId(binding.scope,change.store,change.id),req=tx.objectStore(META).get(id);
            req.onsuccess=()=>{try{
              if(!active(runEpoch))throw error('SYNC_CANCELLED');
              const meta=req.result;if(!meta?.pending?.includes(batch.batchId))throw error('SYNC_STATE_INVALID');
              const rest=meta.pending.filter(id=>id!==batch.batchId);
              tx.objectStore(META).put({...meta,revision:Math.max(meta.revision,change.revision),pending:rest,deleted:change.deleted});
              if(!rest.length&&meta.revision<=change.revision){const store=tx.objectStore(change.store);if(change.deleted)store.delete(change.id);else store.put(change.value);applied.push(change);}
            }catch(cause){fail(cause);}};
          }
          tx.objectStore(OUTBOX).delete(batch.id);tx.objectStore(CONFLICTS).delete('batch:'+batch.batchId);set(true);
        };
      });
      notifyRemote(applied);
    }
    async function markConflict(batch,cause){
      await scopedTransaction([OUTBOX,CONFLICTS],'readwrite',(tx)=>{const req=tx.objectStore(OUTBOX).get(batch.id);req.onsuccess=()=>{if(!req.result)return;
        tx.objectStore(OUTBOX).put({...req.result,status:'conflict',error:cause.code||'CONFLICT'});
        tx.objectStore(CONFLICTS).put({id:'batch:'+batch.batchId,scope:binding.scope,batchId:batch.batchId,reason:cause.code||'CONFLICT',conflicts:jsonValue(cause.conflicts||[]),seenAt:now()});};});
    }
    async function applyPull(reply,cursor,runEpoch){
      if(reply?.ok!==true||!Number.isSafeInteger(reply.cursor)||reply.cursor<cursor||typeof reply.hasMore!=='boolean'||reply.hasMore&&reply.cursor===cursor)throw error('INVALID_SYNC_RESPONSE');
      const changes=await materialize(changesValid(reply.changes)),applied=[];
      if(!active(runEpoch))throw error('SYNC_CANCELLED');
      await scopedTransaction([META,CONFLICTS,...new Set(changes.map(change=>change.store))],'readwrite',(tx,set,fail)=>{
        const metadata=tx.objectStore(META),head=metadata.get(scopeMetaId(binding.scope));
        head.onsuccess=()=>{
          if(!active(runEpoch)){fail(error('SYNC_CANCELLED'));return;}
          const previous=head.result||{id:scopeMetaId(binding.scope),scope:binding.scope,cursor:0,nextOrdinal:1,seeded:false};
          if((previous.cursor||0)!==cursor){fail(error('SYNC_CURSOR_CHANGED'));return;}
          for(const change of changes){const id=recordMetaId(binding.scope,change.store,change.id),req=metadata.get(id);
            req.onsuccess=()=>{try{
              if(!active(runEpoch))throw error('SYNC_CANCELLED');
              const current=req.result||{id,scope:binding.scope,store:change.store,recordId:change.id,revision:0,pending:[],deleted:false};
              if(current.revision>=change.revision)return;
              if(current.pending.length){
                tx.objectStore(CONFLICTS).put({id:'remote:'+id,scope:binding.scope,reason:'REMOTE_CHANGE',store:change.store,recordId:change.id,expectedRevision:current.revision,actualRevision:change.revision,batchIds:current.pending.slice(),remote:change,seenAt:now()});return;
              }
              const store=tx.objectStore(change.store);if(change.deleted)store.delete(change.id);else{
                if(change.store==='media'&&change.value.data===undefined)throw error('MEDIA_DOWNLOAD_REQUIRED');store.put(change.value);
              }
              metadata.put({...current,revision:change.revision,deleted:change.deleted});tx.objectStore(CONFLICTS).delete('remote:'+id);applied.push(change);
            }catch(cause){fail(cause);}};
          }
          metadata.put({...previous,cursor:reply.cursor,lastSyncAt:now()});set(true);
        };
      });
      initialPulled=true;notifyRemote(applied);publish({lastSyncAt:now()});return reply.hasMore;
    }
    function active(runEpoch){return started&&!resolving&&!bootstrapPending&&runEpoch===epoch&&isOnline()&&isVisible()&&authorized();}
    async function run(){
      if(!binding)return publish({connection:'unlinked'});
      if(bootstrapPending)return publish({connection:'error',lastError:'BOOTSTRAP_INCOMPLETE'});
      if(!isOnline())return publish({connection:'offline'});
      if(!isVisible())return publish({connection:'paused'});
      if(!verified())return publish({connection:'auth-required',lastError:'AUTH_REQUIRED'});
      if(!authorized())return publish({connection:'scope-mismatch',lastError:'WORKSPACE_RELINK_REQUIRED'});
      const runEpoch=epoch,runScope=binding.scope,runAuthGeneration=client.getSnapshot().authGeneration;let leased=false,blocked=false,more=false;
      try{
        leased=await acquireLease();if(!leased)return snapshot();
        publish({connection:'syncing',lastError:null});
        for(let count=0;count<20&&active(runEpoch);count++){
          const batch=await firstBatch();if(!batch)break;if(batch.status!=='pending'){blocked=true;break;}
          let payload;
          try{payload=await preparePush(batch);}catch(cause){
            if(BLOCKED_CODES.has(cause?.code)||[400,413,422].includes(cause?.status)){await markConflict(batch,cause);blocked=true;break;}throw cause;
          }
          if(!active(runEpoch))return snapshot();
          if(!await acquireLease())return snapshot();
          try{
            const reply=await client.request('sync.push',{batchId:batch.batchId,deviceId:batch.deviceId,origin:batch.origin??'live',operations:payload.operations},{authenticated:true});
            if(!active(runEpoch))return snapshot();if(!await acquireLease())return snapshot();
            await acknowledge(batch,reply,payload.media,runEpoch);
          }catch(cause){
            if(BLOCKED_CODES.has(cause?.code)||[400,413,422].includes(cause?.status)){await markConflict(batch,cause);blocked=true;break;}throw cause;
          }
          if(count===19)more=true;
        }
        for(let page=0;page<20&&active(runEpoch);page++){
          if(!await acquireLease())return snapshot();
          const info=await scopedTransaction([META],'readonly',(tx,set)=>{const req=tx.objectStore(META).get(scopeMetaId(binding.scope));req.onsuccess=()=>set(req.result);}),cursor=info?.cursor||0;
          const reply=await client.request('sync.pull',{cursor,limit:100},{authenticated:true});
          if(!active(runEpoch))return snapshot();if(!await acquireLease())return snapshot();
          const hasMore=await applyPull(reply,cursor,runEpoch);if(!hasMore)break;if(page===19)more=true;
        }
        failures=0;await counts();publish({connection:blocked||state.conflicts?'conflict':'idle',lastError:blocked?'CONFLICT':null});
      }catch(cause){
        if(cause?.code==='SYNC_CANCELLED'){
          if(!authorized())publish({connection:verified()?'scope-mismatch':'auth-required',lastError:verified()?'WORKSPACE_RELINK_REQUIRED':'AUTH_REQUIRED'});
          else if(!isOnline()||!isVisible())publish({connection:!isOnline()?'offline':'paused'});
          return snapshot();
        }
        const auth=cause?.status===401||cause?.status===403||['AUTH_REQUIRED','SESSION_REVOKED','ACCOUNT_UNAVAILABLE','REVOKED'].includes(cause?.code);
        const current=verified();
        if(auth&&(client.getSnapshot().authGeneration!==runAuthGeneration||current&&scopeKey(current)!==runScope)){
          more=true;return current&&authorized()?publish({connection:'idle',lastError:null}):snapshot();
        }
        failures++;
        if(auth&&binding.mode==='remote'&&current)try{client.invalidateSession?.(cause.code||'ACCESS_DENIED');}catch(_){}
        publish({connection:auth?'auth-required':'error',lastError:cause?.code||'SYNC_FAILED'});await counts().catch(()=>{});
      }finally{
        if(leased)await releaseLease().catch(()=>{});
        if(active(runEpoch))schedule(failures?Math.min(60000,1000*2**Math.min(failures,6)):more?150:pollMs);
      }
      return snapshot();
    }
    function syncNow(){
      cancelTimer();if(flight)return flight;if(resolving)return Promise.resolve(snapshot());
      flight=Promise.resolve().then(run).finally(()=>{flight=null;});return flight;
    }
    function afterCommit(){if(!binding)return;counts().catch(()=>{});schedule(150);}
    function listen(){
      if(unsubscribe)return;
      unsubscribe=client.subscribe?.(()=>{
        if(!started)return;
        if(!binding&&verified()){
          const attachAfterLoad=()=>{
            const current=verified();if(!started||binding||!current)return;
            start({seedExisting:current.mode==='local'}).catch(cause=>publish({connection:'error',lastError:cause.code||'SYNC_FAILED'}));
          };
          // A token refresh can complete while the first IndexedDB read is
          // pending. Attach after that startup, rather than losing its only event.
          if(starting)starting.then(attachAfterLoad,()=>{});else attachAfterLoad();
        }
        else if(authorized())schedule(0);else{
          cancelTimer();const current=verified();
          if(current?.mode==='remote'&&binding?.mode==='remote'&&current.workspaceId===binding.workspaceId&&current.userId===binding.userId&&current.sessionVersion>binding.sessionVersion){
            const reopen=()=>{if(started&&verified()?.sessionVersion===current.sessionVersion&&binding.sessionVersion!==current.sessionVersion){
              start({initialPull:true}).catch(cause=>publish({connection:'error',lastError:cause.code||'SYNC_FAILED'}));
            }};
            const pending=starting||flight;if(pending)pending.then(reopen,reopen);else reopen();
          }else publish({connection:current?'scope-mismatch':'auth-required',lastError:current?'WORKSPACE_RELINK_REQUIRED':'AUTH_REQUIRED'});
        }
      })||(()=>{});
      const wake=()=>{if(!isVisible()||!isOnline()){cancelTimer();publish({connection:!isOnline()?'offline':'paused'});}else schedule(0);};
      for(const [target,event]of [[root,'online'],[root,'offline'],[root,'focus'],[root.document,'visibilitychange']]){
        if(!target?.addEventListener)continue;target.addEventListener(event,wake);disposers.push(()=>target.removeEventListener?.(event,wake));
      }
    }
    function start({seedExisting:seed=false,initialPull=false}={}){
      if(seed&&client.getSnapshot().mode==='remote')return Promise.reject(error('REMOTE_SEED_FORBIDDEN'));
      if(starting)return starting;
      started=true;listen();
      starting=(async()=>{
        let mismatch=false;
        try{await attach();}catch(cause){
          // The already-bound local owner must still be able to save offline.
          // This does not authorize sending its queue under the other account.
          if(cause.code==='WORKSPACE_RELINK_REQUIRED'&&binding?.mode==='local'&&client.getSnapshot().mode==='local')mismatch=true;
          else throw cause;
        }
        if(!binding)return publish({connection:'unlinked'});
        if(seed){
          bootstrapPending=true;
          try{await seedExisting();bootstrapPending=false;}
          catch(cause){publish({connection:'error',lastError:'BOOTSTRAP_INCOMPLETE'});throw cause;}
        }
        await counts();publish({connection:mismatch?'scope-mismatch':authorized()?(isOnline()?'idle':'offline'):'auth-required',...(mismatch?{lastError:'WORKSPACE_RELINK_REQUIRED'}:{})});
        if(initialPull){await syncNow();if(!initialPulled||!authorized()||!['idle','conflict'].includes(state.connection))throw error(state.lastError||'REMOTE_INITIAL_SYNC_REQUIRED');}
        else schedule(0);
        return snapshot();
      })().finally(()=>{starting=null;});return starting;
    }
    function stop(){started=false;epoch++;cancelTimer();unsubscribe?.();unsubscribe=null;disposers.splice(0).forEach(fn=>fn());}
    function subscribe(fn){if(typeof fn!=='function')throw error('INVALID_LISTENER');listeners.add(fn);return()=>listeners.delete(fn);}
    async function listConflicts(limit=100){
      if(!db||!binding)return [];
      return scopedTransaction([CONFLICTS],'readonly',(tx,set)=>{const rows=[];set(rows);const req=tx.objectStore(CONFLICTS).openCursor();req.onsuccess=()=>{const cursor=req.result;if(!cursor||rows.length>=Math.min(100,Math.max(1,limit)))return;if(cursor.value.scope===binding.scope&&!cursor.value.resolved)rows.push(cursor.value);cursor.continue();};});
    }
    async function reconciliationState(){
      return scopedTransaction([META,OUTBOX,CONFLICTS],'readonly',(tx,set)=>{
        const result={head:null,batches:[],conflicts:[]};set(result);
        const head=tx.objectStore(META).get(scopeMetaId(binding.scope));head.onsuccess=()=>{result.head=head.result;};
        for(const [store,property]of [[OUTBOX,'batches'],[CONFLICTS,'conflicts']]){const req=tx.objectStore(store).openCursor();req.onsuccess=()=>{const cursor=req.result;if(!cursor)return;if(cursor.value.scope===binding.scope)result[property].push(cursor.value);cursor.continue();};}
      });
    }
    function dependentGroup(batches,batchId){
      const target=batches.find(batch=>batch.batchId===batchId);if(!target)throw error('CONFLICT_NOT_FOUND');
      const selected=new Set([batchId]),keys=new Set(target.operations.map(op=>recordKey(op.store,op.id)));let changed=true;
      // Expand in both directions: an indivisible later batch may connect this
      // record to an earlier pending edit on another record. Preserve that group.
      while(changed){changed=false;for(const batch of batches){if(selected.has(batch.batchId))continue;
        if(batch.operations.some(op=>keys.has(recordKey(op.store,op.id)))){selected.add(batch.batchId);batch.operations.forEach(op=>keys.add(recordKey(op.store,op.id)));changed=true;}
      }}
      return {batches:batches.filter(batch=>selected.has(batch.batchId)).sort((a,b)=>a.ordinal-b.ordinal),keys};
    }
    async function exportValue(value){
      if(typeof Blob!=='undefined'&&value instanceof Blob)return {__wowType:'Blob',type:value.type,data:await dataURL(value,{forExport:true})};
      if(Array.isArray(value))return Promise.all(value.map(exportValue));
      if(value&&typeof value==='object'&&!(value instanceof Date)){const result={};for(const [key,item]of Object.entries(value))Object.defineProperty(result,key,{value:await exportValue(item),enumerable:true,writable:true,configurable:true});return result;}
      return value instanceof Date?value.toISOString():value;
    }
    async function exportConflict(batchId){
      if(!binding)throw error('SYNC_NOT_LINKED');
      const current=await reconciliationState();let batches,notes;
      if(current.batches.some(row=>row.batchId===batchId)){
        batches=dependentGroup(current.batches,batchId).batches;const ids=new Set(batches.map(row=>row.batchId));
        notes=current.conflicts.filter(row=>!row.resolved&&(ids.has(row.batchId)||row.batchIds?.some(id=>ids.has(id))));
      }else{
        const history=current.conflicts.find(row=>row.resolved&&row.originalBatches?.some(batch=>batch.batchId===batchId));
        if(!history)throw error('CONFLICT_NOT_FOUND');batches=history.originalBatches;notes=[history];
      }
      return exportValue({format:'wow-cloud-conflict-v1',exportedAt:new Date(now()).toISOString(),scope:linkedScope(),requestedBatchId:batchId,batches,conflicts:notes});
    }
    async function resolveConflict(batchId,{strategy}={}){
      if(!authorized()||client.getSnapshot().role!=='owner')throw error('OWNER_REQUIRED');
      if(!['local','server'].includes(strategy))throw error('INVALID_CONFLICT_STRATEGY');
      if(resolving)throw error('SYNC_BUSY');if(!isOnline())throw error('OFFLINE');
      resolving=true;cancelTimer();let leased=false;
      try{
        if(flight)await flight;
        if(!authorized()||client.getSnapshot().role!=='owner')throw error('OWNER_REQUIRED');
        leased=await acquireLease();if(!leased)throw error('SYNC_BUSY');publish({connection:'resolving',lastError:null});
        const original=await reconciliationState(),group=dependentGroup(original.batches,batchId),ids=new Set(group.batches.map(row=>row.batchId));
        if(!original.conflicts.some(row=>!row.resolved&&(ids.has(row.batchId)||row.batchIds?.some(id=>ids.has(id)))))throw error('CONFLICT_NOT_FOUND');
        const records=[...new Map(group.batches.flatMap(batch=>batch.operations.map(({store,id})=>[recordKey(store,id),{store,id}]))).values()];
        if(strategy==='local'&&records.length>MAX_OPERATIONS)throw error('CONFLICT_GROUP_TOO_LARGE');
        let authoritative=[];
        for(let offset=0;offset<records.length;offset+=100){
          if(!authorized()||client.getSnapshot().role!=='owner'||!await acquireLease())throw error('SYNC_BUSY');
          const requested=records.slice(offset,offset+100),reply=await client.request('sync.inspect',{records:requested},{authenticated:true});
          if(reply?.ok!==true)throw error('INVALID_SYNC_RESPONSE');const values=changesValid(reply.changes,{allowMissing:true});
          if(values.length!==requested.length||requested.some(item=>!values.some(value=>value.store===item.store&&sameId(value.id,item.id))))throw error('INVALID_SYNC_RESPONSE');
          authoritative.push(...values);
        }
        if(strategy==='server')authoritative=await materialize(authoritative,new Map(),true);
        if(!authorized()||client.getSnapshot().role!=='owner'||!await acquireLease())throw error('OWNER_REQUIRED');
        const remote=new Map(authoritative.map(change=>[recordKey(change.store,change.id),change]));
        // A user can correct a blocked record in a later local batch. Their
        // explicit local choice sends the final state, not the invalid interim
        // invoice number or other superseded values. Originals remain archived.
        const latest=new Map();for(const batch of group.batches)for(const op of batch.operations)latest.set(recordKey(op.store,op.id),op);
        const first=group.batches[0],replacementId=uuid(),origins=new Set(group.batches.map(batch=>batch.origin??'live'));
        const origin=origins.size===1?(first.origin??'live'):'live';
        const replacement=[{...first,id:'batch:'+String(first.ordinal).padStart(20,'0')+':'+replacementId,batchId:replacementId,origin,status:'pending',error:null,
          operations:[...latest].map(([key,op])=>({...op,baseRevision:remote.get(key).revision}))}];
        const history={id:'history:'+uuid(),scope:binding.scope,resolved:true,reason:'CONFLICT_RESOLVED',strategy,resolvedAt:now(),requestedBatchId:batchId,originalBatches:group.batches,authoritative};
        await scopedTransaction([OUTBOX,META,CONFLICTS,...new Set(records.map(row=>row.store))],'readwrite',(tx,set,fail)=>{
          const metadata=tx.objectStore(META),head=metadata.get(scopeMetaId(binding.scope));
          head.onsuccess=()=>{
            if(head.result?.nextOrdinal!==original.head?.nextOrdinal){fail(error('SYNC_QUEUE_CHANGED'));return;}
            for(const batch of group.batches){const check=tx.objectStore(OUTBOX).get(batch.id);check.onsuccess=()=>{if(check.result?.batchId!==batch.batchId)fail(error('SYNC_QUEUE_CHANGED'));};}
            tx.objectStore(CONFLICTS).put(history);
            for(const batch of group.batches)tx.objectStore(OUTBOX).delete(batch.id);
            if(strategy==='local')for(const batch of replacement)tx.objectStore(OUTBOX).put(batch);
            for(const {store,id}of records){const key=recordKey(store,id),change=remote.get(key),metaId=recordMetaId(binding.scope,store,id),req=metadata.get(metaId);
              req.onsuccess=()=>{try{
                const previous=req.result;if(!previous||previous.pending.some(id=>!ids.has(id)))throw error('SYNC_QUEUE_CHANGED');
                const pending=strategy==='local'?replacement.filter(batch=>batch.operations.some(op=>recordKey(op.store,op.id)===key)).map(batch=>batch.batchId):[];
                metadata.put({...previous,revision:change.revision,pending,deleted:change.deleted});
                if(strategy==='server'){if(change.deleted)tx.objectStore(store).delete(id);else tx.objectStore(store).put(change.value);}
              }catch(cause){fail(cause);}};
            }
            const conflicts=tx.objectStore(CONFLICTS),cursor=conflicts.openCursor();cursor.onsuccess=()=>{
              const row=cursor.result;if(!row)return;const value=row.value;
              if(!value.resolved&&value.scope===binding.scope&&(ids.has(value.batchId)||value.batchIds?.some(id=>ids.has(id))))conflicts.delete(row.primaryKey);
              row.continue();
            };set(true);
          };
        });
        if(strategy==='server')notifyRemote(authoritative);await counts();publish({connection:state.conflicts?'conflict':'idle',lastError:null});
        return {resolved:true,strategy,batchCount:group.batches.length,recordCount:records.length,historyId:history.id};
      }catch(cause){publish({connection:'conflict',lastError:cause.code||'CONFLICT_RESOLUTION_FAILED'});throw cause;}
      finally{if(leased)await releaseLease().catch(()=>{});resolving=false;schedule(0);}
    }
    return Object.freeze({start,stop,linkedScope,writeStores,enqueue,afterCommit,syncNow,getSnapshot:snapshot,subscribe,listConflicts,resolveConflict,exportConflict});
  }
  return Object.freeze({STORES,BUSINESS,upgrade,create});
});
