// Provider requests contain only an allowlisted pair. Credentials stay in Edge.
const currencies=new Set(['USD','EUR','TRY']);
const symbols={gold:'XAU',silver:'XAG'};
const fail=()=>Object.assign(Error('QUOTE_UNAVAILABLE'),{code:'QUOTE_UNAVAILABLE',status:503});
const decoder=new TextDecoder();
const positive=token=>{
  // Work from the JSON token, before IEEE-754 conversion can change a halfway
  // value. The database uses the same positive decimal half-up quantization.
  if(typeof token!=='string'||token.length>80)throw fail();
  const match=/^(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d{1,3}))?$/.exec(token);
  if(!match)throw fail();
  const fraction=match[2]||'',exponent=Number(match[3]||0);
  if(Math.abs(exponent)>100||match[1].length+fraction.length>64)throw fail();
  const digits=BigInt(match[1]+fraction),shift=8+exponent-fraction.length;
  const divisor=shift<0?10n**BigInt(-shift):1n;
  const scaled=shift>=0?digits*10n**BigInt(shift):digits/divisor+(digits%divisor*2n>=divisor?1n:0n);
  if(scaled<=0n||scaled>=1000000000000000000n)throw fail();
  const result=scaled.toString().padStart(9,'0');
  return (result.slice(0,-8)+'.'+result.slice(-8)).replace(/\.?0+$/,'');
};
function exactRootNumbers(source){
  // JSON.parse validates syntax first. This bounded scanner retains raw root
  // number tokens and rejects duplicate root fields; it does not evaluate code.
  const data=JSON.parse(source);
  if(!data||typeof data!=='object'||Array.isArray(data))throw fail();
  let i=0;const numbers=Object.create(null),seen=new Set();
  const space=()=>{while(/\s/.test(source[i]||'')&&i<source.length)i++;};
  const stringEnd=()=>{i++;while(i<source.length){if(source[i]==='\\'){i+=2;continue;}if(source[i++]==='"')return;}throw fail();};
  space();if(source[i++]!=='{')throw fail();space();
  while(source[i]!=='}'){
    const keyStart=i;if(source[i]!=='"')throw fail();stringEnd();
    const key=JSON.parse(source.slice(keyStart,i));if(seen.has(key))throw fail();seen.add(key);
    space();if(source[i++]!==':')throw fail();space();const start=i;
    if(source[i]==='"')stringEnd();
    else if(source[i]==='{'||source[i]==='['){
      let depth=0;
      do{if(source[i]==='"'){stringEnd();continue;}
        if(source[i]==='{'||source[i]==='[')depth++;
        if(source[i]==='}'||source[i]===']')depth--;
        if(depth>24||i>=source.length)throw fail();i++;
      }while(depth>0);
    }else{while(i<source.length&&source[i]!==','&&source[i]!=='}')i++;}
    const token=source.slice(start,i).trim();if(/^-?\d/.test(token))numbers[key]=token;
    space();if(source[i]===','){i++;space();continue;}if(source[i]!=='}')throw fail();
  }
  return {data,numbers};
}
async function json(response){
  if(!response.ok||!/^application\/(?:[^;]+\+)?json(?:;|$)/i.test(response.headers.get('content-type')||'')||!response.body)throw fail();
  if(Number(response.headers.get('content-length')||0)>16384)throw fail();
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const{done,value}=await reader.read();if(done)break;size+=value.length;
    if(size>16384){await reader.cancel().catch(()=>{});throw fail();}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let start=0;for(const chunk of chunks){bytes.set(chunk,start);start+=chunk.length;}
  try{return exactRootNumbers(decoder.decode(bytes));}catch{throw fail();}
}

export function createQuoteProvider({goldApiKey,fetch:fetcher=globalThis.fetch,now=Date.now,timeoutMs=7000}={}){
  const goldConfigured=typeof goldApiKey==='string'&&/^[\x21-\x7e]{12,512}$/.test(goldApiKey);
  const timeout=Math.max(1,Math.min(10000,Number.isFinite(timeoutMs)?timeoutMs:7000));
  // At most six FX pairs and two metals. A failure has its own short cooldown;
  // a previous successful price is never relabelled with a fresh observation.
  const cache=new Map(),pending=new Map(),blocked=new Map();
  async function load(base,counter,key){
    const metal=Object.hasOwn(symbols,base),time=now();
    const url=metal
      ?'https://www.goldapi.io/api/price/'+symbols[base]+'/USD?melt_price=false&currency_info=false'
      :'https://api.frankfurter.dev/v2/providers/ecb/rate/'+base.toLowerCase()+'/'+counter.toLowerCase();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetcher(url,{method:'GET',headers:{Accept:'application/json',...(metal?{'x-access-token':goldApiKey}:{})},
        signal:controller.signal,redirect:'error',cache:'no-store'});
      const {data:value,numbers}=await json(response);let at,source,raw,maxAge;
      if(metal){
        if(!value||Array.isArray(value)||value.metal!==symbols[base]||value.currency!=='USD'||value.unit!=='troy_ounce'||
          !Number.isSafeInteger(value.timestamp)||value.timestamp<=0)throw fail();
        at=new Date(value.timestamp*1000).toISOString();source='GoldAPI.io spot / USD / troy ounce';raw=positive(numbers.price);maxAge=72*3600000;
      }else{
        if(!value||Array.isArray(value)||value.base!==base||value.quote!==counter||
          typeof value.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value.date))throw fail();
        at=new Date(value.date+'T00:00:00.000Z').toISOString();
        if(at.slice(0,10)!==value.date)throw fail();maxAge=7*86400000;
        source='ECB reference via Frankfurter / '+value.date;raw=positive(numbers.rate);
      }
      if(Date.parse(at)>time+300000||Date.parse(at)+maxAge<=now())throw fail();
      const result=Object.freeze({raw,at,source,unit:metal?'troy_ounce':'currency'});
      cache.set(key,{value:result,expires:Math.min(time+(metal?60000:300000),Date.parse(at)+maxAge)});blocked.delete(key);return {...result};
    }catch{
      blocked.set(key,now()+30000);throw fail();
    }finally{clearTimeout(timer);}
  }
  async function quote({base,counter}={}){
    const metal=Object.hasOwn(symbols,base);
    if(metal?counter!=='USD'||!goldConfigured:!currencies.has(base)||!currencies.has(counter)||base===counter)throw fail();
    const key=base+'/'+counter,entry=cache.get(key);
    if(entry&&entry.expires>now())return {...entry.value};
    if((blocked.get(key)||0)>now())throw fail();
    if(!pending.has(key))pending.set(key,load(base,counter,key).finally(()=>pending.delete(key)));
    return {...await pending.get(key)};
  }
  quote.configuration=Object.freeze({fx:'ecb-reference',metals:goldConfigured?'goldapi':'unconfigured'});
  return quote;
}
