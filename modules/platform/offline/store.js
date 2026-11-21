/* One bounded IndexedDB for private module projections and the durable command outbox.
   Transactions read compact indexes. Large command payloads and blobs have separate stores. */
(function(root, factory) {
  'use strict';
  const api = factory(root);
  root.WFModuleStore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'object' ? window : globalThis, function(root) {
  'use strict';
  const MiB = 1024 * 1024;
  const limits = Object.freeze({cacheBytes:32*MiB, queueBytes:32*MiB, pageBytes:1024*1024, blobBytes:8*MiB,
    commandBytes:12*MiB, cacheEntries:180, queueEntries:160, receipts:100, receiptBytes:48*1024, receiptAge:7*86400000});
  const failure = (code,status=0) => Object.assign(Error(code), {code,status,local:true});
  const key = (...parts) => JSON.stringify(parts);
  const request = req => new Promise((resolve,reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  function storageError(err) {
    if (err?.code && typeof err.code === 'string') return err;
    return failure(err?.name === 'QuotaExceededError' ? 'DEVICE_STORAGE_FULL' : 'DEVICE_STORAGE_UNAVAILABLE');
  }
  function create(options={}) {
    let factory;
    try {factory=options.indexedDB || root.indexedDB;} catch (_) {}
    const now = options.now || Date.now;
    const uuid = options.uuid || (() => root.crypto.randomUUID());
    const max = {...limits,...options.limits};
    let opened;
    function open() {
      if (opened) return opened;
      opened = new Promise((resolve,reject) => {
        if (!factory) throw failure('DEVICE_STORAGE_UNAVAILABLE');
        let blocked=false;
        const req = factory.open(options.name || 'MarkRobotPrivateModules_v1',2);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('grantState')) db.createObjectStore('grantState',{keyPath:'id'});
          if (db.objectStoreNames.contains('bindings')) return;
          db.createObjectStore('bindings',{keyPath:'owner'});
          for (const name of ['cache','content','jobs','payload']) {
            const store = db.createObjectStore(name,{keyPath:'id'});
            if (name === 'cache' || name === 'jobs') store.createIndex('owner','owner');
            if (name === 'jobs') store.createIndex('intent','intent',{unique:true});
          }
        };
        req.onerror = () => reject(storageError(req.error));
        req.onblocked = () => {blocked=true;reject(failure('DEVICE_STORAGE_BLOCKED'));};
        req.onsuccess = () => {
          const db = req.result;
          if(blocked){db.close();return;}
          db.onversionchange = () => { db.close(); opened = null; };
          resolve(db);
        };
      }).catch(error => { opened = null; throw storageError(error); });
      return opened;
    }
    // Only IndexedDB requests are awaited inside a transaction. Crypto and network I/O finish outside it.
    async function tx(names,mode,run,guard=()=>{}) {
      const db = await open(); guard();
      const stores = [...new Set(['bindings',...names])];
      let transaction;
      try { transaction = db.transaction(stores,mode,mode === 'readwrite' ? {durability:'strict'} : {}); }
      catch (error) {
        if (error.name !== 'TypeError' && !(error instanceof TypeError)) throw storageError(error);
        transaction = db.transaction(stores,mode);
      }
      let value,cause;
      const done = new Promise((resolve,reject) => {
        transaction.oncomplete = () => resolve(value);
        transaction.onabort = () => reject(cause || storageError(transaction.error));
        transaction.onerror = () => {};
      });
      const s = Object.fromEntries(stores.map(name => [name,transaction.objectStore(name)]));
      try { value = await run(s); guard(); }
      catch (error) { cause = storageError(error); try { transaction.abort(); } catch (_) {} }
      return done;
    }
    async function scoped(b,names,mode,run,guard) {
      return tx(names,mode,async s => {
        const live = await request(s.bindings.get(b.owner));
        if (!live || live.seal !== b.seal || live.scope !== b.scope || live.frozen) throw failure('SCOPE_CHANGED',401);
        guard?.();
        return run(s,live);
      },guard);
    }
    const owned = (store,owner) => request(store.index('owner').getAll(owner));
    function dropCache(s,row) { s.cache.delete(row.id); s.content.delete(row.id); }
    function dropJob(s,row) { s.jobs.delete(row.id); s.payload.delete(row.id); }
    async function quarantine(s,owner,reason) {
      for (const row of await owned(s.cache,owner)) dropCache(s,row);
      for (const row of await owned(s.jobs,owner)) {
        if (row.status === 'posted') dropJob(s,row);
        else if (row.status !== 'quarantined') s.jobs.put({...row,status:'quarantined',lease:null,errorCode:reason});
      }
    }
    const privateStores = ['cache','content','jobs','payload','grantState'];
    async function bind(identity,guard) {
      return tx(privateStores,'readwrite',async s => {
        const old = await request(s.bindings.get(identity.owner));
        if (identity.offlineVerified) {
          if (!old || old.frozen || old.seal!==identity.grantSeal || old.scope!==identity.scope || !old.grantSlot) throw failure('ACCESS_REVALIDATION_REQUIRED',403);
          return {owner:old.owner,scope:old.scope,seal:old.seal};
        }
        if (old && (identity.cloudVersion < old.cloudVersion || identity.localVersion < old.localVersion)) throw failure('SCOPE_CHANGED',401);
        if (old?.frozen && identity.cloudVersion===old.cloudVersion && identity.verifiedAt <= old.frozenAt) throw failure('ACCESS_REVALIDATION_REQUIRED',403);
        if (old && old.scope !== identity.scope && old.cloudVersion === identity.cloudVersion &&
            old.localVersion === identity.localVersion && identity.verifiedAt <= old.verifiedAt) throw failure('ACCESS_REVALIDATION_REQUIRED',403);
        if (old && !old.frozen && old.scope === identity.scope) {
          if (old.verifiedAt < identity.verifiedAt) s.bindings.put({...old,verifiedAt:identity.verifiedAt});
          return {owner:old.owner,scope:old.scope,seal:old.seal};
        }
        if (old) {await quarantine(s,identity.owner,'ACCESS_CHANGED');await removeGrant(s,old);}
        const next = {owner:identity.owner,scope:identity.scope,seal:uuid(),cloudVersion:identity.cloudVersion,
          localVersion:identity.localVersion,verifiedAt:identity.verifiedAt,seq:old?.seq||0,versions:{},frozen:false};
        s.bindings.put(next);
        return {owner:next.owner,scope:next.scope,seal:next.seal};
      },guard);
    }
    function revoke(b,reason) {
      return tx(privateStores,'readwrite',async s => {
        const live = await request(s.bindings.get(b.owner));
        if (!live || live.seal !== b.seal) return;
        await quarantine(s,b.owner,reason);await removeGrant(s,live);
        s.bindings.put({...live,seal:uuid(),frozen:true,frozenAt:Math.max(now(),live.verifiedAt)});
      });
    }
    async function removeGrant(s,binding) {
      if (!binding.grantSlot) return;
      const row=await request(s.grantState.get(binding.grantSlot));
      if (row?.seal===binding.seal) s.grantState.delete(binding.grantSlot);
      delete binding.grantSlot;
    }
    function device(candidate,guard) {
      return tx(['grantState'],candidate?'readwrite':'readonly',async s=>{
        const old=await request(s.grantState.get('local-device-v1'));
        if (old||!candidate) return old||null;
        const row={id:'local-device-v1',...candidate};s.grantState.add(row);return row;
      },guard);
    }
    function saveGrant(b,slot,envelope,guard) {
      return scoped(b,['grantState'],'readwrite',async(s,live)=>{
        await removeGrant(s,live);
        s.grantState.put({id:slot,owner:b.owner,scope:b.scope,seal:b.seal,envelope,lastSeen:now()});
        live.grantSlot=slot;s.bindings.put(live);
      },guard);
    }
    function savedGrant(slot,guard) {
      return tx(['grantState'],'readwrite',async s=>{
        const row=await request(s.grantState.get(slot));if (!row) return null;
        const b=await request(s.bindings.get(row.owner));
        if (!b || b.frozen || b.seal!==row.seal || b.scope!==row.scope || b.grantSlot!==slot || now()<row.lastSeen-1000) return null;
        if(now()-row.lastSeen>=1000)s.grantState.put({...row,lastSeen:now()});
        return row;
      },guard);
    }
    async function revokeSlot(slot,reason,guard) {
      return tx(privateStores,'readwrite',async s=>{
        const row=await request(s.grantState.get(slot));if (!row) return false;
        const b=await request(s.bindings.get(row.owner));
        if (!b || b.seal!==row.seal) return false;
        await quarantine(s,b.owner,reason);await removeGrant(s,b);
        s.bindings.put({...b,seal:uuid(),frozen:true,frozenAt:Math.max(now(),b.verifiedAt)});
        return true;
      },guard);
    }
    function read(b,id,family,guard) {
      return scoped(b,['cache','content'],'readwrite',async (s,live) => {
        const row = await request(s.cache.get(id)), version = live.versions[family] || 0;
        if (row?.seal !== b.seal) return {version};
        const value = await request(s.content.get(id));
        if (!value) return {version};
        if (now() - row.touched > 30000) s.cache.put({...row,touched:now()});
        return {version,row,value:value.value};
      },guard);
    }
    // Eviction sees only size/time metadata for the entire origin. Queued payloads are never candidates.
    function writeCache(b,record,value,{budget,version,previous,rooms},guard) {
      return scoped(b,['cache','content','jobs'],'readwrite',async (s,live) => {
        if ((live.versions[record.family]||0) !== version) return 'changed';
        const old = await request(s.cache.get(record.id));
        if ((old?.stamp||null) !== (previous||null)) return 'raced';
        let rows = await request(s.cache.getAll());
        if (rooms) {
          const removed = rows.filter(row => row.owner===b.owner && row.roomId && !rooms.has(row.roomId));
          for (const row of removed) dropCache(s,row);
          rows = rows.filter(row => !removed.includes(row));
          const roster=JSON.stringify([...rooms].sort());
          let revoked=!!removed.length || live.roomRoster!==roster;
          live.roomRoster=roster;
          for (const row of await owned(s.jobs,b.owner)) {
            if (row.status === 'pending' && row.rooms?.some(id => !rooms.has(id))) {
              s.jobs.put({...row,status:'quarantined',lease:null,errorCode:'ROOM_ACCESS_CHANGED'}); revoked = true;
            }
          }
          if (revoked) { live.versions.chat = version+1; s.bindings.put(live); }
        }
        if (!value || record.bytes>budget || record.bytes>(record.kind==='blob'?max.blobBytes:max.pageBytes)) {
          if (old) dropCache(s,old);
          return 'omitted';
        }
        const others = rows.filter(row => row.id!==record.id).sort((a,c) => a.touched-c.touched);
        let used = record.bytes + others.reduce((n,row) => n+row.bytes,0), count=others.length+1;
        for (const row of others) {
          if (used<=budget && count<=max.cacheEntries) break;
          dropCache(s,row); used-=row.bytes; count--;
        }
        s.content.put({id:record.id,value});
        s.cache.put({...record,owner:b.owner,seal:b.seal,version:live.versions[record.family]||0,stamp:uuid(),touched:now()});
        return 'stored';
      },guard);
    }
    function evict(b,guard) {
      return scoped(b,['cache','content'],'readwrite',async s => {
        // Reclaim only this principal's clean data after a real browser quota error.
        for (const row of await owned(s.cache,b.owner)) dropCache(s,row);
      },guard);
    }
    async function invalidate(s,live,family,options={}) {
      live.versions[family] = (live.versions[family]||0)+1;
      s.bindings.put(live);
      if (options.blobIds?.length || options.purgeFamily) {
        const ids = new Set(options.blobIds||[]);
        for (const row of await owned(s.cache,live.owner)) {
          if ((options.purgeFamily && row.kind==='page' && row.family===family) || (row.kind==='blob' && ids.has(row.fileId))) dropCache(s,row);
        }
      }
    }
    function dirty(b,family,details,guard) {
      return scoped(b,['cache','content'],'readwrite',(s,live)=>invalidate(s,live,family,details),guard);
    }
    function enqueue(b,draft,payload,budget,guard) {
      return scoped(b,['jobs','payload'],'readwrite',async (s,live) => {
        const intent = key(b.owner,draft.commandKey), prior = await request(s.jobs.index('intent').get(intent));
        if (prior) {
          if (prior.fingerprint!==draft.fingerprint || prior.action!==draft.action) throw failure('IDEMPOTENCY_MISMATCH',409);
          if (prior.seal!==b.seal || prior.status==='quarantined') throw failure('DRAFT_REVIEW_REQUIRED',409);
          return prior;
        }
        const rows = await request(s.jobs.getAll());
        const pending = rows.filter(row => row.status!=='posted');
        if (pending.length >= max.queueEntries || draft.bytes>max.commandBytes ||
            pending.reduce((n,row) => n+row.bytes,draft.bytes)>budget) throw failure('DEVICE_QUEUE_FULL');
        const receipts = rows.filter(row => row.status==='posted').sort((a,c) => c.finishedAt-a.finishedAt);
        for (const [i,row] of receipts.entries()) if (i>=max.receipts-1 || now()-row.finishedAt>max.receiptAge) dropJob(s,row);
        const row = {...draft,id:uuid(),owner:b.owner,scope:b.scope,seal:b.seal,intent,
          ordinal:++live.seq,createdAt:now(),attempts:0,nextAt:0,lease:null,status:'pending'};
        s.bindings.put(live); s.jobs.add(row); s.payload.add({id:row.id,value:payload});
        return row;
      },guard);
    }
    function list(b,guard) {
      return scoped(b,['jobs'],'readonly',s=>owned(s.jobs,b.owner),guard);
    }
    function job(b,id,guard) {
      return scoped(b,['jobs'],'readonly',async s=>{
        const row=await request(s.jobs.get(id));
        return row?.owner===b.owner ? row : null;
      },guard);
    }
    function draft(b,id,guard) {
      return scoped(b,['jobs','payload'],'readonly',async s=>{
        const row=await request(s.jobs.get(id));
        if (!row || row.owner!==b.owner || row.status==='posted') throw failure('DRAFT_UNAVAILABLE');
        return {row,payload:(await request(s.payload.get(id)))?.value};
      },guard);
    }
    function discard(b,id,guard) {
      return scoped(b,['jobs','payload'],'readwrite',async s=>{
        const row=await request(s.jobs.get(id));
        if (!row || row.owner!==b.owner || !['quarantined','conflict','failed'].includes(row.status)) throw failure('DRAFT_UNAVAILABLE');
        dropJob(s,row);
      },guard);
    }
    function claim(b,leaseMs,guard) {
      return scoped(b,['jobs','payload'],'readwrite',async s=>{
        const row=(await owned(s.jobs,b.owner)).filter(item=>item.seal===b.seal && item.status==='pending')
          .sort((a,c)=>a.ordinal-c.ordinal)[0];
        if (!row) return {};
        const due=Math.max(row.nextAt,row.lease?.until||0);
        if (due>now()) return {due};
        const lease={token:uuid(),until:now()+leaseMs};
        const value=await request(s.payload.get(row.id));
        if (!value) throw failure('DEVICE_DRAFT_DAMAGED');
        s.jobs.put({...row,lease});
        return {row:{...row,lease},payload:value.value};
      },guard);
    }
    function settle(b,claim,outcome,guard) {
      return scoped(b,['jobs','payload','cache','content'],'readwrite',async (s,live)=>{
        const row=await request(s.jobs.get(claim.id));
        if (row?.status!=='pending' || row.lease?.token!==claim.lease.token) return null;
        const next={...row,...outcome,attempts:row.attempts+1,lease:null};
        if (outcome.status==='posted') {
          s.payload.delete(row.id);
          next.bytes=0; next.finishedAt=now();
          const receipts=(await request(s.jobs.getAll())).filter(r=>r.status==='posted').sort((a,c)=>c.finishedAt-a.finishedAt);
          for (const [i,prior] of receipts.entries()) if(i>=max.receipts-1 || now()-prior.finishedAt>max.receiptAge) dropJob(s,prior);
          await invalidate(s,live,row.family);
        }
        s.jobs.put(next);
        return next;
      },guard);
    }
    const assert=(b,guard)=>scoped(b,[],'readonly',()=>true,guard);
    const version=(b,family,guard)=>scoped(b,[],'readonly',(_,live)=>live.versions[family]||0,guard);
    return Object.freeze({open,bind,revoke,device,saveGrant,savedGrant,revokeSlot,assert,version,read,writeCache,evict,dirty,enqueue,list,job,draft,discard,claim,settle,limits:max});
  }
  return Object.freeze({create,limits,key,failure});
});
