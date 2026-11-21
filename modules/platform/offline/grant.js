/* An offline owner grant opens saved projections only. It is never sent as an API credential. */
(function(root,factory){
  'use strict';
  const lib=factory(root);root.WFOfflineOwnerGrant=lib;
  if(typeof module==='object'&&module.exports)module.exports=lib;
})(typeof window==='object'?window:globalThis,function(root){
  'use strict';
  const alg={name:'ECDSA',namedCurve:'P-256'},sig={name:'ECDSA',hash:'SHA-256'};
  const te=new TextEncoder(),td=new TextDecoder(),word=/^[A-Za-z0-9_-]{43}$/,uid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  function retirement(endpoint,who,storage,initialize=false) {
    if(!storage)return null;
    const key='wf_offline_owner_retirement_v1:'+JSON.stringify([endpoint,who.localOwner,who.localEpoch]);
    try{
      let value=storage.getItem(key);
      if(!value&&initialize){storage.setItem(key,root.crypto.randomUUID());value=storage.getItem(key);}
      return value==='initial'||uid.test(value||'')?value:null;
    }catch(_){return null;}
  }
  const validLocal=id=>typeof id==='string'&&/^account_[a-f0-9]{32}$/.test(id);
  const err=()=>Object.assign(Error('OFFLINE_GRANT_INVALID'),{code:'OFFLINE_GRANT_INVALID',local:true});
  const requireValue=v=>{if(!v)throw err();};
  const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  function decode(s) {
    requireValue(typeof s==='string'&&/^[A-Za-z0-9_-]+$/.test(s)&&s.length<16384);
    const bytes=Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
    requireValue(encode(bytes)===s);return bytes;
  }
  function part(jwk) {
    requireValue(jwk?.kty==='EC'&&jwk.crv==='P-256'&&word.test(jwk.x||'')&&word.test(jwk.y||'')&&!('d' in jwk));
    return {crv:'P-256',kty:'EC',x:jwk.x,y:jwk.y};
  }
  const hash=async(crypto,text)=>encode(await crypto.subtle.digest('SHA-256',te.encode(text)));
  const thumb=(crypto,jwk)=>hash(crypto,JSON.stringify(part(jwk)));
  async function verify(envelope,cfg,device,expected,crypto=root.crypto,clock=Date.now) {
    requireValue(cfg?.origin?.startsWith('https://')&&cfg.endpoint?.startsWith('https://')&&word.test(cfg.pin||''));
    const key=part(envelope?.publicKey);requireValue(await thumb(crypto,key)===cfg.pin);
    requireValue(typeof envelope.grant==='string'&&envelope.grant.length<8192);
    const pieces=envelope.grant.split('.');requireValue(pieces.length===3);
    const [h,p,s]=pieces,header=JSON.parse(td.decode(decode(h))),bytes=decode(s);
    requireValue(header.alg==='ES256'&&header.typ==='mark-robot-offline+jwt'&&header.kid===cfg.pin&&Object.keys(header).length===3&&bytes.length===64);
    const publicKey=await crypto.subtle.importKey('jwk',key,alg,false,['verify']);
    requireValue(await crypto.subtle.verify(sig,publicKey,bytes,te.encode(h+'.'+p)));
    const c=JSON.parse(td.decode(decode(p))),now=Math.floor(clock()/1000);
    requireValue(c.v===1&&c.purpose==='module-saved-copies'&&c.role==='owner'&&c.aud===cfg.origin&&c.iss===cfg.endpoint&&
      uid.test(c.workspace||'')&&uid.test(c.sub||'')&&Number.isSafeInteger(c.serverEpoch)&&c.serverEpoch>0&&
      validLocal(c.localOwner)&&c.localOwner===expected.localOwner&&Number.isSafeInteger(c.localEpoch)&&c.localEpoch===expected.localEpoch&&c.localFence===(expected.localFence||'initial')&&
      Number.isSafeInteger(c.iat)&&Number.isSafeInteger(c.exp)&&c.exp>c.iat&&c.exp-c.iat<=86400&&c.iat<=now+30&&now<c.exp&&
      (!c.cloudExpiresAt||Date.parse(c.cloudExpiresAt)>=c.exp*1000)&&
      (!expected.workspace||expected.workspace===c.workspace)&&(!expected.user||expected.user===c.sub)&&
      (!expected.serverEpoch||expected.serverEpoch===c.serverEpoch));
    const permissionHash=await hash(crypto,JSON.stringify([...new Set(cfg.permissionKeys)].sort()));
    requireValue(c.permissionHash===permissionHash && device?.privateKey?.extractable===false && device.privateKey.type==='private' &&
      c.device===await thumb(crypto,device.publicJwk));
    // Validate possession after every restore. Copying the grant and public device metadata is insufficient.
    const nonce=crypto.getRandomValues(new Uint8Array(32));
    const proof=await crypto.subtle.sign(sig,device.privateKey,nonce);
    const publicDevice=await crypto.subtle.importKey('jwk',part(device.publicJwk),alg,false,['verify']);
    requireValue(await crypto.subtle.verify(sig,publicDevice,proof,nonce));return c;
  }
  async function deviceFor(store,crypto,create,guard) {
    let device=await store.device(null,guard);
    if(!device&&create){
      const pair=await crypto.subtle.generateKey(alg,false,['sign','verify']);guard();
      const publicJwk=part(await crypto.subtle.exportKey('jwk',pair.publicKey));guard();
      device=await store.device({privateKey:pair.privateKey,publicJwk},guard);
    }
    return device;
  }
  async function enrollment(device,cfg,who,crypto,clock) {
    const localFence=who.localFence||'initial',at=Math.floor(clock()/1000),id=await thumb(crypto,device.publicJwk);
    const bytes=te.encode(JSON.stringify(['mark-robot-offline-device-v1',cfg.origin,cfg.endpoint,who.localOwner,who.localEpoch,localFence,id,at]));
    return {...who,localFence,at,deviceJwk:device.publicJwk,deviceProof:encode(await crypto.subtle.sign(sig,device.privateKey,bytes))};
  }
  function create({store,cloud,local,config,liveIdentity,notify,crypto=root.crypto,now=Date.now,
    online=()=>root.navigator?.onLine!==false,setTimer=setTimeout,clearTimer=clearTimeout,retirementStore=()=>root.localStorage}) {
    let restored=null,lastSlot='',lastKey='',nextTry=0,inflight=null,timer=null,serial=0,highWater=0;
    const terminal=s=>s.connection==='signed-out'||['AUTH_REQUIRED','SESSION_REVOKED','ACCESS_DENIED','PERMISSION_DENIED','ACCOUNT_UNAVAILABLE','ACCOUNT_REVOKED','SESSION_EXPIRED'].includes(s.lastError);
    function localOwner(initialize=false) {
      const l=local(),a=l?.currentAccount;
      if(!l?.configured||a?.role!=='owner'||a.status!=='active'||!validLocal(a.id)||!Number.isSafeInteger(a.sessionVersion)||
        a.sessionVersion<1||(a.expiresAt&&!(Date.parse(a.expiresAt)>now())))return null;
      const who={localOwner:a.id,localEpoch:a.sessionVersion};
      let storage;try{storage=retirementStore();}catch(_){return null;}
      const fence=retirement(config().endpoint,who,storage,initialize);
      return fence?{...who,localFence:fence}:null;
    }
    function location(who,cfg) {return 'grant:'+JSON.stringify([cfg.endpoint,cfg.origin,who.localOwner,who.localEpoch]);}
    function enabled(cfg){return cfg.enabled===true&&word.test(cfg.pin||'')&&cfg.origin?.startsWith('https://')&&cfg.endpoint?.startsWith('https://');}
    function clear(){restored=null;if(timer!==null)clearTimer(timer);timer=null;}
    function active() {
      if(!restored)return null;
      const c=restored.claims,s=cloud.getSnapshot(),l=localOwner(),cfg=config(),at=now();
      if(!l||!enabled(cfg)||cfg.pin!==restored.pin||l.localOwner!==c.localOwner||l.localEpoch!==c.localEpoch||l.localFence!==c.localFence||
        s.mode!=='local'||s.authenticated||terminal(s)||cfg.endpoint!==c.iss||cfg.origin!==c.aud||
        at/1000>=c.exp||at/1000<c.iat-30||at<highWater-1000||
        (s.userId&&s.userId!==c.sub)||(s.workspaceId&&s.workspaceId!==c.workspace))return null;
      highWater=Math.max(highWater,at);
      return {authenticated:false,offlineVerified:true,mode:'local',connection:'offline',workspaceId:c.workspace,userId:c.sub,role:'owner',
        sessionVersion:c.serverEpoch,authGeneration:'offline-'+c.iat+'-'+restored.seal,lastVerifiedAt:c.iat*1000,offlineExpiresAt:c.exp*1000,
        grantSeal:restored.seal,currentAccount:{id:c.sub,role:'owner',status:'active',permissions:[],sessionVersion:c.serverEpoch,expiresAt:c.cloudExpiresAt}};
    }
    async function update() {
      const cfg=config(),s=cloud.getSnapshot(),who=enabled(cfg)?localOwner(s.authenticated&&s.mode==='local'):null,slot=who&&location(who,cfg);
      if(!enabled(cfg)||s.mode!=='local'||!who){
        if(lastSlot && (!who||s.mode!=='local')) {const prior=lastSlot;lastSlot='';clear();serial++;await store.revokeSlot(prior,'LOCAL_ACCESS_CHANGED').catch(()=>{});}
        return;
      }
      if(lastSlot&&lastSlot!==slot){
        const prior=lastSlot;lastSlot=slot;clear();serial++;
        await store.revokeSlot(prior,'LOCAL_SCOPE_CHANGED').catch(()=>{});
        if(localOwner()?.localOwner!==who.localOwner||localOwner()?.localEpoch!==who.localEpoch)return;
      }
      lastSlot=slot;
      if(root.document?.hidden&&!terminal(s))return;
      const id=s.authenticated?liveIdentity(s):null;
      const mode=terminal(s)?'deny':s.authenticated&&id&&s.currentAccount?.role==='owner'?'live':
        !s.authenticated&&(!online()||s.connection==='offline'||restored)?'saved':'idle';
      const k=JSON.stringify([slot,who.localFence,cfg.pin,mode,s.authGeneration,id?.scope]);
      if(k===lastKey && (inflight||now()<nextTry))return inflight;
      const stamp=++serial;lastKey=k;nextTry=now()+60000;
      const old=restored;
      if(mode!=='saved')clear();
      function guard(){
        const l=localOwner(),cur=cloud.getSnapshot(),latest=config();
        if(stamp!==serial||cur.authGeneration!==s.authGeneration||!l||l.localOwner!==who.localOwner||l.localEpoch!==who.localEpoch||l.localFence!==who.localFence||cur.mode!=='local'||
          cfg.pin!==latest.pin||cfg.endpoint!==latest.endpoint||cfg.origin!==latest.origin||
          (mode==='live'?liveIdentity(cur)?.runtime!==id?.runtime||terminal(cur):mode==='saved'&&(cur.authenticated||terminal(cur))))throw err();
      }
      const task=(async()=>{
        if(mode==='deny'){await store.revokeSlot(slot,s.lastError||'SIGNED_OUT',guard);return;}
        if(mode==='idle')return;
        const b=mode==='live'?await store.bind(id,guard):null;guard();
        const record=await store.savedGrant(slot,guard);
        const device=await deviceFor(store,crypto,mode==='live',guard);guard();
        if(!device)return;
        const expected={...who,user:s.userId,workspace:s.workspaceId,serverEpoch:id?.cloudVersion};
        let claims=null;
        if(record && (!b||record.seal===b.seal)) {
          try{claims=await verify(record.envelope,cfg,device,expected,crypto,now);}catch{}
          guard();
        }
        if(mode==='saved') {
          if(!claims){clear();if(old)notify();return;}
          restored={claims,seal:record.seal,pin:cfg.pin};highWater=Math.max(record.lastSeen,now());
          if(timer!==null)clearTimer(timer);
          timer=setTimer(()=>{clear();lastKey='';notify();},Math.max(1,claims.exp*1000-now()));
          nextTry=claims.exp*1000;if(!old||old.seal!==record.seal||old.claims.iat!==claims.iat)notify();return;
        }
        if(claims && claims.exp*1000-now()>4*60*60*1000){nextTry=claims.exp*1000-4*60*60*1000;return;}
        const proof=await enrollment(device,cfg,who,crypto,now);guard();
        const issued=await cloud.request('offline.ownerGrant',proof,{authenticated:true,assertAuthorized:guard});guard();
        const checked=await verify(issued,cfg,device,expected,crypto,now);guard();
        await store.saveGrant(b,slot,{grant:issued.grant,publicKey:part(issued.publicKey)},guard);
        nextTry=checked.exp*1000-4*60*60*1000;
      })();
      inflight=task;
      try {await task;}catch(error){
        if(!error?.local && [401,403].includes(error?.status)) await store.revokeSlot(slot,'GRANT_ACCESS_DENIED').catch(()=>{});
      }finally{if(inflight===task)inflight=null;}
    }
    function recheck(){const had=!!restored;clear();lastKey='';serial++;if(had)notify();update().catch(()=>{});}
    function retire(details) {
      const cfg=config();if(details?.endpoint!==cfg.endpoint||!validLocal(details.localOwner)||!Number.isSafeInteger(details.localEpoch))return;
      const slot=location(details,cfg);
      if(slot===lastSlot){clear();lastKey='';lastSlot='';serial++;}
      return store.revokeSlot(slot,'LOCAL_OWNER_CHANGED').catch(()=>{});
    }
    return Object.freeze({active,update,recheck,retire});
  }
  return Object.freeze({create,verify,enrollment,deviceFor,retirement});
});
