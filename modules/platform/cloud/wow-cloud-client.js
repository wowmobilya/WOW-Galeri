/* WOW remote identity is opt-in. The existing local owner remains independent. */
(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.WFCloudClient=api;root.WFCloud=api.getClient();}
})(typeof window==='object'?window:globalThis,function(root){
  'use strict';
  const OLD_OWNER_KEY='wf_wow_cloud_owner_v1',OWNER_KEY='wf_wow_cloud_linked_owner_v2',IDLE_MS=30*60*1000,SESSION_MS=8*60*60*1000;
  const copy=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
  const roles=new Set(['owner','manager','sales','carpentry','assembly','warehouse','customer','custom']);
  function failure(code,status=0,details){const error=new Error(code);error.code=code;error.status=status;if(Array.isArray(details?.conflicts))error.conflicts=copy(details.conflicts);return error;}
  function remoteRequest(search){try{return new URLSearchParams(search||'').get('wf-cloud')==='employee';}catch(_){return false;}}
  function browserStore(){return {
    read(){root.sessionStorage?.removeItem(OLD_OWNER_KEY);const value=root.sessionStorage?.getItem(OWNER_KEY);return value?JSON.parse(value):null;},
    write(value){if(!root.sessionStorage)throw Error('SESSION_STORAGE');root.sessionStorage.removeItem(OLD_OWNER_KEY);root.sessionStorage.setItem(OWNER_KEY,JSON.stringify(value));},
    clear(){root.sessionStorage?.removeItem(OWNER_KEY);root.sessionStorage?.removeItem(OLD_OWNER_KEY);}
  };}
  function create(options={}){
    const config=options.config||root.WOW_CLOUD_CONFIG||{},mode=options.mode==='remote'||(!options.mode&&remoteRequest(root.location?.search))?'remote':'local';
    const fetcher=options.fetch||root.fetch?.bind(root),now=options.now||Date.now,store=options.sessionStore||browserStore();
    const configured=config.enabled===true&&typeof config.endpoint==='string'&&/^https:\/\//.test(config.endpoint)&&typeof config.publishableKey==='string'&&!!config.publishableKey;
    let workspaceHint=config.workspaceId||'';try{workspaceHint=new URLSearchParams(root.location?.search||'').get('workspace')||workspaceHint;}catch(_){}
    const empty=()=>({configured:true,revision:0,currentAccount:null,accounts:[],audit:[]});
    let identity=empty(),session=null,workspaceId='',link=null,generation=0,connection=configured?'idle':'unconfigured',lastError='',refreshing=null;
    let signedAt=0,lastActiveAt=0,pendingActivity=false,lastVerifiedAt=0,storeUsable=true;
    const listeners=new Set();
    const localSnapshot=options.getLocalSnapshot||(()=>root.WFAccountAccess?.service?.getSnapshot?.());
    let localChecked=typeof options.getLocalSnapshot==='function',localScope=null,localAvailable;
    const localReady=new Promise(resolve=>{localAvailable=resolve;if(localChecked||mode==='remote')resolve();});
    function principal(){
      let state;try{state=localSnapshot();}catch(_){return null;}
      if(state?.configured===false)return {key:'local-unconfigured',ownerId:null,version:0};
      const a=state?.currentAccount;
      if(state?.configured!==true||a?.role!=='owner'||a.status!=='active'||typeof a.id!=='string'||!a.id||
        !Number.isSafeInteger(a.sessionVersion)||a.sessionVersion<1||a.expiresAt&&!(Date.parse(a.expiresAt)>now()))return null;
      return {key:JSON.stringify([a.id,a.sessionVersion]),ownerId:a.id,version:a.sessionVersion};
    }
    function retireOwner(previous){
      if(!previous?.ownerId)return;
      try{
        const slot='wf_offline_owner_retirement_v1:'+JSON.stringify([config.endpoint,previous.ownerId,previous.version]);
        // A missing marker also locks previously issued grants if a replacement write hits a quota.
        root.localStorage?.removeItem(slot);root.localStorage?.setItem(slot,root.crypto.randomUUID());
      }catch(_){}
      try{if(root.dispatchEvent&&root.CustomEvent)root.dispatchEvent(new root.CustomEvent('wf-cloud-local-owner-retired',{
        detail:{endpoint:config.endpoint,localOwner:previous.ownerId,localEpoch:previous.version}}));}catch(_){}
    }
    function dropLocal(previous){
      retireOwner(previous);link=null;workspaceId='';refreshing=null;return invalidateSession('LOCAL_OWNER_CHANGED');
    }
    function reconcileLocal(){
      if(mode!=='local'||!localChecked)return;
      const next=principal(),previous=localScope;localScope=next;
      if(previous&&previous.key!==next?.key)dropLocal(previous);
    }
    function localIdentityChanged(){
      if(mode!=='local')return;
      const initial=!localChecked;
      localChecked=true;reconcileLocal();localAvailable();
      if(initial&&!localScope){clearStored();connection=configured?'signed-out':'unconfigured';}
    }
    function lockLocalAccess(){
      if(mode!=='local')return;
      const previous=localScope;localScope=null;localChecked=false;localAvailable();
      dropLocal(previous);
    }
    if(localChecked&&mode==='local')localScope=principal();
    function clearStored(){try{store.clear();}catch(_){storeUsable=false;}}
    function snapshot(){
      expire();
      const account=identity.currentAccount;
      return freeze({...copy(identity),configured:true,mode,authenticated:!!(session&&account),
        workspaceId:workspaceId||link?.workspaceId||workspaceHint||null,userId:account?.id||link?.userId||null,
        sessionVersion:account?.sessionVersion||null,authGeneration:generation,role:account?.role||null,status:account?.status||'signed-out',
        connection,lastError,lastVerifiedAt,linkedOwner:mode==='local'&&!!link});
    }
    function emit(){const state=snapshot();for(const listener of listeners){try{listener(state);}catch(_){}}
      try{if(root.dispatchEvent&&root.CustomEvent)root.dispatchEvent(new root.CustomEvent('wf-cloud-session-change',{detail:state}));}catch(_){}return state;}
    function invalidateSession(reason='AUTH_REQUIRED'){
      generation++;refreshing=null;session=null;identity=empty();pendingActivity=false;lastVerifiedAt=0;lastError=String(reason);connection=configured?'signed-out':'unconfigured';clearStored();return emit();
    }
    function expire(){reconcileLocal();if(session&&identity.currentAccount?.role!=='owner'&&(now()<signedAt||now()<lastActiveAt||now()-signedAt>=SESSION_MS||now()-lastActiveAt>=IDLE_MS)){invalidateSession('SESSION_EXPIRED');}}
    function checkGeneration(expected){reconcileLocal();if(expected!==generation||mode==='local'&&(!localChecked||!localScope))throw failure('AUTH_REQUIRED',401);}
    function safeIdentity(value){
      const account=value?.currentAccount;
      if(!value||!account||typeof account.id!=='string'||!account.id||!roles.has(account.role)||account.status!=='active'||
        !Array.isArray(account.permissions)||!account.permissions.every(key=>typeof key==='string')||
        !Number.isSafeInteger(account.sessionVersion)||account.sessionVersion<1||!Array.isArray(value.accounts)||!Array.isArray(value.audit))throw failure('INVALID_RESPONSE',502);
      if(account.expiresAt!=null&&(!Number.isFinite(Date.parse(account.expiresAt))||Date.parse(account.expiresAt)<=now()))throw failure('ACCOUNT_UNAVAILABLE',403);
      const result=copy(value);result.configured=true;
      if(account.role!=='owner'){
        result.accounts=result.accounts.filter(row=>row.id===account.id);
        result.audit=result.audit.filter(row=>row.actorId===account.id||(!row.targetType||row.targetType==='account')&&row.targetId===account.id);
      }
      return result;
    }
    function rememberOwner(){
      // Remote entry always uses its explicit in-memory login, even if the user signs in as an owner.
      if(mode!=='local')return;
      if(!localChecked||!localScope?.ownerId||!storeUsable||!session||identity.currentAccount?.role!=='owner'){clearStored();return;}
      try{store.write({version:2,mode:'local',endpoint:config.endpoint,workspaceId,userId:identity.currentAccount.id,
        cloudVersion:identity.currentAccount.sessionVersion,localOwnerId:localScope.ownerId,localVersion:localScope.version,refreshToken:session.refresh_token});}
      catch(_){clearStored();storeUsable=false;}
    }
    function adopt(result,expected,{authentication=false,allowEpochChange=false,restoreOwner=false}={}){
      checkGeneration(expected);
      const next=safeIdentity(result.identity);
      if(typeof result.workspaceId!=='string'||!result.workspaceId)throw failure('INVALID_RESPONSE',502);
      if(restoreOwner&&(mode!=='local'||next.currentAccount.role!=='owner'||next.currentAccount.id!==restoreOwner.userId||
        next.currentAccount.sessionVersion!==restoreOwner.cloudVersion||result.workspaceId!==restoreOwner.workspaceId))throw failure('AUTH_REQUIRED',401);
      if(mode==='local'&&next.currentAccount.role!=='owner')throw failure('REMOTE_MODE_REQUIRED',403);
      const previous=identity.currentAccount;
      if(previous&&!authentication&&!allowEpochChange&&(previous.id!==next.currentAccount.id||previous.sessionVersion!==next.currentAccount.sessionVersion||previous.role!==next.currentAccount.role))throw failure('SESSION_REVOKED',401);
      if(authentication){
        const value=result.session;
        if(!value||typeof value.access_token!=='string'||!value.access_token||typeof value.refresh_token!=='string'||!value.refresh_token||!Number.isFinite(value.expires_at))throw failure('INVALID_RESPONSE',502);
        session={access_token:value.access_token,refresh_token:value.refresh_token,expires_at:value.expires_at};
        signedAt=lastActiveAt=now();pendingActivity=false;
      }
      identity=next;workspaceId=result.workspaceId;lastVerifiedAt=now();connection='online';lastError='';
      if(mode==='local'&&next.currentAccount.role==='owner')link={workspaceId,userId:next.currentAccount.id};
      rememberOwner();return emit();
    }
    function terminalAuth(error){return error?.status===401||['AUTH_REQUIRED','SESSION_REVOKED','SESSION_EXPIRED','ACCOUNT_UNAVAILABLE','ACCOUNT_REVOKED','ACCOUNT_SUSPENDED','ACCOUNT_DELETED'].includes(error?.code);}
    async function transport(action,payload={},token){
      if(!configured||typeof fetcher!=='function')throw failure('CLOUD_UNCONFIGURED');
      const sentGeneration=generation;
      const headers={'Content-Type':'application/json',apikey:config.publishableKey};if(token)headers.Authorization='Bearer '+token;
      const controller=typeof root.AbortController==='function'?new root.AbortController():null;
      const timeout=controller?setTimeout(()=>controller.abort(),15000):null;
      let response;
      try{response=await fetcher(config.endpoint,{method:'POST',headers,body:JSON.stringify({...payload,action}),signal:controller?.signal,credentials:'omit',cache:'no-store'});}
      catch(_){if(sentGeneration===generation){connection='offline';lastError='NETWORK';emit();}throw failure('NETWORK');}
      finally{if(timeout)clearTimeout(timeout);}
      let body;try{body=await response.json();}catch(_){throw failure('INVALID_RESPONSE',response.status||502);}
      if(!response.ok||body?.ok!==true)throw failure(body?.error?.code||'CLOUD_ERROR',response.status||500,body?.error);
      if(sentGeneration===generation){connection='online';lastError='';}return body;
    }
    async function refreshToken(token,expected,restoreOwner=false){
      const result=await transport('auth.refresh',{refreshToken:token});checkGeneration(expected);
      const previous=identity.currentAccount,next=result.identity?.currentAccount;
      if(previous&&(previous.id!==next?.id||previous.role!==next?.role||previous.sessionVersion!==next?.sessionVersion))throw failure('SESSION_REVOKED',401);
      const oldSignedAt=signedAt,oldActiveAt=lastActiveAt,oldPending=pendingActivity;
      // Refreshing a token is not employee activity and does not reset its lifetime.
      const value=adopt(result,expected,{authentication:true,restoreOwner});
      if(!restoreOwner){signedAt=oldSignedAt;lastActiveAt=oldActiveAt;pendingActivity=oldPending;}
      return value;
    }
    async function ensureAccess(){
      expire();if(!session||!identity.currentAccount)throw failure('AUTH_REQUIRED',401);
      if(session.expires_at*1000-now()>30000)return;
      if(!refreshing){const expected=generation,token=session.refresh_token;
        const task=refreshToken(token,expected).catch(error=>{if(expected===generation&&terminalAuth(error))invalidateSession(error.code);throw error;})
          .finally(()=>{if(refreshing===task)refreshing=null;});refreshing=task;}
      await refreshing;expire();if(!session)throw failure('AUTH_REQUIRED',401);
    }
    async function request(action,payload={},options={}){
      await ready;const expected=generation;
      if(options.authenticated===false)return transport(action,payload);
      await ensureAccess();checkGeneration(expected);
      // The local owner can lock or switch accounts while an access token refreshes.
      // Module callers supply their live local and cloud authorization guard.
      options.assertAuthorized?.();
      try{const result=await transport(action,payload,session.access_token);checkGeneration(expected);options.assertAuthorized?.();return result;}
      catch(error){if(expected===generation&&!error?.local){if(terminalAuth(error))invalidateSession(error.code);else{lastError=error.code||'CLOUD_ERROR';emit();}}throw error;}
    }
    async function authenticate(action,input){
      await ready;checkGeneration(generation);invalidateSession('');const expected=generation;connection='checking';emit();
      try{return adopt(await transport(action,input),expected,{authentication:true});}
      catch(error){if(expected===generation){invalidateSession(error.code);if(error.code==='NETWORK'){connection='offline';emit();}}throw error;}
    }
    async function signIn({username,password,workspaceId:requestedWorkspace}={}){return authenticate('auth.signIn',{workspaceId:requestedWorkspace||workspaceHint||link?.workspaceId||undefined,username,password});}
    async function enrollOwner(input={}){if(typeof input.setupToken!=='string'||!input.setupToken.trim())throw failure('SETUP_PROOF_REQUIRED');return authenticate('auth.enrollOwner',{setupToken:input.setupToken.trim(),name:input.name,username:input.username,password:input.password});}
    async function customerAuth(action,input={}){
      await ready;if(mode!=='remote')throw failure('REMOTE_MODE_REQUIRED',403);
      if(session)throw failure('CUSTOMER_AUTH_SIGNOUT_REQUIRED',409);
      const expected=generation,result=await transport(action,{...input,workspaceId:workspaceHint||workspaceId||undefined});
      checkGeneration(expected);return result;
    }
    async function signOut(){
      const token=session?.access_token,expected=generation;
      if(token&&typeof root.WFPush?.beforeSignOut==='function'){
        let timer;
        try{
          await Promise.race([root.WFPush.beforeSignOut(),new Promise(resolve=>{timer=setTimeout(resolve,4000);})]);
        }catch(_){/* Offline cleanup must still lock this device. */}
        finally{clearTimeout(timer);}
      }
      if(expected===generation){if(mode==='local')retireOwner(localScope);invalidateSession('');}
      if(token)await transport('auth.signOut',{},token);
      return snapshot();
    }
    async function refresh(){
      await ready;expire();if(!session)return snapshot();
      const expected=generation,touched=pendingActivity;pendingActivity=false;
      try{return adopt(await request(touched?'session.touch':'session.snapshot'),expected);}
      catch(error){if(expected===generation){if(touched)pendingActivity=true;if(terminalAuth(error))invalidateSession(error.code);}throw error;}
    }
    async function command(action,payload={},allowEpochChange=false){
      const expected=generation;
      try{return adopt(await request(action,payload),expected,{allowEpochChange});}
      catch(error){if(expected===generation&&terminalAuth(error))invalidateSession(error.code);throw error;}
    }
    function touch(){expire();if(!session)return false;lastActiveAt=now();pendingActivity=true;return true;}
    function can(key){expire();const account=identity.currentAccount;if(!session||!account)return false;return root.WFAccountPolicy?.can?root.WFAccountPolicy.can(account,key):account.permissions.includes(key);}
    function cacheName(){
      if(mode==='local')return 'WowFurnitureDB';
      expire();if(!session||!workspaceId||!identity.currentAccount)throw failure('AUTH_REQUIRED',401);
      // Keep one physical database per account. The sync binding atomically removes
      // its previous permission version's projection before opening a new one.
      return 'WowFurnitureRemoteDB_v1_'+encodeURIComponent(workspaceId)+'_'+encodeURIComponent(identity.currentAccount.id);
    }
    function entryUrl(base=root.location?.href||'https://galeri.wowfurniture.com.tr/'){
      const scope=workspaceId||link?.workspaceId||workspaceHint;if(!scope)throw failure('WORKSPACE_REQUIRED');
      const url=new URL(base);url.searchParams.set('wf-cloud','employee');url.searchParams.set('workspace',scope);url.searchParams.delete('wf-accounts');url.hash='dashboard';return url.href;
    }
    const ready=(async()=>{
      // Employee links can inherit an opener's sessionStorage. Clear the local-link copy before any auth or storage read.
      if(mode==='remote'){clearStored();return snapshot();}
      if(!configured)return snapshot();
      await localReady;reconcileLocal();
      if(!localChecked||!localScope?.ownerId){clearStored();return snapshot();}
      let saved;try{saved=store.read();}catch(_){storeUsable=false;clearStored();return snapshot();}
      if(!saved)return snapshot();
      if(saved.version!==2||saved.mode!=='local'||saved.endpoint!==config.endpoint||saved.localOwnerId!==localScope.ownerId||
        saved.localVersion!==localScope.version||!Number.isSafeInteger(saved.cloudVersion)||typeof saved.userId!=='string'||!saved.userId||
        typeof saved.refreshToken!=='string'||!saved.refreshToken||typeof saved.workspaceId!=='string'||!saved.workspaceId){clearStored();return snapshot();}
      const expected=generation;connection='checking';
      try{return await refreshToken(saved.refreshToken,expected,saved);}
      catch(error){if(expected===generation){if(error.code==='NETWORK'){
        // This is a remembered binding hint only, never an authenticated role.
        if(typeof saved.userId==='string'&&saved.userId)link={workspaceId:saved.workspaceId,userId:saved.userId};
        connection='offline';lastError='NETWORK';emit();
      }else invalidateSession(error.code);}return snapshot();}
    })();
    return Object.freeze({ready,request,getSnapshot:snapshot,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
      isConfigured:()=>configured,isRemote:()=>mode==='remote',isRemoteMode:()=>mode==='remote',isLinkedOwner:()=>mode==='local'&&!!link,
      localIdentityChanged,lockLocalAccess,invalidateSession,cacheName,entryUrl,can,touch,refresh,signIn,signOut,enrollOwner,bootstrapOwner:enrollOwner,
      customerAuthOptions:()=>customerAuth('auth.customerOptions'),
      customerRegister:input=>customerAuth('auth.customerRegister',input),
      customerRecover:input=>customerAuth('auth.customerRecover',input),
      customerVerify:input=>customerAuth('auth.customerVerify',input),
      createAccount:payload=>command('accounts.create',{payload}),
      updateAccount:(accountId,payload)=>command('accounts.update',{accountId,payload,expectedRevision:identity.revision}),
      setStatus:(accountId,status,reason='')=>command('accounts.status',{accountId,status,reason,expectedRevision:identity.revision}),
      restoreAccount:accountId=>command('accounts.restore',{accountId,expectedRevision:identity.revision}),
      setPassword:(accountId,password)=>command('accounts.setPassword',{accountId,password}),
      changePassword:(currentPassword,newPassword)=>command('accounts.changePassword',{currentPassword,newPassword},true),
      revokeSessions:accountId=>command('accounts.revokeSessions',{accountId}),
      assertPermission:permission=>request('permissions.assert',{permission}).then(()=>true),
      recordActivity:payload=>command('activity.record',{payload}),
      getConfig:()=>freeze({enabled:configured,projectRef:config.projectRef||'',dashboardUrl:config.dashboardUrl||'',endpoint:config.endpoint||''})});
  }
  let singleton;
  return Object.freeze({create,getClient:()=>singleton||(singleton=create()),isRemoteMode:()=>remoteRequest(root.location?.search)});
});
