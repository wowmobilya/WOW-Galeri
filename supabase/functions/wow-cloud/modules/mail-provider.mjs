// Documented Resend HTTP and Svix HMAC contracts; no SDK or browser credential.
const endpoint='https://api.resend.com/emails';
export const mailSender='WOW FURNITURE <info@wowfurniture.com.tr>';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash=/^[0-9a-f]{64}$/;
const utf8=new TextEncoder(),decode=new TextDecoder('utf-8',{fatal:true});
const failure=(code='MAIL_PROVIDER_UNAVAILABLE',status=503)=>Object.assign(Error(code),{code,status,...(code==='INVALID_MAIL_PAYLOAD'?{permanent:true}:{})});
export const validMailAddress=value=>{
 if(typeof value!=='string'||value.length>254||! /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i.test(value)||value.includes('..')||value.toLowerCase().endsWith('.invalid'))return false;
 const [local,domain]=value.split('@');return local.length<=64&&!local.startsWith('.')&&!local.endsWith('.')&&domain.split('.').every(label=>label.length<=63&&!label.startsWith('-')&&!label.endsWith('-'));
};
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const states={sent:'accepted',delivered:'delivered',delivery_delayed:'delayed',bounced:'bounced',complained:'complained',failed:'failed',suppressed:'suppressed'};
async function bounded(body,headers,limit){
 if(!body||Number(headers.get('content-length')||0)>limit)throw failure();
 const reader=body.getReader(),chunks=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;
  if(length>limit){await reader.cancel().catch(()=>{});throw failure();}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return decode.decode(bytes);
}
function tagsOf(value){
 if(Array.isArray(value))return Object.fromEntries(value.filter(x=>plain(x)&&typeof x.name==='string'&&typeof x.value==='string').map(x=>[x.name,x.value]));
 return plain(value)?value:{};
}
function eventData(data,status,at,eventId){
 const tags=tagsOf(data.tags),to=data.to;
 if(!uuid.test(data.email_id||data.id)||!uuid.test(tags.wow_message)||!uuid.test(tags.wow_workspace)||!hash.test(tags.wow_digest)||
   !Array.isArray(to)||to.length!==1||typeof to[0]!=='string'||to[0].length>254||data.from!==mailSender||
   typeof at!=='string'||!Number.isFinite(Date.parse(at)))throw failure('INVALID_MAIL_EVENT',400);
 return {id:tags.wow_message,workspace:tags.wow_workspace,digest:tags.wow_digest,
  providerId:data.email_id||data.id,status,at:new Date(at).toISOString(),eventId,to:to[0].toLowerCase(),from:data.from};
}

