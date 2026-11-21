const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=(code='INVALID_COMMUNICATION_INPUT',status=422)=>{throw Object.assign(Error(code),{code,status});};
const id=value=>{if(typeof value!=='string'||!UUID.test(value))fail();return value.toLowerCase();};
const integer=(value,max=1000000)=>{if(!Number.isSafeInteger(value)||value<0||value>max)fail();return value;};
const choice=(value,options)=>{if(!options.includes(value))fail();return value;};
function text(value,max,required=false){
 if(value==null&&!required)return '';
 if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))fail();
 const clean=value.normalize('NFC').trim();if(required&&!clean)fail();return clean;
}
const subject=value=>{const clean=text(value,200);if(/[\r\n]/.test(clean))fail();return clean;};
const language=value=>choice(value,['ar','en','tr','fr','ru']);
function source(value){
 if(!value||typeof value!=='object'||Array.isArray(value))fail();
 const kind=choice(value.kind,['company','order']);let key=value.id;
 if(kind==='order')key=id(key);else if(typeof key==='number'){if(!Number.isSafeInteger(key))fail();}else key=text(key,180,true);
 return {kind,id:key};
}
function content(value){const clean=text(value,10000,true);if(new TextEncoder().encode(clean).length>40000)fail();return clean;}
function template(value){
 const clean=content(value),matches=clean.matchAll(/\{\{(.*?)\}\}/g);
 for(const match of matches)if(!['name','company','order','status'].includes(match[1]))fail('INVALID_TEMPLATE_VARIABLE');
 return clean;
}
const reads=new Set(['status','contacts','recipient','list','detail','templates','reconcile']);
export function validateCommunicationAction(action,body){
 if(!body||typeof body!=='object'||Array.isArray(body))fail();
 const a=action.replace(/^communications\./,''),page=()=>({offset:integer(body.offset??0),limit:Math.max(1,integer(body.limit??25,50)),search:text(body.search,100)});
 let data={};
 if(a==='status'||a==='templates')data={};
 else if(a==='recipient')data={source:source(body.source)};
 else if(a==='contacts')data={...page(),kind:choice(body.kind,['company','order'])};
 else if(a==='list')data={...page(),channel:choice(body.channel??'',['','email','whatsapp','mail','share']),
  status:choice(body.status??'',['','draft','prepared','queued','sending','retry','accepted','delayed','delivered','bounced','complained','failed','uncertain','cancelled','suppressed'])};
 else if(a==='detail'||a==='reconcile')data={id:id(body.id)};
 else if(a==='save')data={id:id(body.id),version:integer(body.version??0),source:source(body.source),channel:choice(body.channel,['email','whatsapp','mail','share']),
  language:language(body.language),subject:subject(body.subject),body:content(body.body)};
 else if(['send','prepare','cancel'].includes(a))data={id:id(body.id),version:integer(body.version)};
 else if(a==='delete'){
  if(!Array.isArray(body.ids)||body.ids.length<1||body.ids.length>50)fail();data={ids:body.ids.map(id)};if(new Set(data.ids).size!==data.ids.length)fail();
 }else if(a==='template.save')data={id:id(body.id),version:integer(body.version??0),name:text(body.name,80,true),language:language(body.language),subject:subject(template(body.subject||' ')),body:template(body.body)};
 else if(a==='template.delete')data={id:id(body.id),version:integer(body.version)};
 else fail('INVALID_COMMUNICATION_ACTION');
 if(!reads.has(a))data.commandId=id(body.commandId);return data;
}

export function createCommunications({moduleRpc,workerRpc,provider}){
 const invoke=(action,data,actor)=>moduleRpc('wow_communications_service',action,{...data,userId:actor.userId,sessionId:actor.sessionId});
 async function processOne(job){
  if(!UUID.test(job?.id)||!UUID.test(job?.lease))fail('MAIL_WORKER_UNAVAILABLE',503);
  const handle={id:job.id,lease:job.lease},prepared=await workerRpc('prepare',handle);
  if(['gone','paused','cancelled','uncertain'].includes(prepared?.status))return;
  if(prepared?.status!=='ready')fail('MAIL_WORKER_UNAVAILABLE',503);
  let outcome='accepted',result;
  try{result=await provider.send(prepared);}catch(error){outcome=error?.permanent===true?'failed':'retry';}
  await workerRpc('finish',{...handle,outcome,...(result?.id?{providerId:result.id}:{})});
 }
 async function process(onlyId){
  if(provider?.configured!==true)return;
  const claimed=await workerRpc('claim',onlyId?{id:id(onlyId)}:{});
  if(!Array.isArray(claimed?.jobs)||claimed.jobs.length>6)fail('MAIL_WORKER_UNAVAILABLE',503);
  let next=0,failed=false;
  await Promise.all(Array.from({length:Math.min(2,claimed.jobs.length)},async()=>{
   while(next<claimed.jobs.length){try{await processOne(claimed.jobs[next++]);}catch{failed=true;}}
  }));
  if(failed)fail('MAIL_WORKER_UNAVAILABLE',503);
 }
 const actions={};
 for(const suffix of ['status','contacts','recipient','list','detail','templates','save','send','prepare','cancel','delete','template.save','template.delete','reconcile']){
  const action='communications.'+suffix;
  actions[action]=async({body,actor})=>{
   const data=validateCommunicationAction(action,body);
   if(suffix==='status')return {...await invoke(action,data,actor),provider:{configured:provider?.configured===true,webhookConfigured:provider?.webhookConfigured===true,from:provider?.from||''}};
   if(suffix==='send'){
    if(provider?.configured!==true)fail('MAIL_NOT_CONFIGURED',503);
    const queued=await invoke(action,{...data,providerFrom:provider.from},actor);
    if(queued.message?.status==='queued')await process(data.id).catch(()=>{});
    return invoke('communications.detail',{id:data.id},actor);
   }
   if(suffix==='reconcile'){
    const current=await invoke('communications.poll.prepare',data,actor);
    if(current.providerId&&provider?.configured===true){
     const event=await provider.retrieve({providerId:current.providerId,workspace:current.workspace,id:data.id,digest:current.digest});
     if(event)await workerRpc('event',event);
    }
    return invoke('communications.detail',data,actor);
   }
   return invoke(action,data,actor);
  };
 }
 async function webhook(req){
  if(req.method!=='POST')return new Response(null,{status:405,headers:{Allow:'POST'}});
  try{const event=await provider.verifyWebhook(req);if(event)await workerRpc('event',event);
   return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  }catch(error){const status=[400,401,413].includes(error?.status)?error.status:503;
   return Response.json({ok:false,error:status===503?'MAIL_UNAVAILABLE':'INVALID_MAIL_EVENT'},{status,headers:{'Cache-Control':'no-store'}});
  }
 }
 return Object.freeze({actions,process,webhook});
}
