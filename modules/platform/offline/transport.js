/* Authenticated module RPCs. The server owns records and receipts. */
(function(root, factory) {
  'use strict';
  const lib = root.WFModuleStore || (typeof require === 'function' && require('./store.js'));
  const delta = root.WFModuleDelta || (typeof require === 'function' && require('../delta.js'));
  const api = factory(root,lib,delta);
  root.WFModuleTransport = api;
  if (typeof module==='object' && module.exports) module.exports=api;
})(typeof window==='object'?window:globalThis,function(root,Store,Delta) {
  'use strict';
  const fail=Store.failure, key=Store.key, MiB=1024*1024;
  const uuidPattern=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
  const hashPattern=/^[a-f0-9]{64}$/;
  const reads={
    'gallery.snapshot':30000,'gallery.orders':15000,'gallery.personal':15000,'gallery.sales':15000,
    'chat.init':60000,'chat.rooms':4500,'chat.feed':4500,'chat.members':10000,
    'files.list':20000,'finance.list':15000,'payroll.list':15000,'metals.list':15000
  };
  const commands=new Set(['gallery.stock','gallery.order.place','gallery.order.update','gallery.sale','gallery.sale.reverse',
    'gallery.preferences','gallery.presentation','chat.send','chat.sendFile','chat.forward','files.upload',
    'finance.resource','finance.transaction','finance.transfer','finance.quote.manual','finance.reverse',
    'payroll.employee','payroll.attendance','payroll.remove','payroll.pay','payroll.reverse',
    'metals.trade','metals.quote.manual','metals.reverse']);
  const binaries=new Set(['files.upload','chat.sendFile']);
  const directReads=new Set(['gallery.image','gallery.command.review','chat.people','chat.info','chat.asset','files.open',
    'files.share','finance.archive','finance.attachment']);
  const noisy=new Set(['chat.typing','chat.draft','chat.read']);
  const family=a=>['finance','payroll','metals'].includes(a.split('.')[0])?'money':a.split('.')[0];
  function permissions(action,p,origin) {
    const result=new Set([origin]), part=action.split('.')[0];
    if (action==='gallery.order.place') {result.add('gallery.view');result.add('myorders.edit');}
    else if (action==='gallery.snapshot') result.add(p.manage?'gallery.edit':'gallery.view');
    else if (action==='gallery.orders') result.add(p.scope==='staff'?'orders.view':'myorders.view');
    else if (['gallery.personal','gallery.sales'].includes(action)) result.add('myorders.view');
    else if (['gallery.stock','gallery.presentation'].includes(action)) result.add('gallery.edit');
    else if (action==='gallery.order.update') result.add(p.archive?'orders.delete':'orders.edit');
    else if (['gallery.sale','gallery.sale.reverse','gallery.preferences'].includes(action)) result.add('myorders.edit');
    else if (part==='chat' || part==='files') {
      if (action==='files.share' || (action==='files.open' && p.download===true)) result.add('files.export');
      else if (Object.hasOwn(reads,action)) result.add(part+'.view');
      else if (commands.has(action)) result.add(part+'.edit');
    } else if (['finance','payroll','metals'].includes(part) && (Object.hasOwn(reads,action)||commands.has(action))) {
      result.add(part+(action.endsWith('.list')?'.view':action.endsWith('.reverse')||action==='payroll.remove'?'.delete':'.edit'));
      if (p.profile?.active===false) result.add(part+'.delete');
      if (p.tab==='customers' || p.party?.type==='customer' && action==='finance.transaction') result.add('customers.view');
      if (p.tab==='invoices') {result.add('invoices.view');result.add('payments.view');}
    }
    return [...result];
  }
  // Include default parameters in the query identity. Keep numeric product IDs distinct from strings.
  function validateIntent(action,p) {
    const version=v=>Number.isSafeInteger(v)&&v>=0;
    if (action==='gallery.stock' && (!Array.isArray(p.rows)||!p.rows.length||p.rows.length>100||!p.rows.every(row=>version(row?.version)))) throw fail('INVALID_GALLERY_INPUT',422);
    if (['gallery.order.update','gallery.presentation','gallery.preferences'].includes(action) && !version(p.version)) throw fail('INVALID_GALLERY_INPUT',422);
    if (action==='gallery.order.place' && (p.accepted!==true||!Array.isArray(p.items)||!p.items.length||p.items.length>100||
      !p.items.every(row=>Number.isSafeInteger(row?.quantity)&&row.quantity>0&&version(row.priceMinor)&&typeof row.currency==='string'))) throw fail('INVALID_GALLERY_INPUT',422);
  }
  function query(action,input) {
    const p={...input}; delete p._known;delete p._sync;delete p.cleanup;
    let defaults={};
    if (action.startsWith('gallery.')) defaults={offset:0,limit:50,...(action==='gallery.snapshot'?{manage:false}:{}),
      ...(action==='gallery.orders'?{scope:'own',status:''}:{})};
    if (action==='chat.feed') defaults={before:null,query:'',starred:false,mentioned:false,kind:null};
    if (action==='files.list') defaults={query:'',sort:'new',kind:null,folderId:null,archived:false,unfiled:false,offset:0};
    if (action.endsWith('.list') && family(action)==='money') defaults={offset:0,limit:50,from:null,to:null,box:null,kind:'',
      currency:null,category:null,party:null,employee:null,search:'',metal:null,period:null,resource:null,base:null};
    for (const [k,v] of Object.entries(defaults)) if (p[k]==null) p[k]=v;
    return p;
  }
  function canonical(value,depth=0) {
    if (depth>32) throw fail('INVALID_DEVICE_PAYLOAD');
    if (value===null || ['string','boolean'].includes(typeof value) || Number.isFinite(value)) return value;
    if (Array.isArray(value)) return value.map(v=>canonical(v,depth+1));
    if (Object.prototype.toString.call(value)!=='[object Object]') throw fail('INVALID_DEVICE_PAYLOAD');
    return Object.fromEntries(Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>[k,canonical(value[k],depth+1)]));
  }
  const protectedName=/^(?:access[_-]?token|refresh[_-]?token|password|setup[_-]?token|authorization|api[_-]?key|service[_-]?role[_-]?key|signed[_-]?url|token|credentials?|secret)$/i;
  const protectedValue=/(?:https?:\/\/[^\s"'<>]*(?:\/storage\/v1\/object\/sign\/|[?&](?:token|signature|sig|x-amz-signature|x-goog-signature)=)|\bBearer [a-z\d._~-]{14,})/i;
  function safe(v,depth=0) {
    if (depth>36) return false;
    if (typeof v==='string') return !protectedValue.test(v);
    if (v===null || typeof v!=='object') return true;
    return Object.entries(v).every(([name,value])=>!protectedName.test(name)&&safe(value,depth+1));
  }
  const diskError=e=>String(e?.code||'').startsWith('DEVICE_STORAGE');
  const denied=e=>!e?.local && ([401,403].includes(e?.status)||['AUTH_REQUIRED','ACCESS_DENIED','PERMISSION_DENIED','SESSION_REVOKED'].includes(e?.code));
  const temporary=e=>!e?.local && (['NETWORK','RATE_LIMITED','SERVICE_UNAVAILABLE'].includes(e?.code)||[408,425,429].includes(e?.status)||e?.status>=500);
  const conflict=e=>e?.status===409 || /(?:CONFLICT|MISMATCH|INVALID_(?:STOCK|PRODUCT_UNAVAILABLE|SOLD_QUANTITY|INSUFFICIENT_BALANCE|METAL_HOLDINGS|PAID_PERIOD|SALARY|REVERSAL|QUOTE))/.test(e?.code||'');
  const retryable=e=>(temporary(e)&&!conflict(e)&&!String(e?.code||'').startsWith('INVALID_'))||
    (e?.code==='INVALID_RESPONSE'&&e?.status>=500);
  const size=v=>new Blob([JSON.stringify(v)]).size;
  const delay=()=>new Promise(resolve=>setTimeout(resolve,0));
  async function decode64(text,limit) {
    if (typeof text!=='string' || !text.length || text.length>Math.ceil(limit/3)*4 || text.length%4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw fail('INVALID_MEDIA');
    const parts=[];
    for (let i=0;i<text.length;i+=65536) {
      const raw=atob(text.slice(i,i+65536)), part=new Uint8Array(raw.length);
      for(let j=0;j<raw.length;j++) part[j]=raw.charCodeAt(j);
      parts.push(part);
      if (i && i%(512*1024)===0) await delay();
    }
    const blob=new Blob(parts);
    if (!blob.size||blob.size>limit) throw fail('INVALID_MEDIA');
    return blob;
  }
  async function encode64(blob) {
    if (typeof root.FileReader==='function') return new Promise((resolve,reject)=>{
      const reader=new root.FileReader();
      reader.onload=()=>resolve(reader.result.slice(reader.result.indexOf(',')+1));
      reader.onerror=()=>reject(fail('DEVICE_DRAFT_DAMAGED'));
      reader.readAsDataURL(blob);
    });
    const bytes=new Uint8Array(await blob.arrayBuffer()), parts=[];
    for(let i=0;i<bytes.length;i+=12288) parts.push(btoa(String.fromCharCode(...bytes.subarray(i,i+12288))));
    return parts.join('');
  }
  async function digest(crypto,bytes) {
    if (!crypto?.subtle) throw fail('DEVICE_STORAGE_UNAVAILABLE');
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  }
  async function pack(action,input,crypto,limit) {
    const source={...input};let blob=null,blobHash=null;
    if (binaries.has(action)) {const data=source.data;delete source.data;blob=await decode64(data,limit);blobHash=await digest(crypto,await blob.arrayBuffer());}
    const fields=canonical(source);
    if (!safe(fields)) throw fail('PRIVATE_DATA_ONLINE_ONLY');
    const encoded=new TextEncoder().encode(JSON.stringify([action,fields,blobHash]));
    return {payload:{fields,blob,blobHash},bytes:encoded.byteLength+(blob?.size||0),fingerprint:await digest(crypto,encoded)};
  }
  async function unpack(payload) {return payload.blob?{...payload.fields,data:await encode64(payload.blob)}:payload.fields;}
  function projection(action,result) {
    if (!safe(result)) return null;
    let value=result;
    // Ephemeral message text, previews, replies and live typing indicators have no offline lifetime.
    if (action==='chat.feed' && (result.typing?.length || result.messages?.some(m=>m.expiresAt||m.reply?.expiresAt))) {
      value={...result,typing:[],messages:result.messages.filter(m=>!m.expiresAt).map(m=>m.reply?.expiresAt?{...m,reply:null}:m)};
    } else if (action==='chat.rooms' && result.rooms?.some(r=>r.last?.expiresAt)) {
      value={...result,rooms:result.rooms.map(r=>r.last?.expiresAt?{...r,last:null}:r)};
    }
    if (value!==result) delete value._deltaState;
    return value;
  }
  function create(options) {
    const {identity,can,remote}=options, crypto=options.crypto||root.crypto, now=options.now||Date.now;
    const db=options.store||Store.create({now});
    const manager=options.storageManager||root.navigator?.storage;
    const isOnline=options.isOnline||(()=>root.navigator?.onLine!==false);
    const visible=options.isVisible||(()=>!root.document?.hidden);
    const later=options.setTimeout||setTimeout, cancel=options.clearTimeout||clearTimeout, random=options.random||Math.random;
    const channel=options.channel===undefined && typeof root.BroadcastChannel==='function'?new root.BroadcastChannel('wf-module-wakeup-v1'):options.channel;
    const listeners=new Set(),receiptListeners=new Set(),readsInFlight=new Map();
    let current=null,transition=Promise.resolve(),timer=null,timerAt=0,disposed=false,agedAt=0,lastBudget;
    let state={online:isOnline(),syncing:false,pending:0,conflicts:0,quarantined:0,failed:0,storage:'available',persistent:null,lastError:''};
    function change(patch) {
      if (Object.entries(patch).every(([k,v])=>state[k]===v)) return;
      state={...state,...patch};
      for(const fn of listeners) try{fn({...state});}catch(_){}
    }
    function storageProblem(error) {
      if (error?.code==='DEVICE_STORAGE_FULL'||error?.code==='DEVICE_QUEUE_FULL') change({storage:'full',lastError:error.code});
      else if (diskError(error)) change({storage:'unavailable',lastError:error.code});
    }
    function check(c,req=[],guard) {
      guard?.();
      if (!c || c!==current || c.id.runtime!==identity()?.runtime || disposed || !req.every(can)) throw fail('AUTH_REQUIRED',401);
    }
    function alive(c,req=[],guard) {return ()=>check(c,req,guard);}
    function pulse(type,id) {try{channel?.postMessage({type,id});}catch(_){}}
    function schedule(ms=100) {
      if (disposed || !current || current.id.offlineVerified || !isOnline() || !visible()) return;
      const at=now()+ms;
      if (timer!==null && timerAt<=at) return;
      if (timer!==null) cancel(timer);
      timerAt=at;timer=later(()=>{timer=null;run().catch(()=>{});},Math.max(0,ms));
    }
    function update() {
      const id=identity();
      if (id?.runtime===current?.id.runtime) {
        if (current && id.verifiedAt>current.id.verifiedAt) {
          current.id=id;
          if (current.blocked) {current.blocked=false;current.binding=null;schedule();}
        }
        return;
      }
      const prev=current;
      current=id?{id,binding:null,blocked:false,downloads:new Map(),running:null,rows:[],readFloor:0}:null;
      if (timer!==null) cancel(timer);timer=null;readsInFlight.clear();
      const mayResume=prev?.id.offlineVerified && (!id || prev.id.owner===id.owner && prev.id.scope===id.scope);
      if (prev?.binding && !mayResume) {
        transition=transition.catch(()=>{}).then(async()=>{
          const b=await prev.binding.catch(()=>null);
          if (b) {await db.revoke(b,'ACCESS_CHANGED');pulse('revoked');}
        }).catch(storageProblem);
      }
      change({syncing:false,pending:0,conflicts:0,failed:0,quarantined:0,lastError:'',online:isOnline()&&!current?.id.offlineVerified});
      if (current) {const c=current;refreshCounts(c).catch(storageProblem);schedule(150);}
    }
    async function binding(c) {
      check(c);
      if (c.blocked) throw fail('ACCESS_REVALIDATION_REQUIRED',403);
      if (!c.binding) {
        const promise=transition.then(()=>{check(c);return db.bind(c.id,alive(c));});
        c.binding=promise;
        promise.catch(e=>{if (c.binding===promise) c.binding=null;if (e.code==='ACCESS_REVALIDATION_REQUIRED') c.blocked=true;});
      }
      const b=await c.binding; check(c); return b;
    }
    async function budgets() {
      if (lastBudget && now()-agedAt<60000) return lastBudget;
      let cap=Infinity;
      try {const result=await manager?.estimate?.();if (Number.isFinite(result?.quota)) cap=Math.max(0,result.quota);}catch(_){}
      lastBudget={cache:Math.min(db.limits.cacheBytes,cap*.02),queue:Math.min(db.limits.queueBytes,cap*.04)};
      agedAt=now();return lastBudget;
    }
    function summary(row) {
      return {queueId:row.id,action:row.action,[row.idField]:row.commandKey,status:row.status,
        createdAt:new Date(row.createdAt).toISOString(),...(row.errorCode?{errorCode:row.errorCode}:{}),
        ...(row.status!=='quarantined' && row.rooms?.[0]?{roomId:row.rooms[0]}:{}),...(row.status!=='quarantined' && row.fileName?{fileName:row.fileName}:{})};
    }
    function permitted(c,row,origin) {
      return row.owner===c.id.owner && (!origin||row.origin===origin) && row.required.every(can);
    }
    function recounted(rows) {
      const n=count=>rows.filter(r=>r.status===count).length;
      return {pending:n('pending'),conflicts:n('conflict'),quarantined:n('quarantined'),failed:n('failed')};
    }
    async function refreshCounts(c) {
      const b=await binding(c),rows=await db.list(b,alive(c));check(c);
      c.rows=rows.filter(row=>row.status!=='posted' && permitted(c,row));
      change(recounted(c.rows));
    }
    function notifyReceipt(c,row,liveResult) {
      if (!permitted(c,row) || !['posted','conflict','failed'].includes(row.status)) return;
      const value={...summary(row),result:liveResult||row.result||null};
      for (const {fn,origin,guard} of receiptListeners) try {
        check(c,row.required,guard);if (row.origin===origin) fn(value);
      } catch(_){}
    }
    async function quarantine(c,b,error) {
      if (c===current) {c.blocked=true;c.downloads.clear();readsInFlight.clear();change({lastError:error.code||'ACCESS_DENIED'});}
      if (b) await db.revoke(b,error.code||'ACCESS_DENIED').catch(storageProblem);
      if (c===current) {c.binding=null;c.rows=[];change(recounted([]));}
      pulse('revoked');options.onBindingRevoked?.();
    }
    async function contact(c,b,action,p,required,guard) {
      check(c,required,guard);
      if (c.id.offlineVerified || !isOnline()) throw Object.assign(Error('NETWORK'),{code:'NETWORK',status:0});
      try {
        const verify=alive(c,required,guard);
        const fenced=b && (Object.hasOwn(reads,action)||commands.has(action)||action==='files.open');
        if (fenced) await db.assert(b,verify);
        verify();const value=await remote(action,p,verify);
        verify();if (fenced) await db.assert(b,verify);
        verify();change({online:true});
        return value;
      } catch(error) {
        if (denied(error)) await quarantine(c,b,error);
        else if (c===current && error.code==='NETWORK') change({online:false,lastError:'NETWORK'});
        throw error;
      }
    }
    async function durable(c,b,work,guard) {
      try {return await work();}
      catch(error) {
        if (error.code!=='DEVICE_STORAGE_FULL') throw error;
        await db.evict(b,guard);check(c);
        return work();
      }
    }
    const mark=(value,source,stale,time)=>({...value,_sync:{source,stale,cachedAt:new Date(time).toISOString()}});
    async function read(c,b,action,p,required,guard,force,retry=0) {
      const normalized=query(action,p), encoded=JSON.stringify(canonical(normalized)), f=family(action);
      const id=key(c.id.owner,'page',action,encoded), verify=alive(c,required,guard);
      let cached={version:0};
      if (b && safe(normalized) && encoded.length<=12000) {
        try {cached=await db.read(b,id,f,verify);}catch(e){if (!diskError(e)) throw e;storageProblem(e);b=null;}
      } else b=null;
      verify();
      const fresh=cached.value && cached.row.version===cached.version && cached.row.cachedAt>=c.readFloor &&
        now()>=cached.row.cachedAt && now()-cached.row.cachedAt<reads[action];
      if (c.id.offlineVerified || !isOnline() || fresh && !force) {
        if (!cached.value) throw fail('OFFLINE_NOT_CACHED');
        return mark(cached.value,'device',!!c.id.offlineVerified||!isOnline()||!state.online||!fresh,cached.row.cachedAt);
      }
      const pass={...normalized};
      if (action==='files.list' && p.cleanup===true) pass.cleanup=true;
      const known=cached.value?._deltaState;
      if (known?.rows && Object.keys(known.rows).length<=500 && Delta?.applyDelta) pass._known=known;
      let server;
      try {
        let answer;
        try {answer=await contact(c,b,action,pass,required,guard);
          server=Delta?.applyDelta?Delta.applyDelta(cached.value,answer):answer;
          if (server?._delta) throw Error('STALE_DELTA');
        } catch(error) {
          if (!pass._known || !['STALE_DELTA','INVALID_DELTA'].includes(error.code||error.message)) throw error;
          delete pass._known;answer=await contact(c,b,action,pass,required,guard);
          if (answer?._delta) throw fail('INVALID_DELTA');
          server=answer;
        }
      } catch(error) {
        verify();
        if (retryable(error)) {
          if (cached.value && b) {
            const latest=await db.read(b,id,f,verify);verify();
            if (latest.value) return mark(latest.value,'device',true,latest.row.cachedAt);
          }
          if (error.code==='NETWORK') throw fail('OFFLINE_NOT_CACHED');
        }
        throw error;
      }
      const timestamp=now();verify();
      if (b) {
        const value=projection(action,server), bytes=value?size(value):0;
        const rooms=action==='chat.rooms' && Array.isArray(server.rooms)?new Set(server.rooms.map(r=>r.id)):undefined;
        const config=await budgets();verify();
        const row={id,kind:'page',family:f,action,roomId:normalized.roomId||null,bytes,cachedAt:timestamp};
        try {
          const saved=await durable(c,b,()=>db.writeCache(b,row,value,{budget:config.cache,version:cached.version,
            previous:cached.row?.stamp,rooms},verify),verify);
          if (saved==='changed') {
            if (retry===0) return read(c,b,action,p,required,guard,true,1);
            throw fail('PROJECTION_CHANGED');
          }
          if (saved==='raced') {
            const winner=await db.read(b,id,f,verify);verify();
            if (winner.value && winner.row.version===winner.version) return mark(winner.value,'device',false,winner.row.cachedAt);
            if (!retry) return read(c,b,action,p,required,guard,true,1);
            throw fail('PROJECTION_CHANGED');
          }
          if (rooms && c.rows.length) await refreshCounts(c);
        } catch(error) {if (!diskError(error)) throw error;storageProblem(error);}
      }
      verify();return mark(server,'server',false,timestamp);
    }
    const leaseMs=60000;
    async function drain(c) {
      const b=await binding(c);
      let due=0;
      try {
        for (let i=0;i<8 && isOnline() && visible();i++) {
          const item=await db.claim(b,leaseMs,alive(c));check(c);
          if (!item.row) {due=item.due||0;break;}
          const row=item.row, verify=alive(c,row.required);
          if (!row.required.every(can)) {
            await db.settle(b,row,{status:'quarantined',errorCode:'ACCESS_CHANGED'},alive(c));continue;
          }
          change({syncing:true});
          let outcome,result;
          try {
            const wire=await unpack(item.payload);verify();
            result=await contact(c,b,row.action,wire,row.required);
            if (!result || typeof result!=='object' || result.queued===true) throw Object.assign(Error('INVALID_RESPONSE'),{code:'INVALID_RESPONSE',status:502});
            const receipt=safe(result)&&size(result)<=db.limits.receiptBytes?result:{ok:true,requiresRefresh:true};
            outcome={status:'posted',result:receipt,errorCode:''};
          } catch(error) {
            if (denied(error) || error.local && error.status===401 || c!==current) throw error;
            if (retryable(error)) {
              const jitter=0.75+random()*.5;
              const backoff=Math.min(300000,1500*2**Math.min(row.attempts,8));
              due=now()+Math.round(jitter*backoff);
              outcome={status:'pending',nextAt:due,errorCode:error.code||'NETWORK'};
            } else outcome={status:conflict(error)?'conflict':'failed',errorCode:error.code||'COMMAND_REJECTED',errorStatus:error.status||422};
          }
          verify();
          const updated=await durable(c,b,()=>db.settle(b,row,outcome,verify),verify);
          if (updated && updated.status!=='pending') {
            notifyReceipt(c,updated,result);pulse('receipt',row.id);
          }
          if (due) break;
          if (i===7) due=now()+200;
        }
      } finally {
        if (c===current && !c.blocked) {
          await refreshCounts(c).catch(storageProblem);
          if (c===current) {
            change({syncing:false});
            if (due) schedule(Math.max(50,due-now()));
          }
        }
      }
    }
    async function run() {
      update();
      const c=current;
      if (!c || c.blocked || c.id.offlineVerified || !visible() || !isOnline()) return;
      if (!c.running) {
        const task=drain(c);
        c.running=task;
        task.catch(error=>{
          storageProblem(error);
          if (c===current && diskError(error) && c.rows.some(r=>r.status==='pending')) schedule(leaseMs);
        }).finally(()=>{if (c.running===task) c.running=null;});
      }
      await c.running;
    }
    async function submit(c,b,action,p,required,origin,guard) {
      const idField=action.startsWith('files.')||action.startsWith('chat.')?'requestId':'commandId';
      const commandKey=p[idField];validateIntent(action,p);
      if (typeof commandKey!=='string'||!uuidPattern.test(commandKey)) throw fail('INVALID_COMMAND_ID',422);
      const verify=alive(c,required,guard), options=await budgets();verify();
      let prepared;
      try { prepared=await pack(action,p,crypto,db.limits.blobBytes); }
      catch(error) {
        if (error.code==='PRIVATE_DATA_ONLINE_ONLY' && isOnline()) {
          const result=await contact(c,b,action,p,required,guard);verify();
          await db.dirty(b,family(action),{},verify);return result;
        }
        throw error;
      }
      verify();
      const row=await durable(c,b,()=>db.enqueue(b,{
        idField,commandKey:commandKey.toLowerCase(),origin,required,action,family:family(action),fingerprint:prepared.fingerprint,bytes:prepared.bytes,
        rooms:[p.roomId,p.sourceRoomId].filter(Boolean),fileName:binaries.has(action)?String(p.name||'').slice(0,180):null
      },prepared.payload,options.queue,verify),verify);
      verify();
      if (row.status==='pending') {
        if (state.storage!=='available') change({storage:'available',lastError:''});
        await refreshCounts(c);verify();pulse('queued');
        if (!c.id.offlineVerified && isOnline() && visible()) {
          try {await run();} catch(error){if (!diskError(error)) throw error;storageProblem(error);}
        }
      }
      verify();
      const final=await db.job(b,row.id,verify);
      verify();
      if (final?.status==='posted') return final.result||{ok:true,requiresRefresh:true};
      if (final && final.status!=='pending') throw fail(final.errorCode||'DRAFT_REVIEW_REQUIRED',final.errorStatus||409);
      if (!final) throw fail('DRAFT_UNAVAILABLE');
      schedule(100);
      return {queued:true,queueId:row.id,[idField]:commandKey};
    }
    function grantDownload(c,p,handle,version) {
      if (p.download!==true||!uuidPattern.test(p.fileId)||!hashPattern.test(handle?.digest||'')) return;
      const until=Date.parse(handle.expiresAt);
      if (!Number.isFinite(until)||until<=now()) return;
      for (const [id,entry] of c.downloads) if (entry.until<=now()) c.downloads.delete(id);
      if (c.downloads.size>=64) c.downloads.delete(c.downloads.keys().next().value);
      // Keep the short-lived permission proof in memory. The signed URL is never retained.
      c.downloads.set(p.fileId,{version,digest:handle.digest,name:handle.name,mime:handle.mime,until:Math.min(until,now()+60000)});
    }
    let viewSequence=0;
    function view(origin,mounted=()=>true) {
      update();const c=current,viewId=++viewSequence,subscriptions=new Set();
      let released=false;
      const guard=()=>{if (released || !mounted()) throw fail('AUTH_REQUIRED',401);};
      const validate=alive(c,[origin],guard);
      async function rpc(action,input={},mode={}) {
        validate();
        if (typeof action!=='string' || !input || typeof input!=='object' || Array.isArray(input)) throw fail('INVALID_REQUEST',422);
        const p={...input};delete p._known;delete p._sync;
        const required=permissions(action,p,origin), verify=alive(c,required,guard);
        verify();
        let b;
        try {
          if (commands.has(action) || Object.hasOwn(reads,action)) {
            try {b=await binding(c);}catch(error){if (!diskError(error)||commands.has(action)) throw error;storageProblem(error);}
          }
          verify();
          if (commands.has(action)) return await submit(c,b,action,p,required,origin,guard);
          if (Object.hasOwn(reads,action)) {
            const forced=mode?.refresh===true||p.cleanup===true;
            const id=key(viewId,action,canonical(query(action,p)),forced);
            if (!readsInFlight.has(id)) {
              const task=read(c,b,action,p,required,guard,forced);
              readsInFlight.set(id,task);
              task.finally(()=>{if (readsInFlight.get(id)===task) readsInFlight.delete(id);}).catch(()=>{});
            }
            const value=await readsInFlight.get(id);verify();return value;
          }
          // Each online-only operation goes straight to the authenticated endpoint.
          // Reuse an existing binding solely for revocation and local invalidation.
          b=c.binding?await c.binding.catch(()=>null):null;
          const downloadVersion=b && action==='files.open' && p.download===true?await db.version(b,'files',verify):null;
          const value=await contact(c,b,action,p,required,guard);
          if (downloadVersion!==null) grantDownload(c,p,value,downloadVersion);
          if (b && ['chat','gallery','files','money'].includes(family(action)) && !directReads.has(action) && !noisy.has(action)) {
            const purgeFamily=['chat.member','chat.room.delete','chat.clear','chat.hide','chat.delete','chat.edit','files.delete'].includes(action);
            try {await db.dirty(b,family(action),{purgeFamily,blobIds:action==='files.delete'?p.ids:[]},verify);}
            catch(error){if (!diskError(error)) throw error;storageProblem(error);}
          }
          verify();return value;
        } catch(error){
          if (error.code==='SCOPE_CHANGED' && c===current) {
            c.blocked=true;c.binding=null;c.downloads.clear();c.rows=[];change({...recounted([]),lastError:'ACCESS_DENIED'});options.onBindingRevoked?.();
          }
          storageProblem(error);throw error;
        }
      }
      function connection() {
        validate();return {...state,online:!c.id.offlineVerified&&state.online,offlineVerified:!!c.id.offlineVerified,
          verifiedAt:c.id.verifiedAt,...recounted(c.rows.filter(r=>permitted(c,r,origin)))};
      }
      function watch(fn,receipts=false) {
        validate();
        const fnGuard=()=>{try{validate();}catch(_){return false;}return true;};
        let last=JSON.stringify(connection());
        const wrapper=receipts?{origin,guard,fn}:()=>{
          if (!fnGuard()) return;
          const snap=connection(), serialized=JSON.stringify(snap);
          if (serialized!==last) {last=serialized;fn(snap);}
        };
        const collection=receipts?receiptListeners:listeners;
        collection.add(wrapper);
        const off=()=>{collection.delete(wrapper);subscriptions.delete(off);};
        subscriptions.add(off);return off;
      }
      async function listOutbox() {
        validate();const b=await binding(c),rows=await db.list(b,validate);validate();
        return rows.filter(r=>r.status!=='posted'&&permitted(c,r,origin)).sort((a,b)=>a.ordinal-b.ordinal).map(summary);
      }
      async function getDraft(id) {
        validate();const b=await binding(c),row=await db.job(b,id,validate);validate();
        if (!row || !permitted(c,row,origin)) throw fail('DRAFT_UNAVAILABLE');
        if (row.status==='quarantined') {
          // A narrower grant or room ban can outlive a sign-in. Only the authenticated
          // author can recover this draft, after current server authorization.
          if (c.id.offlineVerified||!isOnline()) throw fail('DRAFT_REVALIDATION_REQUIRED');
          for (const permission of row.required) await contact(c,b,'permissions.assert',{permission},row.required,guard);
          for (const roomId of row.rooms||[]) await contact(c,b,'chat.members',{roomId},row.required,guard);
        }
        const item=await db.draft(b,id,alive(c,row.required,guard));validate();
        return {...summary(row),fileName:row.fileName||null,payload:item.payload.fields,blob:item.payload.blob||null};
      }
      async function discardDraft(id) {
        validate();const b=await binding(c),row=await db.job(b,id,validate);validate();
        if (!row || !permitted(c,row,origin)) throw fail('DRAFT_UNAVAILABLE');
        await db.discard(b,id,alive(c,row.required,guard));if(state.storage==='full')change({storage:'available',lastError:''});await refreshCounts(c);validate();pulse('check');
      }
      async function syncNow() {
        validate();
        if(c.id.offlineVerified)throw fail('CLOUD_SIGN_IN_REQUIRED');
        if (!isOnline()) throw fail('NETWORK');
        if (c.blocked && options.verifySession) {await options.verifySession();update();validate();}
        c.readFloor=now();
        await run();validate();return connection();
      }
      async function requestPersistence() {
        validate();
        if (root.navigator?.userActivation && !root.navigator.userActivation.isActive) throw fail('USER_GESTURE_REQUIRED');
        const result=typeof manager?.persist==='function'?await manager.persist():false;
        validate();change({persistent:!!result});return !!result;
      }
      async function fileGet(id) {
        const verify=alive(c,[origin,'files.view'],guard);verify();
        if (origin!=='files.view'||!uuidPattern.test(id)) throw fail('ACCESS_DENIED',403);
        const b=await binding(c),entry=await db.read(b,key(b.owner,'file',id),'files',verify);verify();
        return entry.value?{...entry.value,cachedAt:new Date(entry.row.cachedAt).toISOString()}:null;
      }
      async function filePut(id,input) {
        const verify=alive(c,[origin,'files.view','files.export'],guard);verify();
        const grant=c.downloads.get(id), blob=input?.blob;
        if (origin!=='files.view' || !grant || grant.until<=now() || grant.digest!==input.digest ||
            !(blob instanceof Blob) || !blob.size || blob.size>db.limits.blobBytes ||
            input.contentType!==grant.mime || input.fileName!==grant.name) throw fail('DOWNLOAD_PROOF_REQUIRED',403);
        const b=await binding(c), cacheId=key(b.owner,'file',id), snapshot=await db.read(b,cacheId,'files',verify);
        if (snapshot.version!==grant.version) throw fail('DOWNLOAD_PROOF_REQUIRED',403);
        const actual=await digest(crypto,await blob.arrayBuffer());verify();
        if (actual!==grant.digest) throw fail('FILE_DIGEST_MISMATCH',422);
        if (c.downloads.get(id)!==grant) throw fail('DOWNLOAD_PROOF_REQUIRED',403);
        const config=await budgets();verify();
        const value={blob,fileName:grant.name,contentType:grant.mime,digest:actual};
        const meta={id:cacheId,fileId:id,kind:'blob',family:'files',bytes:blob.size+512,cachedAt:now()};
        try {
          const result=await durable(c,b,()=>db.writeCache(b,meta,value,{budget:config.cache,version:snapshot.version,
            previous:snapshot.row?.stamp},verify),verify);
          verify();if (result!=='stored') throw fail('DEVICE_BLOB_NOT_STORED');
          c.downloads.delete(id);
        } catch(error){storageProblem(error);throw error;}
      }
      return Object.freeze({request:rpc,getConnection:connection,subscribeConnection:fn=>watch(fn),subscribeReceipts:fn=>watch(fn,true),
        listOutbox,getDraft,discardDraft,syncNow,requestPersistence,localFiles:Object.freeze({get:fileGet,put:filePut}),
        dispose(){released=true;for(const off of [...subscriptions]) off();}});
    }
    function resumed() {
      update();if (current) current.readFloor=now();
      change({online:isOnline()&&!current?.id.offlineVerified});
      if (!visible()||!isOnline()) {if(timer!==null)cancel(timer);timer=null;return;}
      schedule(100);
    }
    async function received(event) {
      const c=current;if (!c||!['revoked','check','queued','receipt'].includes(event.data?.type)||(!visible()&&event.data.type!=='revoked')) return;
      try {
        const b=await binding(c);
        if (event.data.type==='revoked') {await db.assert(b,alive(c));return;}
        if (event.data.type==='receipt' && uuidPattern.test(event.data.id)) {
          const row=await db.job(b,event.data.id,alive(c));if (row && row.seal===b.seal) notifyReceipt(c,row);
        }
        await refreshCounts(c);if (c.rows.some(r=>r.status==='pending')) schedule(180);
      } catch(e){
        if(c===current && ['SCOPE_CHANGED','ACCESS_REVALIDATION_REQUIRED'].includes(e.code)){
          c.blocked=true;c.binding=null;c.rows=[];c.downloads.clear();change({...recounted([]),lastError:'ACCESS_DENIED'});options.onBindingRevoked?.();
        }else storageProblem(e);
      }
    }
    function start() {
      root.addEventListener?.('online',resumed);root.addEventListener?.('offline',resumed);
      root.addEventListener?.('pageshow',resumed);root.document?.addEventListener?.('visibilitychange',resumed);
      if (channel) channel.onmessage=received;
      if (manager?.persisted) Promise.resolve(manager.persisted()).then(p=>change({persistent:!!p})).catch(()=>{});
      update();
    }
    function dispose() {
      disposed=true;if (timer!==null) cancel(timer);
      root.removeEventListener?.('online',resumed);root.removeEventListener?.('offline',resumed);root.removeEventListener?.('pageshow',resumed);
      root.document?.removeEventListener?.('visibilitychange',resumed);
      channel?.close?.();listeners.clear();receiptListeners.clear();readsInFlight.clear();
    }
    return Object.freeze({view,update,start,dispose,resumed,run});
  }
  return Object.freeze({create,permissions,query});
});
