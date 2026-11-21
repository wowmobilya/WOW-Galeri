import {failure} from '../core.mjs';

const HASH=/^[a-f0-9]{64}$/;
async function fingerprint(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
}
// The SQL projection already enforced all account/row/expiry checks. Compare this
// fresh page with the caller's private previous snapshot. Unknown hashes can
// only change how much of its own authorized page the caller receives.
export async function projectDelta(result,field,known){
  const { [field]:rows,...meta }=result,order=rows.map(row=>String(row.id));
  const hashes=Object.fromEntries(await Promise.all(rows.map(async row=>[String(row.id),await fingerprint(row)])));
  const [metaHash,orderHash]=await Promise.all([fingerprint(meta),fingerprint(order)]);
  const revision=await fingerprint([hashes,metaHash,orderHash]);
  const state={rows:hashes,meta:metaHash,order:orderHash,revision};
  if(known==null)return {...result,_deltaState:state};
  if(typeof known!=='object'||Array.isArray(known)||!known.rows||Array.isArray(known.rows)||typeof known.rows!=='object'||
     Object.keys(known).length!==4||![known.revision,known.meta,known.order].every(x=>typeof x==='string'&&HASH.test(x)))throw failure('INVALID_DELTA',422);
  const previous=Object.entries(known.rows);
  if(previous.length>500||previous.some(([id,hash])=>!/^([a-f0-9-]{36}|[1-9][0-9]{0,17})$/.test(id)||typeof hash!=='string'||!HASH.test(hash)))throw failure('INVALID_DELTA',422);
  if(revision===known.revision)return {_delta:{field,base:known.revision,unchanged:true}};
  const upsert=rows.filter(row=>known.rows[row.id]!==hashes[row.id]),removed=Object.keys(known.rows).filter(key=>!(key in hashes));
  return {_delta:{field,base:known.revision,upsert,removed,...(orderHash!==known.order?{order}:{}),...(metaHash!==known.meta?{meta}:{})},
    _deltaState:state};
}
