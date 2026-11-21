import {validatePushEndpoint,normalizeSubscription,digest,constantEqual,pushError} from './push-security.mjs';
import {formatPushPayload} from './push-events.mjs';
export async function sendEncryptedPush({subscription,payload,vapid,generateRequestDetails,fetch:fetcher=globalThis.fetch,beforeSend=async()=>true,now=Date.now,timeoutMs=8000}){
  const endpoint=validatePushEndpoint(subscription.endpoint);
  const ttl=payload.validUntil==null?86400:Math.min(86400,Math.floor((Date.parse(payload.validUntil)-now())/1000));
  if(!Number.isFinite(ttl)||ttl<=0)return {status:'cancelled',errorCode:'NOTICE_EXPIRED',httpStatus:null};
  let details;try{details=generateRequestDetails(subscription,JSON.stringify(payload),{vapidDetails:vapid,contentEncoding:'aes128gcm',TTL:ttl,urgency:'high',topic:(await digest(payload.eventId)).slice(0,32)});}catch(_){return {status:'failed',errorCode:'ENCRYPTION_FAILED',httpStatus:null};}
  if(details.endpoint!==endpoint||details.method!=='POST')throw pushError('INVALID_PUSH_ENDPOINT');
  if(!await beforeSend())return {status:'cancelled',errorCode:'SUBSCRIPTION_REVOKED',httpStatus:null};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetcher(endpoint,{method:'POST',headers:details.headers,body:new Uint8Array(details.body),redirect:'error',signal:controller.signal});
    const httpStatus=response.status,rawRetry=response.headers.get('retry-after');
    const seconds=rawRetry&&/^\d+$/.test(rawRetry.trim())?Number(rawRetry):rawRetry?Math.ceil((Date.parse(rawRetry)-Date.now())/1000):NaN;
    const retryAfter=Number.isFinite(seconds)?Math.max(15,Math.min(3600,Math.ceil(seconds))):null;
    if(response.body)try{await response.body.cancel();}catch(_){}
    if(httpStatus>=200&&httpStatus<300)return {status:'sent',httpStatus,errorCode:null};
    if([404,410].includes(httpStatus))return {status:'dead',httpStatus,errorCode:'ENDPOINT_GONE'};
    if([401,403,408,425,429].includes(httpStatus)||httpStatus>=500)return {status:'retry',httpStatus,errorCode:httpStatus===429?'PROVIDER_RATE_LIMITED':httpStatus===401||httpStatus===403?'PROVIDER_AUTH_FAILED':'PROVIDER_UNAVAILABLE',retryAfter};
    return {status:'failed',httpStatus,errorCode:'PROVIDER_REJECTED'};
  }catch(_){return {status:'retry',httpStatus:null,errorCode:'NETWORK_OR_REDIRECT'};}
  finally{clearTimeout(timer);}
}
export function createPushWorker({rpc,generateRequestDetails,fetch:fetcher=globalThis.fetch,now=Date.now,maintenance}){
  let cache=null;
  async function config(){if(cache&&cache.until>now())return cache.value;const value=await rpc('config',{});cache={value,until:now()+30000};return value;}
  return async request=>{
    const headers={'content-type':'application/json','cache-control':'no-store'};
    const token=request.headers.get('x-wow-worker-token');
    if(request.method!=='POST'||request.headers.has('origin')||typeof token!=='string'||token.length<32||token.length>256)return new Response('{"ok":false,"error":{"code":"AUTH_REQUIRED"}}',{status:401,headers});
    try{
      const settings=await config();if(!constantEqual(await digest(token),settings.workerTokenHash))return new Response('{"ok":false,"error":{"code":"AUTH_REQUIRED"}}',{status:401,headers});
      const {jobs=[]}=await rpc('claim',{limit:20}),counts={sent:0,retry:0,dead:0,failed:0,cancelled:0};let index=0;
      await Promise.all(Array.from({length:Math.min(4,jobs.length)},async()=>{
        while(index<jobs.length){const job=jobs[index++];let outcome;
          try{
            const delivery=await rpc('prepare',job);
            if(delivery.cancelled){counts.cancelled++;continue;}
            const subscription=await normalizeSubscription(delivery.subscription,now());
            const payload=formatPushPayload(delivery.event,delivery.recipient);
            outcome=await sendEncryptedPush({subscription,payload,vapid:settings.vapid,generateRequestDetails,fetch:fetcher,now,
              beforeSend:async()=>(await rpc('recheck',job)).allowed===true});
          }catch(error){
            if(error?.code==='INVALID_NOTICE')outcome={status:'failed',httpStatus:null,errorCode:'INVALID_NOTICE'};
            else outcome={status:error?.code?.startsWith('INVALID_PUSH')?'dead':'retry',httpStatus:null,errorCode:error?.code?.startsWith('INVALID_PUSH')?'INVALID_SUBSCRIPTION':'WORKER_ERROR'};
          }
          await rpc('finish',{...job,...outcome});counts[outcome.status]=(counts[outcome.status]||0)+1;
        }
      }));
      let maintenanceStatus;
      if(maintenance){
        try{await maintenance();maintenanceStatus='completed';}catch{maintenanceStatus='failed';}
      }
      await rpc('wake',{});return new Response(JSON.stringify({ok:true,processed:jobs.length,...counts,maintenance:maintenanceStatus}),{headers});
    }catch(_){return new Response('{"ok":false,"error":{"code":"PUSH_WORKER_UNAVAILABLE"}}',{status:503,headers});}
  };
}
