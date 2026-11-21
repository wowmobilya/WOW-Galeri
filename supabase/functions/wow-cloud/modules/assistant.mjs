import {failure} from '../core.mjs';
import {choice,context,short,uuid} from './files.mjs';
import {cleanExcerpt,createAssistantProvider,validateNotes} from './assistant-provider.mjs';

const sources=['all','products','customers','invoices'],langs=['ar','en','tr','fr','ru'];
const digestRE=/^[a-f0-9]{64}$/,refRE=/^E([1-9]|1[0-2])$/;
const findings=new Set(['match','missingReference','missingName','missingCustomer','missingType','duplicateBarcode']);
const settlementCodes=new Set(['AI_PROVIDER_TIMEOUT','AI_PROVIDER_UNAVAILABLE','AI_PROVIDER_OUTPUT','AI_PROVIDER_REFUSAL','AI_RESULT_UNAVAILABLE']);
const statusByCode={AI_DAILY_LIMIT:429,AI_BUSY:429,AI_CIRCUIT_OPEN:503,AI_IN_PROGRESS:409,AI_RECEIPT_EXPIRED:410,AI_EVIDENCE_CHANGED:409,
  AI_RESULT_UNAVAILABLE:503,AI_PROVIDER_TIMEOUT:504,AI_PROVIDER_UNAVAILABLE:503,AI_PROVIDER_OUTPUT:502,AI_PROVIDER_REFUSAL:422};
const bad=()=>failure('INVALID_ASSISTANT_INPUT',422);
const badServer=()=>failure('INVALID_RESPONSE',503);
const allowed=(v,list)=>typeof v==='string'&&list.includes(v);
const str=(v,n)=>{if(typeof v!=='string'||Array.from(v).length>n)throw badServer();return v;};
const recordLabel=v=>/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v)?v:cleanExcerpt(v);
const decimal=v=>{if(typeof v!=='string'||!/^[-]?\d{1,40}(?:\.\d{1,24})?$/.test(v))throw badServer();return v;};
const refIndex=ref=>Number(ref.slice(1));

export function assistantSpec(body) {
  const mode=choice(body.mode,['search','checks','report','chat']);
  if(mode==='chat')return {mode,roomId:uuid(body.roomId)};
  if(mode==='report'){
    if(typeof body.month!=='string'||!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(body.month))throw bad();
    return {mode,month:body.month};
  }
  const source=choice(body.source??'all',sources);
  if(mode==='checks')return {mode,source};
  const query=short(body.query,80);
  if(Array.from(query).length<2)throw bad();
  return {mode,source,query};
}

function packet(data,mode){
  if(!digestRE.test(data?.fingerprint)||!Array.isArray(data.evidence?.rows)||data.evidence.rows.length>12||
    typeof data.evidence.more!=='boolean')throw badServer();
  const rows=data.evidence.rows.map((row,i)=>{
    const ref='E'+(i+1);
    if(mode==='report'){
      if(row.source!=='finance'||!allowed(row.currency,['USD','EUR','TRY','SYP'])||!allowed(row.finding,['netIn','netOut','netEven'])||
        typeof row.month!=='string'||!/^\d{4}-\d\d$/.test(row.month)||typeof row.entries!=='string'||!/^\d{1,24}$/.test(row.entries))throw badServer();
      return {ref,source:'finance',finding:row.finding,currency:row.currency,month:row.month,entries:row.entries,
        inflow:decimal(row.inflow),outflow:decimal(row.outflow),net:decimal(row.net)};
    }
    if(mode==='chat'){
      if(row.source!=='chat'||typeof row.record!=='string'||!/^\d{1,19}$/.test(row.record)||!Number.isFinite(Date.parse(row.at))||
        row.expiresAt!=null&&!Number.isFinite(Date.parse(row.expiresAt)))throw badServer();
      return {ref,source:'chat',finding:'message',record:row.record,title:cleanExcerpt(str(row.title,100)),
        text:cleanExcerpt(str(row.text,360)),at:row.at,expiresAt:row.expiresAt,truncated:row.truncated===true};
    }
    if(!sources.slice(1).includes(row.source)||!findings.has(row.finding)||
      mode==='search'&&row.finding!=='match'||mode==='checks'&&row.finding==='match')throw badServer();
    return {ref,source:row.source,finding:row.finding,record:recordLabel(str(row.record,180)),recordType:choice(row.recordType,['string','number']),
      title:cleanExcerpt(str(row.title,140)),detail:cleanExcerpt(str(row.detail,120)),barcode:cleanExcerpt(str(row.barcode,96))};
  });
  return {fingerprint:data.fingerprint,rows,more:data.evidence.more};
}

