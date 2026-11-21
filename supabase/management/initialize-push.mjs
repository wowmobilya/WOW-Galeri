// Management-only helper. It is intentionally NOT imported by the public Edge
// entry point and must only run after the management caller is authenticated.
// The initializer passes its built-in SUPABASE_URL, never a browser-supplied URL.
// Raw private keys/token exist only in memory and the encrypted database Vault.
export async function initializePush({projectUrl,serviceKey,generateVAPIDKeys,fetch:fetcher=globalThis.fetch,crypto:cryptoApi=globalThis.crypto}){
  if(typeof projectUrl!=='string'||!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(projectUrl)||
    typeof serviceKey!=='string'||!serviceKey||typeof generateVAPIDKeys!=='function')throw new Error('INVALID_PUSH_CONFIGURATION');
  const keys=generateVAPIDKeys(),bytes=cryptoApi.getRandomValues(new Uint8Array(48));
  const workerToken=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetcher(projectUrl+'/rest/v1/rpc/wow_push_configure',{
      method:'POST',redirect:'error',signal:controller.signal,
      headers:{'content-type':'application/json',apikey:serviceKey,...(!serviceKey.startsWith('sb_secret_')?{authorization:'Bearer '+serviceKey}:{})},
      body:JSON.stringify({p_data:{projectUrl,publicKey:keys.publicKey,privateKey:keys.privateKey,workerToken}})
    });
    if(!response.ok)throw new Error('PUSH_INITIALIZATION_FAILED');
    const result=await response.json();
    if(result.configured!==true||typeof result.publicKey!=='string'||!/^[A-Za-z0-9_-]{87}$/.test(result.publicKey))throw new Error('PUSH_INITIALIZATION_FAILED');
    return {configured:true,publicKey:result.publicKey,cronJobId:result.cronJobId};
  }catch(_){throw new Error('PUSH_INITIALIZATION_FAILED');}
  finally{clearTimeout(timer);}
}
