// Only these validators and server-generated object handles reach module RPCs.
import {failure} from '../core.mjs';
import {projectDelta} from './delta.mjs';

export const MAX_BYTES = 8 * 1024 * 1024;
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const OBJECT = /^(files|chat)\/([a-f0-9-]{36})\/([a-f0-9-]{36})\/([a-f0-9-]{36})\/([a-f0-9]{64})$/;
export function demand(ok,code='INVALID_REQUEST'){if(!ok)throw failure(code,422);}
export function uuid(value){demand(typeof value==='string'&&UUID.test(value));return value.toLowerCase();}
export function short(value,maximum,empty=false){
  demand(typeof value==='string'&&value.length<=maximum&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)&&(empty||value.trim().length>0));
  return value.trim();
}
export function name(value,maximum=180){
  const clean=short(value,maximum);
  demand(!/[\\/\r\n\t\u202a-\u202e\u2066-\u2069]/.test(clean)&&!/^\.+$/.test(clean));
  return clean;
}
export function integer(value,min,max){demand(Number.isSafeInteger(value)&&value>=min&&value<=max);return value;}
export function choice(value,items){demand(items.includes(value));return value;}
export function bool(value){demand(typeof value==='boolean');return value;}
export function arrayOf(value,validate,limit=100){demand(Array.isArray(value)&&value.length>0&&value.length<=limit);return [...new Set(value.map(x=>validate(x)))];}
export function context(actor){return {userId:uuid(actor?.userId),sessionId:uuid(actor?.sessionId)};}
export function safeObject(path,scope){
  const match=typeof path==='string'&&OBJECT.exec(path);
  if(!match||match[1]!==scope||![match[2],match[3],match[4]].every(id=>UUID.test(id)))throw failure('INVALID_RESPONSE',503);
  return path;
}
const starts=(b,...bytes)=>bytes.every((n,i)=>b[i]===n);
const tag=(b,start,end)=>String.fromCharCode(...b.subarray(start,end));
// Rich office and archive formats are opaque downloads. Uploaded HTML, scripts and SVG never get an inline media type.
export function describeUpload(bytes,filename,declared){
  const ext=filename.toLowerCase().split('.').pop(), mime=(declared||'').split(';')[0].toLowerCase().trim();
  const begins=(...s)=>starts(bytes,...s), at=(i,j)=>tag(bytes,i,j);
  let result;
  if(begins(137,80,78,71,13,10,26,10)){
    demand(bytes.length>=45&&at(12,16)==='IHDR'&&at(bytes.length-8,bytes.length-4)==='IEND','INVALID_MEDIA');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),w=view.getUint32(16),h=view.getUint32(20);
    demand(w>0&&h>0&&w*h<=100000000,'INVALID_MEDIA');result=['image/png','image'];
  }
  else if(begins(255,216,255)){demand(bytes.length>=12&&bytes[bytes.length-2]===255&&bytes[bytes.length-1]===217,'INVALID_MEDIA');result=['image/jpeg','image'];}
  else if(['GIF87a','GIF89a'].includes(at(0,6)))result=['image/gif','image'];
  else if(at(0,4)==='RIFF'&&at(8,12)==='WEBP')result=['image/webp','image'];
  else if(at(0,4)==='RIFF'&&at(8,12)==='WAVE')result=['audio/wav','audio'];
  else if(at(0,4)==='RIFF'&&at(8,12)==='AVI ')result=['video/x-msvideo','video'];
  else if(begins(66,77)&&ext==='bmp')result=['image/bmp','image'];
  else if(begins(73,73,42,0)||begins(77,77,0,42))result=['image/tiff','image'];
  else if(at(4,8)==='ftyp'){
    const brand=at(8,12);
    if(['avif','avis'].includes(brand))result=['image/avif','image'];
    else if(['heic','heix','hevc','mif1','hevx'].includes(brand))result=['image/heic','image'];
    else if(ext==='m4a'||mime==='audio/mp4'||brand==='M4A ')result=['audio/mp4','audio'];
    else result=brand==='qt  '?['video/quicktime','video']:['video/mp4','video'];
  }else if(begins(0x1a,0x45,0xdf,0xa3))result=ext==='mkv'?['video/x-matroska','video']:mime.startsWith('audio/')?['audio/webm','audio']:['video/webm','video'];
  else if(at(0,4)==='OggS')result=['audio/ogg','audio'];
  else if(at(0,4)==='fLaC')result=['audio/flac','audio'];
  else if(at(0,3)==='ID3'||(bytes[0]===255&&(bytes[1]&0xe0)===0xe0&&ext==='mp3'))result=['audio/mpeg','audio'];
  else if(bytes[0]===255&&(bytes[1]&0xf6)===0xf0&&ext==='aac')result=['audio/aac','audio'];
  else if(at(0,5)==='%PDF-'){demand(/%PDF-[12]\.[0-9]/.test(at(0,8))&&at(Math.max(0,bytes.length-1024),bytes.length).includes('%%EOF'),'INVALID_MEDIA');result=['application/pdf','pdf'];}
  else if(begins(80,75,3,4)||begins(80,75,5,6)){
    if(['docx','xlsx','pptx','odt','ods','odp'].includes(ext))result=['application/octet-stream','document'];
    else result=['application/zip','archive'];
  }else if(begins(0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1)&&['doc','xls','ppt'].includes(ext))result=['application/octet-stream','document'];
  else if(begins(0x37,0x7a,0xbc,0xaf,0x27,0x1c)||begins(0x52,0x61,0x72,0x21,0x1a,0x07)||begins(31,139)||at(0,3)==='BZh'||begins(0xfd,0x37,0x7a,0x58,0x5a,0x00)||at(257,262)==='ustar')result=['application/octet-stream','archive'];
  else if(['txt','csv','md','json','log','tsv','rtf'].includes(ext)){
    try {new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw failure('INVALID_MEDIA',422);}
    demand(!bytes.includes(0),'INVALID_MEDIA');result=['text/plain','document'];
  }else {
    const claimedMedia=/^(image|audio|video)\//.test(mime)||['png','jpg','jpeg','gif','webp','bmp','avif','heic','pdf','zip','mp4','webm','mp3','wav','ogg','docx','xlsx','pptx'].includes(ext);
    demand(!claimedMedia&&!['html','htm','xhtml','svg','xml','js','mjs','exe','com','bat','cmd','sh','ps1','apk','msi','jar','lnk'].includes(ext),'INVALID_MEDIA');
    result=['application/octet-stream','other'];
  }
  // A claimed image may never be reinterpreted as an opaque executable or archive.
  if(/^(image|video|audio)\//.test(mime))demand(result[1]===mime.split('/')[0],'INVALID_MEDIA');
  return {mime:result[0],kind:result[1]};
}
export async function parseUpload(body){
  const filename=name(body.name),data=body.data;
  demand(typeof data==='string'&&data.length>0&&data.length<=Math.ceil(MAX_BYTES/3)*4&&data.length%4===0,'INVALID_MEDIA');
  demand(/^[A-Za-z0-9+/]*={0,2}$/.test(data),'INVALID_MEDIA');
  let raw;try{raw=atob(data);}catch{throw failure('INVALID_MEDIA',422);}
  demand(raw.length>0&&raw.length<=MAX_BYTES,'INVALID_MEDIA');
  const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
  const format=describeUpload(bytes,filename,short(body.mime??'',150,true));
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  return {bytes,meta:{requestId:uuid(body.requestId),name:filename,...format,bytes:bytes.length,digest}};
}
export function privateActions(scope,moduleRpc,storage){
  const sql='wow_'+scope+'_service';
  const rpc=(actor,action,data={})=>moduleRpc(sql,action,{...data,...context(actor)});
  async function upload(actor,body,extra){
    const {bytes,meta}=await parseUpload(body),normalized=extra(meta);
    const reservation=await rpc(actor,'reserve',{...meta,...normalized});
    const path=safeObject(reservation.path,scope),id=uuid(reservation.id);
    if(path.split('/')[2]!==uuid(actor.userId)||path.split('/')[3]!==id||path.split('/')[4]!==meta.digest)throw failure('INVALID_RESPONSE',503);
    if(!reservation.ready)await storage.put(path,bytes,meta.mime);
    return rpc(actor,'finish',scope==='files'?{fileId:id}:{assetId:id,roomId:normalized.roomId});
  }
  async function sign(actor,action,data){
    const handle=await rpc(actor,action,data);
    const ttl=integer(handle.ttl,1,action==='share'?300:60);
    const path=safeObject(handle.path,scope),url=new URL(await storage.sign(path,ttl));
    if(action==='share'||data.download||['application/octet-stream','text/plain','application/zip'].includes(handle.mime))url.searchParams.set('download',handle.name);
    return {url:url.href,name:handle.name,mime:handle.mime,digest:path.split('/').at(-1),expiresAt:new Date(Date.now()+ttl*1000).toISOString()};
  }
  // Storage and SQL are separate services. A successful metadata deletion can be acknowledged even while cleanup is pending.
  async function collect(actor){
    if(typeof storage.remove!=='function')return;
    const {objects}=await rpc(actor,'gc');
    for(const entry of objects||[]){
      await storage.remove(safeObject(entry.path,scope));
      await rpc(actor,'gcAck',{[scope==='files'?'fileId':'assetId']:uuid(entry.id)});
    }
  }
  return {rpc,upload,sign,collect};
}