export function createMailProvider({apiKey,enabled=false,webhookSecret,fetch:fetcher=globalThis.fetch,now=Date.now,timeoutMs=8000}={}){
 const configured=enabled===true&&typeof apiKey==='string'&&/^re_[A-Za-z0-9_-]{12,200}$/.test(apiKey);
 const timeout=Math.max(1,Math.min(12000,Number.isFinite(timeoutMs)?timeoutMs:8000));
 let signingKey;
 const webhookConfigured=typeof webhookSecret==='string'&&/^whsec_[A-Za-z0-9+/]{24,200}={0,2}$/.test(webhookSecret);
 async function request(url,{method='GET',body,key}={}){
  if(!configured)throw failure('MAIL_NOT_CONFIGURED');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{
   const response=await fetcher(url,{method,redirect:'error',cache:'no-store',signal:controller.signal,
    headers:{Authorization:'Bearer '+apiKey,Accept:'application/json',...(body?{'Content-Type':'application/json','Idempotency-Key':key}:{})},
    ...(body?{body:JSON.stringify(body)}:{})});
   if(!response.ok){const error=failure();error.permanent=[400,401,403,404,422].includes(response.status);throw error;}
   if(!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')||''))throw failure();
   return JSON.parse(await bounded(response.body,response.headers,98304));
  }catch(error){if(error?.code)throw error;throw failure();}
  finally{clearTimeout(timer);}
 }
 async function send(job){
  if(!uuid.test(job?.id)||!uuid.test(job?.workspace)||!hash.test(job?.digest)||job.idempotencyKey!=='wow-mail/'+job.workspace+'/'+job.id||
   !plain(job.payload)||job.payload.from!==mailSender||!Array.isArray(job.payload.to)||job.payload.to.length!==1||
   !validMailAddress(job.payload.to[0])||
   typeof job.payload.subject!=='string'||job.payload.subject.length>200||/[\r\n]/.test(job.payload.subject)||
   typeof job.payload.text!=='string'||!job.payload.text||job.payload.text.length>10000||utf8.encode(job.payload.text).length>40000)throw failure('INVALID_MAIL_PAYLOAD',422);
  const data=await request(endpoint,{method:'POST',key:job.idempotencyKey,body:{from:mailSender,to:[job.payload.to[0]],
   subject:job.payload.subject,text:job.payload.text,tags:[{name:'wow_message',value:job.id},{name:'wow_workspace',value:job.workspace},{name:'wow_digest',value:job.digest}]}});
  if(!uuid.test(data?.id))throw failure();
  return {id:data.id};
 }
 async function retrieve({providerId,workspace,id,digest}){
  if(!uuid.test(providerId)||!uuid.test(workspace)||!uuid.test(id)||!hash.test(digest))throw failure('INVALID_MAIL_PAYLOAD',422);
  const data=await request(endpoint+'/'+providerId);
  if(data?.id!==providerId)throw failure();
  if(!Object.hasOwn(states,data.last_event))return null;
  const event=eventData(data,states[data.last_event],new Date(now()).toISOString(),'poll-'+providerId+'-'+data.last_event);
  if(event.id!==id||event.workspace!==workspace||event.digest!==digest)throw failure();
  return event;
 }
 async function verifyWebhook(req){
  if(!webhookConfigured)throw failure('MAIL_NOT_CONFIGURED');
  const id=req.headers.get('svix-id')||'',stamp=req.headers.get('svix-timestamp')||'',signatures=req.headers.get('svix-signature')||'';
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(id)||!/^\d{10,12}$/.test(stamp)||Math.abs(now()/1000-Number(stamp))>300||signatures.length>1024)throw failure('INVALID_MAIL_SIGNATURE',401);
  const raw=await bounded(req.body,req.headers,32768);
  if(!signingKey){
   let bytes;try{bytes=Uint8Array.from(atob(webhookSecret.slice(6)),x=>x.charCodeAt(0));}catch{throw failure('MAIL_NOT_CONFIGURED');}
   signingKey=await crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['verify']);
  }
  const signed=utf8.encode(id+'.'+stamp+'.'+raw);let verified=false;
  for(const signature of signatures.trim().split(/\s+/).slice(0,8)){
   if(!/^v1,[A-Za-z0-9+/]{43}=$/.test(signature))continue;
   const bytes=Uint8Array.from(atob(signature.slice(3)),x=>x.charCodeAt(0));
   if(await crypto.subtle.verify('HMAC',signingKey,bytes,signed))verified=true;
  }
  if(!verified)throw failure('INVALID_MAIL_SIGNATURE',401);
  let value;try{value=JSON.parse(raw);}catch{throw failure('INVALID_MAIL_EVENT',400);}
  if(!plain(value)||typeof value.type!=='string')throw failure('INVALID_MAIL_EVENT',400);
  const kind=value.type.startsWith('email.')?value.type.slice(6):'';
  if(!Object.hasOwn(states,kind))return null;
  if(!plain(value.data))throw failure('INVALID_MAIL_EVENT',400);
  // Unrelated mail sent by the same provider account is acknowledged without storage.
  const tags=tagsOf(value.data.tags);if(!tags.wow_message||!tags.wow_workspace||!tags.wow_digest)return null;
  const event=eventData(value.data,states[kind],value.created_at,id);
  if(Date.parse(event.at)>now()+300000)throw failure('INVALID_MAIL_EVENT',400);
  return event;
 }
 return Object.freeze({configured,webhookConfigured,from:mailSender,send,retrieve,verifyWebhook});
}
