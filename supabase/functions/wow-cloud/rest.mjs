/* Small native REST adapter: no browser session persistence and no SDK import.
 * Service credentials remain in Edge environment variables. */
import {failure} from './core.mjs';
const AUTH_CODES=new Set(['AUTH_REQUIRED','SESSION_REVOKED','SESSION_EXPIRED']);
const FORBIDDEN_CODES=new Set(['ACCESS_DENIED','PERMISSION_DENIED','ACCOUNT_UNAVAILABLE','SETUP_PROOF_INVALID','SETUP_PROOF_REQUIRED','SELF_PROTECTION','LAST_OWNER','CUSTOMER_PRINCIPAL_ROLE_FIXED']);
const CONFLICT_CODES=new Set(['CONFLICT','IDENTITY_CONFLICT','IDEMPOTENCY_MISMATCH','BATCH_SESSION_CHANGED','DUPLICATE_INVOICE_NUMBER','DUPLICATE_RECORD','USERNAME_TAKEN','ALREADY_CONFIGURED','MEDIA_REVISION_MISMATCH','MEDIA_NOT_UPLOADED','SUBSCRIPTION_BOUND_TO_OTHER_IDENTITY','PUSH_SUBSCRIPTION_REQUIRED']);
const MODULE_RPCS=new Set(['wow_gallery_service','wow_chat_service','wow_files_service','wow_finance_service','wow_operations_service','wow_assistant_service','wow_communications_service','wow_public_share_service']);
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const MODULE_OBJECT_PATH=new RegExp('^(?:chat|files)/'+UUID+'/'+UUID+'/'+UUID+'/[0-9a-f]{64}$');
const GALLERY_OBJECT_PATH=new RegExp('^'+UUID+'/gallery/'+UUID+'/'+UUID+'\\.(?:jpeg|png|webp)$');
export const isStorageCleanupPath=path=>typeof path==='string'&&(MODULE_OBJECT_PATH.test(path)||GALLERY_OBJECT_PATH.test(path));
function rpcError(value) {
  const code=value?.code==='P0001'&&/^[A-Z][A-Z0-9_]{2,60}$/.test(value.message||'')?value.message:'SERVICE_UNAVAILABLE';
  let details={};try{details=JSON.parse(value?.details||'{}');}catch(_){}
  const status=AUTH_CODES.has(code)?401:FORBIDDEN_CODES.has(code)?403:CONFLICT_CODES.has(code)?409:code==='RATE_LIMITED'?429:
    code==='ACCOUNT_NOT_FOUND'?404:code.startsWith('INVALID_')||code==='WORKSPACE_REQUIRED'?422:503;
  return failure(code,status,{...(Array.isArray(details.conflicts)?{conflicts:details.conflicts}:{}),...(Number.isFinite(details.retryAfter)?{retryAfter:details.retryAfter}:{})});
}
export function createRestDependencies({url,serviceKey,fetch:fetcher=globalThis.fetch,timeoutMs=12000}) {
  if(typeof url!=='string'||!/^https:\/\//.test(url)||!serviceKey)throw failure('SERVER_CONFIGURATION',503);
  // New opaque secret keys authenticate the gateway through apikey, not the
  // bearer header. A real user token overrides Authorization only when needed.
  const base=url.replace(/\/$/,''),serviceHeaders={apikey:serviceKey,
    ...(!serviceKey.startsWith('sb_secret_')?{authorization:'Bearer '+serviceKey}:{})};
  async function call(path,{method='POST',body,token,headers={},binary=false,allowDuplicate=false,removeObject=false,kind='service'}={}) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try {
      const response=await fetcher(base+path,{method,headers:{...serviceHeaders,...(token?{authorization:'Bearer '+token}:{}),
        ...(body!==undefined&&!binary?{'content-type':'application/json'}:{}),...headers},body:body===undefined?undefined:binary?body:JSON.stringify(body),
        ...(removeObject?{redirect:'error'}:{}),signal:controller.signal});
      let data;try{data=await response.json();}catch(_){data={};}
      if(!response.ok) {
        if(removeObject&&response.status===404&&[data?.code,data?.error].includes('NoSuchKey'))return [];
        if(allowDuplicate&&[400,409].includes(response.status)&&(['Duplicate','ResourceAlreadyExists'].includes(data?.error)||['Duplicate','ResourceAlreadyExists'].includes(data?.code)||/already exists/i.test(data?.message||'')))return {duplicate:true};
        if(kind==='rpc')throw rpcError(data);
        if(kind==='auth'&&[400,401,403].includes(response.status))throw failure('AUTH_REQUIRED',401);
        if(response.status===429)throw failure('RATE_LIMITED',429,{retryAfter:60});
        if(kind==='auth-admin'&&response.status===422)throw failure('INVALID_PASSWORD',422);
        throw failure(kind==='storage'?'STORAGE_UNAVAILABLE':'SERVICE_UNAVAILABLE',503);
      }
      return data;
    } catch(error) {
      if(error?.code)throw error;
      throw failure('SERVICE_UNAVAILABLE',503);
    } finally {clearTimeout(timer);}
  }
  const auth={
    async getUser(token){const data=await call('/auth/v1/user',{method:'GET',token,kind:'auth'});return data.user||data;},
    signIn:(email,password)=>call('/auth/v1/token?grant_type=password',{body:{email,password},kind:'auth'}),
    refresh:refreshToken=>call('/auth/v1/token?grant_type=refresh_token',{body:{refresh_token:refreshToken},kind:'auth'}),
    signOut:token=>call('/auth/v1/logout?scope=local',{token,kind:'auth'}),
    async createUser(input){const data=await call('/auth/v1/admin/users',{body:input,kind:'auth-admin'});return data.user||data;},
    deleteUser:id=>call('/auth/v1/admin/users/'+encodeURIComponent(id),{method:'DELETE',kind:'auth-admin'}),
    updatePassword:(id,password)=>call('/auth/v1/admin/users/'+encodeURIComponent(id),{method:'PUT',body:{password},kind:'auth-admin'})
  };
  const objectPath=path=>'wow-files/'+path.split('/').map(encodeURIComponent).join('/');
  return {
    rpc:(action,data)=>call('/rest/v1/rpc/wow_service',{body:{p_action:action,p_data:data},kind:'rpc'}),
    pushRpc:(action,data)=>call('/rest/v1/rpc/wow_push_worker',{body:{p_action:action,p_data:data},kind:'rpc'}),
    maintenanceRpc:(action,data)=>call('/rest/v1/rpc/wow_storage_maintenance',{body:{p_action:action,p_data:data},kind:'rpc'}),
    communicationsRpc:(action,data)=>call('/rest/v1/rpc/wow_communications_worker',{body:{p_action:action,p_data:data},kind:'rpc'}),
    health:()=>call('/rest/v1/rpc/wow_operations_health',{body:{},kind:'rpc'}),
    moduleRpc:(name,action,data)=>{
      if(!MODULE_RPCS.has(name))throw failure('SERVER_CONFIGURATION',503);
      return call('/rest/v1/rpc/'+name,{body:{p_action:action,p_data:data},kind:'rpc'});
    },
    auth,
    storage:{
      // Each call removes exactly one database-generated name in the private bucket.
      remove:path=>{
        if(!isStorageCleanupPath(path))throw failure('INVALID_STORAGE_PATH',422);
        return call('/storage/v1/object/wow-files',{method:'DELETE',body:{prefixes:[path]},kind:'storage',removeObject:true}).then(result=>{
          if(!Array.isArray(result)||result.length>1||result.some(object=>object?.name!==path))throw failure('STORAGE_UNAVAILABLE',503);
          return result;
        });
      },
      put:(path,bytes,contentType)=>call('/storage/v1/object/'+objectPath(path),{body:bytes,binary:true,kind:'storage',allowDuplicate:true,
        headers:{'content-type':contentType,'cache-control':'max-age=0','x-upsert':'false'}}),
      async sign(path,expiresIn=60){
        const value=await call('/storage/v1/object/sign/'+objectPath(path),{body:{expiresIn},kind:'storage'});
        const signed=value.signedURL||value.signedUrl;
        if(typeof signed!=='string')throw failure('STORAGE_UNAVAILABLE',503);
        const resolved=new URL(signed.startsWith('http')?signed:base+'/storage/v1'+signed);
        if(resolved.origin!==new URL(base).origin||!resolved.pathname.startsWith('/storage/v1/object/sign/wow-files/'))throw failure('STORAGE_UNAVAILABLE',503);
        return resolved.href;
      }
    }
  };
}