async function hash(value){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
}
function selectedRefs(value){
  if(!Array.isArray(value)||value.length<1||value.length>12||value.some(ref=>typeof ref!=='string'||!refRE.test(ref))||new Set(value).size!==value.length)throw bad();
  return [...value].sort((left,right)=>refIndex(left)-refIndex(right));
}
function receiptState(result){
  if(result?.state==='failed'){
    if(!Object.hasOwn(statusByCode,result.code))throw badServer();
    throw failure(result.code,statusByCode[result.code]);
  }
  if(!['cached','reserved'].includes(result?.state))throw badServer();
  return result.state;
}
export function createAssistantActions({moduleRpc,provider=createAssistantProvider()}){
  async function call(actor,action,data={}){
    try{return await moduleRpc('wow_assistant_service',action,{...data,...context(actor)});}
    catch(err){
      // DB errors are fixed codes. Keep the same contract with PostgreSQL fixtures and the production REST adapter.
      const code=Object.hasOwn(statusByCode,err?.message)?err.message:err?.code;
      if(Object.hasOwn(statusByCode,code))throw failure(code,statusByCode[code]);throw err;
    }
  }
  async function generate({body,actor}){
    const identity=context(actor);
    if(!provider.configured){
      await call(identity,'status');
      throw failure('AI_NOT_CONFIGURED',503);
    }
    const spec=assistantSpec(body),requestId=uuid(body.requestId),lang=choice(body.lang,langs);
    const focus=cleanExcerpt(short(body.focus??'',240,true)),refs=selectedRefs(body.refs);
    if(typeof body.fingerprint!=='string'||!digestRE.test(body.fingerprint))throw bad();
    const fingerprint=body.fingerprint;
    const requestHash=await hash([1,spec,fingerprint,refs,lang,focus]);
    const args={spec,requestId,fingerprint,requestHash,selected:refs.map(refIndex)};
    const binding=JSON.stringify([1,identity.userId,identity.sessionId,requestId,requestHash,fingerprint]);
    const reservation=await call(identity,'reserve',{...args,model:provider.model});
    const cached=receiptState(reservation)==='cached';
    if(!cached){
      const lease=uuid(reservation.lease);
      let sealed,usage;
      try{
        const view=packet(reservation,spec.mode),rows=refs.map(ref=>view.rows[refIndex(ref)-1]);
        if(view.fingerprint!==fingerprint||rows.some(row=>!row))throw badServer();
        const generated=await provider.generate({mode:spec.mode,lang,focus,rows});
        usage=generated.usage;sealed=await provider.seal(validateNotes(generated.answer,spec.mode,refs),binding);
      }catch(error){
        const code=settlementCodes.has(error?.code)?error.code:'AI_RESULT_UNAVAILABLE';
        await call(identity,'settle',{requestId,lease,code,...(error?.usage||usage||{})});
        throw failure(code,statusByCode[code]);
      }
      // A transport failure at settlement or delivery never authorizes another provider request for this UUID.
      await call(identity,'settle',{requestId,lease,sealed,inputTokens:usage?.inputTokens??null,outputTokens:usage?.outputTokens??null});
    }
    // The answer is released only after a fresh session, source permission, room visibility and evidence-fingerprint check.
    const released=await call(identity,'release',args);
    if(receiptState(released)!=='cached'||released.fingerprint!==fingerprint)throw badServer();
    const answer=validateNotes(await provider.open(released.sealed,binding),spec.mode,refs);
    return {requestId,fingerprint,answer,cached};
  }
  return {
    'assistant.status':async({actor})=>{
      const state=await call(actor,'status',{model:provider.model});
      return {sources:state.sources,dailyLimit:state.dailyLimit,usedToday:state.usedToday,
        provider:{configured:provider.configured===true,lastSuccessAt:state.lastSuccessAt??null}};
    },
    'assistant.rooms':async({actor})=>{
      const {rooms}=await call(actor,'rooms');
      if(!Array.isArray(rooms)||rooms.length>250)throw badServer();
      return {rooms:rooms.map(room=>({id:uuid(room.id),kind:choice(room.kind,['team','group','direct']),name:cleanExcerpt(str(room.name,100))}))};
    },
    'assistant.inspect':async({actor,body})=>{
      const spec=assistantSpec(body);
      return packet(await call(actor,'inspect',{spec}),spec.mode);
    },
    'assistant.generate':generate
  };
}
