/* WOW Edge service. No browser-provided role, permissions, account id or session
 * epoch is authoritative. Database calls use verified Auth identity and a live
 * server session; SQL repeats authorization inside every committing transaction. */
import {derivePushEvents} from './push-events.mjs';
import {normalizeSubscription,normalizeDevice,normalizeLanguage,digest,validatePushEndpoint} from './push-security.mjs';
const STORES = new Set(['companies','products','invoices','payments','settings','media']);
const ACTIONS = new Set(['auth.enrollOwner','auth.signIn','auth.refresh','auth.signOut','session.snapshot','session.touch',
  'accounts.create','accounts.update','accounts.status','accounts.restore','accounts.setPassword','accounts.changePassword',
  'accounts.revokeSessions','permissions.assert','activity.record','sync.pull','sync.push','sync.inspect','media.upload','media.download',
  'push.config','push.subscribe','push.unsubscribe','push.test']);
const PUBLIC_ACTIONS = new Set(['auth.enrollOwner','auth.signIn','auth.refresh']);
const MIME_EXT = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/avif':'avif','image/svg+xml':'svg'};
const encoder = new TextEncoder();
const own = (v,k) => Object.prototype.hasOwnProperty.call(v || {},k);
const plain = v => !!v && typeof v === 'object' && !Array.isArray(v);
const copy = v => v == null ? v : structuredClone(v);
const rowKey = (store,id) => store + ':' + JSON.stringify(id);
const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 180 && !/[\u0000-\u001f]/.test(id) || Number.isSafeInteger(id);

