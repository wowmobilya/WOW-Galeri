const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const idPattern=new RegExp('^'+UUID+'$');
const publicPath=new RegExp('^(?:/functions/v1/wow-cloud)?/public-share/('+UUID+')/(metadata|image/([0-9a-f]{64})\\.(jpeg|png|webp))$');
const imageLimit=4*1024*1024;
const fail=(code='INVALID_SHARE_INPUT',status=422)=>{throw Object.assign(Error(code),{code,status});};
const id=v=>typeof v==='string'&&idPattern.test(v)?v:fail();
const revision=v=>Number.isSafeInteger(v)&&v>=0?v:fail();
const mime=type=>'image/'+type;
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
const base64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);};
const decode=text=>Uint8Array.from(atob(text.replace(/\s/g,'')),c=>c.charCodeAt(0));
const imageSignature=(bytes,type)=>type==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:
 type==='png'?[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n):
 type==='webp'?[82,73,70,70].every((n,i)=>bytes[i]===n)&&[87,69,66,80].every((n,i)=>bytes[i+8]===n):false;
function origin(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&url.href===url.origin+'/'?url.origin:null;}catch{return null;}}
function siteOrigin(publicOrigin,allowedOrigins){const value=origin(publicOrigin);return value&&allowedOrigins?.includes(value)?value:null;}
async function readBytes(response,limit){
 if(!response.ok||!response.body||Number(response.headers.get('content-length')||0)>limit)fail('SHARE_UNAVAILABLE',503);
 const reader=response.body.getReader(),parts=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;
  if(size>limit){await reader.cancel().catch(()=>{});fail('SHARE_UNAVAILABLE',503);}parts.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;
}
function mutation(body,publish){
 const result={commandId:id(body.commandId),revision:revision(body.revision)};
 if(publish){if(body.confirmed!==true||!['ar','en','tr','fr','ru'].includes(body.language))fail();
  Object.assign(result,{presentationVersion:revision(body.presentationVersion),confirmed:true,language:body.language});}
 return result;
}
export function createPublicShareActions({moduleRpc,storage,projectUrl,publicOrigin,allowedOrigins,fetch:fetcher=globalThis.fetch}){
 const site=siteOrigin(publicOrigin,allowedOrigins),project=origin(projectUrl);
 const rpc=(action,data,actor)=>moduleRpc('wow_public_share_service',action,{...data,userId:actor.userId,sessionId:actor.sessionId});
 const linked=result=>({...result,configured:!!site,url:site&&result.publicId?site+'/share/'+result.publicId+'/':null});
 return {
  'gallery.share.status':async({actor})=>linked(await rpc('gallery.share.status',{},actor)),
  'gallery.share.unpublish':async({body,actor})=>linked(await rpc('gallery.share.unpublish',mutation(body,false),actor)),
  'gallery.share.publish':async({body,actor})=>{
   if(!site||!project)fail('SHARE_NOT_CONFIGURED',503);
   const input=mutation(body,true),prepared=await rpc('gallery.share.prepare',input,actor);
   if(prepared.receipt)return linked(prepared.receipt);
   if(!prepared||!['jpeg','png','webp'].includes(prepared.type)||!/^[0-9a-f]{64}$/.test(prepared.digest)||
    !Number.isSafeInteger(prepared.size)||prepared.size<12||prepared.size>imageLimit||
    typeof prepared.path!=='string'||!new RegExp('^'+UUID+'/gallery/'+UUID+'/'+UUID+'\\.'+prepared.type+'$').test(prepared.path))fail('SHARE_UNAVAILABLE',503);
   const signed=new URL(await storage.sign(prepared.path,60));
   if(signed.origin!==project||signed.username||signed.password||signed.hash||signed.pathname!=='/storage/v1/object/sign/wow-files/'+prepared.path)fail('SHARE_UNAVAILABLE',503);
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
   let bytes;
   try{
    const response=await fetcher(signed.href,{method:'GET',redirect:'error',cache:'no-store',signal:controller.signal,headers:{Accept:mime(prepared.type)}});
    if(response.headers.get('content-type')?.split(';')[0]!==mime(prepared.type))fail('SHARE_UNAVAILABLE',503);
    bytes=await readBytes(response,imageLimit);
   }catch{fail('SHARE_UNAVAILABLE',503);}finally{clearTimeout(timer);}
   if(bytes.length!==prepared.size||!imageSignature(bytes,prepared.type)||await digest(bytes)!==prepared.digest)fail('SHARE_UNAVAILABLE',503);
   // SQL repeats the owner/session, presentation revision, active-image and digest checks
   // after the provider call, before any public projection becomes visible.
   return linked(await rpc('gallery.share.commit',{...input,imageData:base64(bytes)},actor));
  }
 };
}

const publicHeaders={
 'Cache-Control':'no-store','CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; sandbox",
 'Cross-Origin-Resource-Policy':'cross-origin','X-Robots-Tag':'noindex, nofollow'
};
const problem=(status,method)=>new Response(method==='HEAD'?null:status===404?'Not found':'Unavailable',{
 status,headers:{...publicHeaders,'Content-Type':'text/plain; charset=utf-8',...(status===405?{Allow:'GET, HEAD'}:{})}});

// A deliberately public *projection* API. The frontend adapter renders its HTML
// on the application origin; no service credential or session is accepted here.
export function createPublicShareAPI({moduleRpc,publicOrigin,allowedOrigins}){
 const site=siteOrigin(publicOrigin,allowedOrigins);
 return async request=>{
  const method=request.method,url=new URL(request.url),match=publicPath.exec(url.pathname);
  if(!['GET','HEAD'].includes(method))return problem(405,method);
  if(!match||url.search||url.hash)return problem(404,method);
  if(!site)return problem(503,method);
  const [,publicId,kind,imageDigest,type]=match;
  try{
   const metadataOnly=kind==='metadata'||method==='HEAD';
   const result=await moduleRpc('wow_public_share_service',metadataOnly?'public.metadata':'public.image',
    metadataOnly?{publicId}:{publicId,digest:imageDigest,type});
   if(!result)return problem(404,method);
   if(kind==='metadata'){
    const headers={...publicHeaders,'Content-Type':'application/json; charset=utf-8'};
    return new Response(method==='HEAD'?null:JSON.stringify({...result,siteOrigin:site}),{headers});
   }
   if(method==='HEAD'){
    const meta=result.image;
    if(meta?.type!==type||meta?.digest!==imageDigest)return problem(404,method);
    if(!Number.isSafeInteger(meta.size)||meta.size<12||meta.size>imageLimit)return problem(503,method);
    return new Response(null,{headers:{...publicHeaders,'Content-Type':mime(type),'Content-Length':String(meta.size),
     'Content-Disposition':'inline; filename="preview.'+type+'"'}});
   }
   if(result.type!==type||result.digest!==imageDigest||!Number.isSafeInteger(result.size)||result.size<12||result.size>imageLimit||typeof result.data!=='string'||result.data.length>5700000)return problem(503,method);
   const bytes=decode(result.data);
   if(bytes.length!==result.size||!imageSignature(bytes,type)||await digest(bytes)!==imageDigest)return problem(503,method);
   return new Response(method==='HEAD'?null:bytes,{headers:{...publicHeaders,'Content-Type':mime(type),'Content-Length':String(bytes.length),
    'Content-Disposition':'inline; filename="preview.'+type+'"'}});
  }catch{return problem(503,method);}
 };
}