export function createFilesActions({moduleRpc,storage}){
  const {rpc,upload,sign,collect}=privateActions('files',moduleRpc,storage);
  const nullable=v=>v==null?null:uuid(v),ids=v=>arrayOf(v,uuid);
  const handlers={
    list:async(actor,b)=>{
      const result=await rpc(actor,'list',{query:short(b.query??'',160,true),sort:choice(b.sort??'new',['new','old','name','nameDesc','large','small']),
        kind:b.kind==null?null:choice(b.kind,['image','video','audio','pdf','document','archive','other']),folderId:nullable(b.folderId),
        archived:bool(b.archived??false),unfiled:bool(b.unfiled??false),offset:integer(b.offset??0,0,2500)});
      if((b.offset??0)===0&&b.cleanup===true)await collect(actor).catch(()=>{});return projectDelta(result,'files',b._known);
    },
    'folder.create':(actor,b)=>rpc(actor,'folder.create',{name:name(b.name,100)}),
    'folder.rename':(actor,b)=>rpc(actor,'folder.rename',{folderId:uuid(b.folderId),name:name(b.name,100)}),
    'folder.delete':(actor,b)=>rpc(actor,'folder.delete',{folderId:uuid(b.folderId)}),
    upload:(actor,b)=>upload(actor,b,meta=>({folderId:nullable(b.folderId),originalBytes:integer(b.originalBytes??meta.bytes,meta.bytes,64*1024*1024)})),
    open:(actor,b)=>sign(actor,'open',{fileId:uuid(b.fileId),download:bool(b.download??false)}),
    share:(actor,b)=>sign(actor,'share',{fileId:uuid(b.fileId)}),
    rename:(actor,b)=>rpc(actor,'rename',{fileId:uuid(b.fileId),name:name(b.name)}),
    move:(actor,b)=>rpc(actor,'move',{ids:ids(b.ids),folderId:nullable(b.folderId)}),
    archive:(actor,b)=>rpc(actor,'archive',{ids:ids(b.ids),archived:bool(b.archived)}),
    delete:async(actor,b)=>{const result=await rpc(actor,'delete',{ids:ids(b.ids)});await collect(actor).catch(()=>{});return result;}
  };
  return Object.fromEntries(Object.entries(handlers).map(([action,run])=>['files.'+action,({actor,body})=>run(actor,body)]));
}