export function failure(code,status=400,details={}) {
  const e = new Error(code); e.code = code; e.status = status; Object.assign(e,details); return e;
}
function requireValue(condition,code='INVALID_REQUEST',status=422) { if (!condition) throw failure(code,status); }
function textValue(value,max,code,required=false,multiline=false) {
  if (value == null && !required) return '';
  requireValue(typeof value === 'string',code);
  const result = value.trim().normalize('NFC');
  requireValue((!required || !!result) && Array.from(result).length <= max && !(multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(result),code);
  return result;
}
export function normalizeUsername(value) {
  requireValue(typeof value === 'string','INVALID_USERNAME');
  const name = value.trim().normalize('NFC').toLowerCase().normalize('NFC');
  requireValue(/^[\p{L}\p{N}._@-]{3,64}$/u.test(name),'INVALID_USERNAME'); return name;
}
function password(value) { requireValue(typeof value === 'string' && Array.from(value).length >= 12 && Array.from(value).length <= 128,'INVALID_PASSWORD'); return value; }
export function normalizeProfile(input,policy) {
  requireValue(plain(input),'INVALID_CHANGE');
  const role = input.role || 'custom'; requireValue(policy.roles.some(r => r.id === role),'INVALID_ROLE');
  let expiresAt = null;
  if (input.expiresAt != null && input.expiresAt !== '') {
    requireValue(typeof input.expiresAt === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(input.expiresAt) && Number.isFinite(Date.parse(input.expiresAt)),'INVALID_EXPIRY');
    expiresAt = new Date(input.expiresAt).toISOString();
  }
  requireValue(role!=='owner'||expiresAt===null,'INVALID_OWNER_EXPIRY');
  return {name:textValue(input.name,100,'INVALID_NAME',true),username:normalizeUsername(input.username),role,
    permissions:policy.normalizePermissions(role,input.permissions === undefined ? policy.presets(role) : input.permissions),
    department:textValue(input.department,80,'INVALID_DEPARTMENT'),note:textValue(input.note,1000,'INVALID_NOTE',false,true),expiresAt};
}
function validateJSON(value,depth=0) {
  requireValue(depth <= 32,'INVALID_RECORD');
  if (value === null || ['string','boolean'].includes(typeof value)) return;
  if (typeof value === 'number') { requireValue(Number.isFinite(value),'INVALID_RECORD'); return; }
  requireValue(typeof value === 'object','INVALID_RECORD');
  for (const key of Object.keys(value)) {
    requireValue(!['__proto__','prototype','constructor'].includes(key),'INVALID_RECORD'); validateJSON(value[key],depth+1);
  }
}
// Apply a difference of the actor's visible record to the raw record. An omitted
// secret is preserved; an explicitly injected secret still reaches validation.
function visibleMerge(raw,visible,next,same) {
  if (same(visible,next)) return copy(raw);
  if (Array.isArray(next) && Array.isArray(visible) && Array.isArray(raw)) {
    const identity = v => plain(v) ? (v.lineId != null ? 'line:'+JSON.stringify(v.lineId) : v.id != null ? 'id:'+JSON.stringify(v.id) : null) : null;
    const used = new Set();
    return next.map((entry,index) => {
      const key=identity(entry); let before=-1;
      if (key) {
        const matches=visible.map((v,i)=>({v,i})).filter(x=>!used.has(x.i)&&identity(x.v)===key);
        if (matches.length===1) before=matches[0].i;
      } else if (index<visible.length && !used.has(index) && !identity(visible[index])) before=index;
      if (before<0) return copy(entry); used.add(before);
      return visibleMerge(raw[before],visible[before],entry,same);
    });
  }
  if (!plain(raw) || !plain(visible) || !plain(next)) return copy(next);
  const result=copy(raw);
  for (const key of new Set([...Object.keys(visible),...Object.keys(next)])) {
    if (!own(next,key)) { delete result[key]; continue; }
    if (!own(visible,key)) { result[key]=copy(next[key]); continue; }
    result[key]=visibleMerge(raw[key],visible[key],next[key],same);
  }
  return result;
}
export function mediaRefs(value,result=new Set(),depth=0) {
  if (depth>32) return result;
  if (typeof value === 'string' && value.startsWith('wfmedia:') && value.length>8 && value.length<=188) result.add(value.slice(8));
  else if (value && typeof value === 'object') for (const next of Object.values(value)) mediaRefs(next,result,depth+1);
  return result;
}
function mediaWritable(account,policy) { return ['customers.edit','products.edit','invoices.edit','tasks.edit','materials.edit','purchasing.edit','settings.edit'].some(p=>policy.can(account,p)); }
export function prepareBatch({context,operations,records=[],products=[],uploads=[],policy,dataPolicy,costCore,now=Date.now}) {
  requireValue(Array.isArray(operations) && operations.length>0 && operations.length<=100,'INVALID_BATCH');
  const map=new Map(records.map(r=>[rowKey(r.store,r.id),r])),seen=new Set(),conflicts=[];
  // Validate structural input before looking at raw records or trusting cost data.
  for (const op of operations) {
    requireValue(plain(op) && STORES.has(op.store) && validId(op.id) && ['put','delete'].includes(op.kind) && Number.isSafeInteger(op.baseRevision) && op.baseRevision>=0,'INVALID_OPERATION');
    const key=rowKey(op.store,op.id);requireValue(!seen.has(key),'INVALID_DUPLICATE_OPERATION');seen.add(key);
    if(op.kind==='put') {
      requireValue(plain(op.value) && op.value.id===op.id,'INVALID_RECORD_ID'); validateJSON(op.value);
      requireValue(encoder.encode(JSON.stringify(op.value)).length<=1024*1024,'RECORD_TOO_LARGE');
    }
    const actual=map.get(key)?.revision || 0;
    if(actual!==op.baseRevision) conflicts.push({store:op.store,id:op.id,expectedRevision:op.baseRevision,actualRevision:actual});
  }
  if(conflicts.length) throw failure('CONFLICT',409,{conflicts});
  const account=context.account,prepared=[];
  for(const op of operations) {
    const prior=map.get(rowKey(op.store,op.id)),latest=prior && !prior.deleted ? prior.value : null;
    if(op.kind==='delete') {
      dataPolicy.validateWrite(account,{store:op.store,id:op.id,type:'delete'},latest,null);
      prepared.push({...op,value:null,mediaRefs:[]});continue;
    }
    let value=copy(op.value);
    if(op.store==='media') {
      requireValue(typeof value.storagePath==='string' && !own(value,'data') && !own(value,'blob'),'INVALID_MEDIA');
      const staged=uploads.find(u=>u.storagePath===value.storagePath && u.id===op.id && u.ready===true);
      const unchanged=latest?.storagePath===value.storagePath;
      requireValue(unchanged || !!staged,'MEDIA_NOT_UPLOADED',409);
      if(account.role!=='owner') requireValue(mediaWritable(account,policy) && (!latest || unchanged) && (unchanged || staged.accountId===account.id),'ACCESS_DENIED',403);
      value={id:op.id,storagePath:value.storagePath,kind:'image',size:staged?.size ?? latest?.size,
        contentType:staged?.contentType ?? latest?.contentType,updatedAt:staged?.updatedAt ?? latest?.updatedAt};
    } else {
      const visible=latest && dataPolicy.projectRead(account,op.store,latest);
      if(latest && visible===undefined) throw failure('ACCESS_DENIED',403);
      if(latest) value=visibleMerge(latest,visible,value,dataPolicy.sameJSON);
      value=dataPolicy.preserveRestrictedFields(account,op.store,latest,value);
      dataPolicy.validateWrite(account,{store:op.store,id:op.id,type:latest?'merge':'put',value},latest,value);
      if(op.store==='invoices') value=dataPolicy.captureTrustedInvoiceCosts(account,latest,value,products.filter(p=>!p.deleted).map(p=>p.value),costCore,new Date(now()).toISOString());
    }
    prepared.push({...op,value,mediaRefs:[...mediaRefs(value)]});
  }
  return {operations:prepared,guards:products.map(p=>({store:'products',id:p.id,revision:p.revision})),expectedSessionVersion:account.sessionVersion};
}
export function projectChange(account,row,{dataPolicy,allowMedia=false}) {
  if(row.store==='media' && account.role!=='owner' && !allowMedia) return null;
  const deleted=row.deleted===true || row.kind==='delete';
  const projected=row.store==='media' && allowMedia ? copy(row.value) : dataPolicy.projectRead(account,row.store,deleted?{id:row.id}:row.value);
  if(projected===undefined) return null;
  return {store:row.store,id:row.id,revision:row.revision,deleted,...(!deleted?{value:projected}:{})};
}
function jwtSession(token) {
  try {
    const encoded=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    const claim=JSON.parse(atob(encoded));
    requireValue(typeof claim.session_id==='string' && /^[0-9a-f-]{36}$/i.test(claim.session_id),'AUTH_REQUIRED',401);
    return claim.session_id;
  } catch(_) { throw failure('AUTH_REQUIRED',401); }
}
export async function sha256(value) {
  const bytes=typeof value==='string'?encoder.encode(value):value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function sessionResult(session) {
  requireValue(session && typeof session.access_token==='string' && typeof session.refresh_token==='string','AUTH_REQUIRED',401);
  return {access_token:session.access_token,refresh_token:session.refresh_token,expires_at:session.expires_at || Math.floor(Date.now()/1000)+(session.expires_in || 3600)};
}
function safeError(error) {
  const known = typeof error?.code==='string' && /^[A-Z][A-Z0-9_]{2,60}$/.test(error.code);
  const code=known?error.code:'SERVICE_UNAVAILABLE';
  let status=Number.isInteger(error?.status)?error.status:0;
  if(!status) status=code==='ACCESS_DENIED'||code==='PERMISSION_DENIED'?403:code.startsWith('INVALID_')?422:503;
  return {status:Math.min(599,Math.max(400,status)),body:{ok:false,error:{code,message:code,
    ...(Array.isArray(error?.conflicts)?{conflicts:error.conflicts}:{}),...(error?.retryAfter?{retryAfter:error.retryAfter}:{})}}};
}

export function createHandler(deps) {
  const {rpc,auth,storage,policy,dataPolicy,costCore,now=Date.now}=deps;
  const allowedOrigins=new Set(deps.origins||[]);
  // Only server-assembled modules extend this allowlist. They cannot replace a
  // core/public action, and ordinary modules run after Auth verifies the bearer.
  const moduleActions=new Map(Object.entries(deps.moduleActions||{}));
  for(const [action,handler] of moduleActions)requireValue(typeof action==='string'&&/^[a-z][a-zA-Z0-9.]{2,79}$/.test(action)&&!ACTIONS.has(action)&&typeof handler==='function','SERVER_CONFIGURATION',503);
  // These four customer email endpoints perform their own one-time Auth proof.
  // The explicit names prevent an extension from making arbitrary modules public.
  const publicActions=new Map(Object.entries(deps.publicActions||{}));
  for(const [action,handler] of publicActions)requireValue(/^auth\.customer(?:Options|Register|Recover|Verify)$/.test(action)&&!moduleActions.has(action)&&typeof handler==='function','SERVER_CONFIGURATION',503);
  const knownAction=action=>ACTIONS.has(action)||moduleActions.has(action)||publicActions.has(action);
  const snapshot=(actor,expectedSessionVersion) => rpc('session.snapshot',{...actor,expectedSessionVersion});
  async function verifyToken(token) {
    requireValue(typeof token==='string' && token.length>0,'AUTH_REQUIRED',401);
    let user;try{user=await auth.getUser(token);}catch(error){if(error?.status>=500||error?.status===429)throw error;throw failure('AUTH_REQUIRED',401);}
    requireValue(user && typeof user.id==='string' && user.is_anonymous!==true,'AUTH_REQUIRED',401);
    return {userId:user.id,sessionId:jwtSession(token)};
  }
  async function authenticatedResult(session,open) {
    const clean=sessionResult(session),actor=await verifyToken(clean.access_token);
    const state=await rpc(open?'session.open':'session.snapshot',actor);
    return {ok:true,session:clean,workspaceId:state.workspaceId,identity:state.identity};
  }
  async function resolveMedia(actor,context,ids) {
    if(!ids.length)return [];
    const wanted=[...new Set(ids)];requireValue(wanted.length<=300,'MEDIA_LOOKUP_LIMIT',503);
    const base={...actor,expectedSessionVersion:context.account.sessionVersion};
    const result=await rpc('media.resolve',{...base,ids:wanted}),rows=result.records||[];
    if(context.account.role==='owner')return rows;
    // Legacy record IDs are typed but wfmedia references are strings. Never
    // expose both a numeric and a string alias through one permitted reference.
    const aliases=new Set();
    for(const row of rows){requireValue(!aliases.has(String(row.id)),'INVALID_MEDIA_REFERENCE',422);aliases.add(String(row.id));}
    // A widely reused photo must not expand to an unbounded aggregation of raw
    // invoices. Seek through bounded reference pages and stop when a visible
    // reference proves access. Budget exhaustion is explicit, never a silent
    // cursor advance that would discard an unresolved media change.
    const pending=new Set(rows.map(row=>String(row.id))),allowed=new Set();let after=null,total=0;
    for(let page=0;pending.size&&page<16;page++){
      const refs=await rpc('media.references',{...base,ids:[...pending],after});
      total+=encoder.encode(JSON.stringify(refs.references||[])).length;
      requireValue(total<=8*1024*1024,'MEDIA_LOOKUP_LIMIT',503);
      for(const ref of refs.references||[]){
        const visible=dataPolicy.projectRead(context.account,ref.store,ref.value);
        if(visible)for(const id of mediaRefs(visible))if(pending.has(id)){allowed.add(id);pending.delete(id);}
      }
      if(!refs.hasMore||!pending.size)return rows.filter(row=>allowed.has(String(row.id)));
      requireValue(refs.cursor&&JSON.stringify(refs.cursor)!==JSON.stringify(after),'INVALID_RESPONSE',503);after=refs.cursor;
    }
    requireValue(!pending.size,'MEDIA_LOOKUP_LIMIT',503);
    return rows.filter(row=>allowed.has(String(row.id)));
  }
  async function authorizeNewMediaReferences(actor,prepared,batch) {
    const account=prepared.context.account;
    if(account.role==='owner')return;
    const old=new Map((prepared.records||[]).map(row=>[rowKey(row.store,row.id),row]));
    const required=new Set();
    for(const op of batch.operations){
      if(op.kind==='delete')continue;
      if(op.store==='media'){required.add(String(op.id));continue;}
      const previous=old.get(rowKey(op.store,op.id));
      const before=mediaRefs(previous&&!previous.deleted?dataPolicy.projectRead(account,op.store,previous.value):null);
      const after=mediaRefs(dataPolicy.projectRead(account,op.store,op.value));
      for(const id of after)if(!before.has(id))required.add(id);
    }
    if(!required.size)return;
    requireValue(required.size<=300,'MEDIA_LOOKUP_LIMIT',503);
    // Reads used as authorization witnesses must still describe the same
    // committed workspace when SQL installs the new links. This internal CAS
    // contains no private record IDs or field names in its conflict response.
    requireValue(Number.isSafeInteger(prepared.context.dataRevision)&&prepared.context.dataRevision>=0,'INVALID_RESPONSE',503);
    batch.mediaDataRevision=prepared.context.dataRevision;
    const resolved=await rpc('media.resolve',{...actor,ids:[...required],expectedSessionVersion:account.sessionVersion});
    const effective=new Map((resolved.records||[]).filter(row=>!row.deleted).map(row=>[rowKey('media',row.id),row]));
    for(const op of batch.operations)if(op.store==='media'){
      const key=rowKey('media',op.id);
      if(op.kind==='delete')effective.delete(key);else effective.set(key,{id:op.id,value:op.value});
    }
    const remaining=[];
    for(const id of required){
      const candidates=[...effective.values()].filter(row=>String(row.id)===id);
      requireValue(candidates.length===1,'ACCESS_DENIED',403);
      const row=candidates[0];
      const owned=(prepared.uploads||[]).some(upload=>upload.ready===true&&upload.accountId===account.id&&
        upload.id===row.id&&upload.storagePath===row.value.storagePath);
      if(!owned)remaining.push(id);
    }
    if(remaining.length){
      // Only OLD committed, visible documents can grant a reusable reference.
      // Candidate writes and hidden fields cannot manufacture that permission.
      const readable=await resolveMedia(actor,prepared.context,remaining),allowed=new Set(readable.filter(row=>!row.deleted).map(row=>String(row.id)));
      requireValue(remaining.every(id=>allowed.has(id)),'ACCESS_DENIED',403);
    }
  }
  async function run(body,request) {
    const {action}=body;requireValue(knownAction(action),'UNKNOWN_ACTION',400);
    if(publicActions.has(action))return {ok:true,...await publicActions.get(action)({body,request})};
    if(action==='auth.enrollOwner') {
      requireValue(typeof body.setupToken==='string' && body.setupToken.length>=32 && body.setupToken.length<=256,'SETUP_PROOF_REQUIRED',403);
      const profile=normalizeProfile({...body,role:'owner',expiresAt:null},policy),pass=password(body.password),claimHash=await sha256(body.setupToken);
      const setup=await rpc('setup.inspect',{claimHash});
      const email=crypto.randomUUID()+'@wow.invalid';let created;
      try {
        created=await auth.createUser({email,password:pass,email_confirm:true,user_metadata:{wow:true}});
        requireValue(created?.id,'SERVICE_UNAVAILABLE',503);
        await rpc('setup.claim',{claimHash,userId:created.id,email,profile,workspaceId:setup.workspaceId});
      } catch(error) { if(created?.id)try{await auth.deleteUser(created.id);}catch(_){} throw error; }
      return authenticatedResult(await auth.signIn(email,pass),true);
    }
    if(action==='auth.signIn') {
      const username=normalizeUsername(body.username);requireValue(typeof body.password==='string'&&body.password.length<=512,'AUTH_REQUIRED',401);
      const login=await rpc('auth.resolve',{workspaceId:body.workspaceId||null,username});
      let session;
      try { session=await auth.signIn(login.email||'unknown@wow.invalid',body.password); }
      catch(error) { if(error?.status>=500||error?.status===429)throw error;await rpc('auth.failed',{attemptId:login.attemptId}); throw failure('AUTH_REQUIRED',401); }
      if(!login.email || session.user?.id && session.user.id!==login.userId) throw failure('AUTH_REQUIRED',401);
      const result=await authenticatedResult(session,true);
      await rpc('auth.succeeded',{attemptId:login.attemptId,userId:login.userId});
      return result;
    }
    if(action==='auth.refresh') {
      requireValue(typeof body.refreshToken==='string'&&body.refreshToken.length>0&&body.refreshToken.length<=4096,'AUTH_REQUIRED',401);
      let session;try{session=await auth.refresh(body.refreshToken);}catch(error){if(error?.status>=500||error?.status===429)throw error;throw failure('AUTH_REQUIRED',401);}
      return authenticatedResult(session,false); // Refresh is never employee activity.
    }
    const token=(request.headers.get('authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1];
    const actor=await verifyToken(token);
    if(moduleActions.has(action))return {ok:true,...await moduleActions.get(action)({body,actor,request})};
    if(action==='auth.signOut') {
      await rpc('session.close',actor);try{await auth.signOut(token);}catch(_){}return {ok:true};
    }
    if(action==='session.snapshot'||action==='session.touch') return {ok:true,...await rpc(action,actor)};
    if(action.startsWith('push.')) {
      const state=await snapshot(actor),account=state.identity.currentAccount;
      requireValue(action==='push.unsubscribe'||account.role==='owner'||
        ['chat.view','gallery.view','orders.view','myorders.view'].some(permission=>account.permissions?.includes(permission)),'ACCESS_DENIED',403);
      const data={...actor,expectedSessionVersion:account.sessionVersion};
      if(action!=='push.config')data.deviceId=normalizeDevice(body.deviceId);
      if(action==='push.subscribe'){
        data.subscription=await normalizeSubscription(body.subscription,now());
        data.endpointHash=await digest(data.subscription.endpoint);data.language=normalizeLanguage(body.language);
      }
      if(action==='push.unsubscribe'){data.endpoint=validatePushEndpoint(body.endpoint);data.endpointHash=await digest(data.endpoint);}
      return {ok:true,...await rpc(action,data)};
    }
    if(action==='sync.push') {
      requireValue(typeof body.batchId==='string'&&/^[A-Za-z0-9_.:-]{8,120}$/.test(body.batchId),'INVALID_BATCH_ID');
      requireValue(typeof body.deviceId==='string'&&body.deviceId.length>0&&body.deviceId.length<=120,'INVALID_DEVICE_ID');
      requireValue(Array.isArray(body.operations)&&body.operations.length>0&&body.operations.length<=100,'INVALID_BATCH');
      requireValue(encoder.encode(JSON.stringify(body.operations)).length<=4*1024*1024,'BATCH_TOO_LARGE');
      const origin=body.origin??'live';requireValue(['live','bootstrap','restore'].includes(origin),'INVALID_SYNC_ORIGIN');
      const productIds=new Set(),relatedInvoiceIds=new Set(),incomingMedia=new Set();
      for(const op of body.operations)if(op?.store==='invoices'&&Array.isArray(op.value?.items))for(const item of op.value.items)if(item?.productId!=null)productIds.add(String(item.productId));
      for(const op of body.operations)if(op?.store==='payments'&&validId(op.value?.invoiceId))relatedInvoiceIds.add(JSON.stringify(op.value.invoiceId));
      for(const op of body.operations)for(const id of mediaRefs(op?.value))incomingMedia.add(id);
      requireValue(productIds.size<=1000,'INVALID_BATCH');
      requireValue(incomingMedia.size<=300,'MEDIA_LOOKUP_LIMIT',503);
      const requestHash=await sha256(JSON.stringify({deviceId:body.deviceId,operations:body.operations,origin}));
      for(let attempt=0;attempt<3;attempt++){
        const prepared=await rpc('sync.prepare',{...actor,batchId:body.batchId,requestHash,origin,keys:body.operations.map(op=>({store:op?.store,id:op?.id})),productIds:[...productIds],mediaIds:[...incomingMedia],relatedInvoiceIds:[...relatedInvoiceIds].map(value=>JSON.parse(value))});
        if(prepared.replay) return {ok:true,...prepared.replay};
        requireValue(origin==='live'||prepared.context.account.role==='owner','ACCESS_DENIED',403);
        const batch=prepareBatch({...deps,context:prepared.context,operations:body.operations,records:prepared.records,products:prepared.products,uploads:prepared.uploads});
        await authorizeNewMediaReferences(actor,prepared,batch);
        const pushEvents=origin==='live'?derivePushEvents({operations:batch.operations,records:prepared.records,relatedInvoices:prepared.relatedInvoices,actorName:prepared.context.account.name}):[];
        const projected=batch.operations.map(op=>projectChange(prepared.context.account,{...op,revision:op.baseRevision+1},{dataPolicy,allowMedia:op.store==='media'})).filter(Boolean);
        try{
          const result=await rpc('sync.commit',{...actor,...batch,batchId:body.batchId,deviceId:body.deviceId,requestHash,projected,sourceProductIds:[...productIds],origin,pushEvents});
          return {ok:true,...result};
        }catch(error){
          if(error?.code!=='MEDIA_RECHECK_REQUIRED')throw error;
          if(attempt===2)throw failure('MEDIA_RECHECK_REQUIRED',503,{retryAfter:1});
        }
      }
    }
    if(action==='sync.inspect') {
      requireValue(Array.isArray(body.records)&&body.records.length>0&&body.records.length<=100&&body.records.every(r=>STORES.has(r?.store)&&validId(r.id)),'INVALID_BATCH');
      return {ok:true,...await rpc('sync.inspect',{...actor,records:body.records})};
    }
    if(action==='sync.pull') {
      requireValue(Number.isSafeInteger(body.cursor??0)&&(body.cursor??0)>=0,'INVALID_CURSOR');
      const limit=Math.min(100,Math.max(1,Math.trunc(Number(body.limit)||100)));
      const result=await rpc('sync.pull',{...actor,cursor:body.cursor||0,limit});
      const changes=(result.records||[]).map(row=>projectChange(result.context.account,row,{dataPolicy})).filter(Boolean);
      const mediaIds=new Set();for(const change of changes)for(const id of mediaRefs(change.value))mediaIds.add(id);
      for(const row of result.records||[])if(row.store==='media')mediaIds.add(String(row.id));
      const media=await resolveMedia(actor,result.context,[...mediaIds]);
      const byKey=new Map(changes.map(row=>[rowKey(row.store,row.id),row]));
      for(const row of media)byKey.set(rowKey('media',row.id),projectChange(result.context.account,row,{dataPolicy,allowMedia:true}));
      return {ok:true,changes:[...byKey.values()].filter(Boolean),cursor:result.cursor,hasMore:result.hasMore};
    }
    if(action==='media.upload') {
      requireValue(validId(body.id)&&typeof body.data==='string','INVALID_MEDIA');
      const match=/^data:(image\/(?:png|jpeg|webp|gif|avif|svg\+xml));base64,([A-Za-z0-9+/]*={0,2})$/.exec(body.data);
      requireValue(!!match,'UNSUPPORTED_MEDIA');
      let bytes;try{bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));}catch(_){throw failure('INVALID_MEDIA',422);}
      requireValue(bytes.length>0&&bytes.length<=8*1024*1024,'MEDIA_TOO_LARGE');
      const state=await snapshot(actor),context={workspaceId:state.workspaceId,account:state.identity.currentAccount};
      requireValue(mediaWritable(context.account,policy),'ACCESS_DENIED',403);
      const storagePath=context.workspaceId+'/'+await sha256(JSON.stringify(body.id))+'/'+await sha256(bytes)+'.'+MIME_EXT[match[1]];
      const record={id:body.id,storagePath,kind:'image',size:bytes.length,contentType:match[1],updatedAt:new Date(now()).toISOString()};
      const staged=await rpc('media.stage',{...actor,record,expectedSessionVersion:context.account.sessionVersion});
      await storage.put(storagePath,bytes,match[1]);
      const ready=await rpc('media.ready',{...actor,storagePath,expectedSessionVersion:context.account.sessionVersion});
      const canonical=ready.record||staged.record;
      requireValue(canonical?.id===body.id&&canonical.storagePath===storagePath&&typeof canonical.updatedAt==='string','INVALID_RESPONSE',503);
      return {ok:true,record:canonical};
    }
    if(action==='media.download') {
      requireValue(validId(body.id)&&typeof body.storagePath==='string','INVALID_MEDIA');
      const state=await snapshot(actor),context={workspaceId:state.workspaceId,account:state.identity.currentAccount};
      const rows=await resolveMedia(actor,context,[String(body.id)]),record=rows.find(row=>row.id===body.id&&!row.deleted);
      requireValue(!!record,'ACCESS_DENIED',403);
      requireValue(record.value.storagePath===body.storagePath,'MEDIA_REVISION_MISMATCH',409);
      return {ok:true,url:await storage.sign(body.storagePath,60),expiresAt:new Date(now()+60000).toISOString(),contentType:record.value.contentType};
    }
    const state=await snapshot(actor),account=state.identity.currentAccount;
    if(action==='permissions.assert') { requireValue(typeof body.permission==='string'&&policy.can(account,body.permission),'ACCESS_DENIED',403);return {ok:true}; }
    if(action==='activity.record') {
      const payload=body.payload||{};
      const event={action:textValue(payload.action,80,'INVALID_ACTIVITY',true),targetType:textValue(payload.targetType,40,'INVALID_ACTIVITY'),targetId:textValue(payload.targetId,180,'INVALID_ACTIVITY')};
      return {ok:true,...await rpc('activity.record',{...actor,event,expectedSessionVersion:account.sessionVersion})};
    }
    if(action==='accounts.changePassword') {
      const newPassword=password(body.newPassword);requireValue(typeof body.currentPassword==='string','INVALID_PASSWORD');
      const target=await rpc('account.credentials',actor);
      let check;try{check=await auth.signIn(target.email,body.currentPassword);}catch(error){if(error?.status>=500||error?.status===429)throw error;throw failure('CURRENT_PASSWORD_INCORRECT',403);}
      try {const verified=await verifyToken(check?.access_token);requireValue(verified.userId===account.id,'CURRENT_PASSWORD_INCORRECT',403);}
      finally {if(check?.access_token)try{await auth.signOut(check.access_token);}catch(_){}}
      await rpc('accounts.passwordBegin',{...actor,accountId:account.id,keepCurrent:true,expectedSessionVersion:account.sessionVersion});
      await auth.updatePassword(account.id,newPassword);
      return {ok:true,...await snapshot(actor)};
    }
    requireValue(account.role==='owner','ACCESS_DENIED',403);
    if(action==='accounts.create') {
      const profile=normalizeProfile(body.payload,policy),pass=password(body.payload?.password),email=crypto.randomUUID()+'@wow.invalid';
      const created=await auth.createUser({email,password:pass,email_confirm:true,user_metadata:{wow:true}});
      requireValue(typeof created?.id==='string'&&!!created.id,'SERVICE_UNAVAILABLE',503);
      try{return {ok:true,...await rpc('accounts.create',{...actor,profile,authUserId:created.id,email,expectedRevision:body.expectedRevision,expectedSessionVersion:account.sessionVersion})};}
      catch(error){try{await auth.deleteUser(created.id);}catch(_){}throw error;}
    }
    requireValue(typeof body.accountId==='string','INVALID_ACCOUNT');
    if(action==='accounts.update') {
      const target=state.identity.accounts.find(row=>row.id===body.accountId);requireValue(!!target,'ACCOUNT_NOT_FOUND',404);
      requireValue(plain(body.payload)&&Object.keys(body.payload).every(key=>['name','username','role','permissions','department','note','expiresAt'].includes(key)),'INVALID_CHANGE');
      const merged={...target,...body.payload};if(body.payload.role&&body.payload.role!==target.role&&!own(body.payload,'permissions'))delete merged.permissions;
      return {ok:true,...await rpc(action,{...actor,accountId:body.accountId,profile:normalizeProfile(merged,policy),expectedRevision:body.expectedRevision,expectedSessionVersion:account.sessionVersion})};
    }
    if(action==='accounts.setPassword') {
      const pass=password(body.password);
      await rpc('accounts.passwordBegin',{...actor,accountId:body.accountId,expectedSessionVersion:account.sessionVersion});
      await auth.updatePassword(body.accountId,pass);
      return {ok:true,...await snapshot(actor)};
    }
    return {ok:true,...await rpc(action,{...actor,accountId:body.accountId,status:body.status,
      reason:textValue(body.reason,300,'INVALID_REASON',false,true),expectedRevision:body.expectedRevision,expectedSessionVersion:account.sessionVersion})};
  }
  return async function handler(request) {
    const origin=request.headers.get('origin'),headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin'};
    if(origin && !allowedOrigins.has(origin))return new Response(JSON.stringify({ok:false,error:{code:'ORIGIN_DENIED',message:'ORIGIN_DENIED'}}),{status:403,headers});
    if(origin)headers['access-control-allow-origin']=origin;
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization, apikey, content-type, x-client-info','access-control-max-age':'600'}});
    if(request.method!=='POST')return new Response(JSON.stringify({ok:false,error:{code:'METHOD_NOT_ALLOWED',message:'METHOD_NOT_ALLOWED'}}),{status:405,headers});
    try {
      requireValue(Number(request.headers.get('content-length')||0)<=12*1024*1024,'REQUEST_TOO_LARGE',413);
      // Stream-bound the request so a missing Content-Length cannot allocate unbounded memory.
      const reader=request.body?.getReader();let total=0,chunks=[];
      if(reader)while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>12*1024*1024){await reader.cancel();throw failure('REQUEST_TOO_LARGE',413);}chunks.push(value);}
      const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch(_){throw failure('INVALID_JSON',400);}
      requireValue(plain(body),'INVALID_REQUEST',400);
      if(!knownAction(body.action))throw failure('UNKNOWN_ACTION',400);
      return new Response(JSON.stringify(await run(body,request)),{status:200,headers});
    } catch(error) {
      const safe=safeError(error);if(safe.body.error.retryAfter)headers['retry-after']=String(safe.body.error.retryAfter);
      return new Response(JSON.stringify(safe.body),{status:safe.status,headers});
    }
  };
}
