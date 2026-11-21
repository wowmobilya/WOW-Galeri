export function pushError(code,status=422){const error=new Error(code);error.code=code;error.status=status;return error;}
const assert=(ok,code='INVALID_PUSH_SUBSCRIPTION')=>{if(!ok)throw pushError(code);};
export function validatePushEndpoint(value){
  assert(typeof value==='string'&&value.length>0&&value.length<=4096&&!/[\u0000-\u0020\u007f]/.test(value));
  let url;try{url=new URL(value);}catch(_){throw pushError('INVALID_PUSH_ENDPOINT');}
  assert(url.protocol==='https:'&&!url.username&&!url.password&&!url.hash&&(!url.port||url.port==='443'),'INVALID_PUSH_ENDPOINT');
  const host=url.hostname;
  const allowed=host==='fcm.googleapis.com'&&/^\/(?:fcm\/send|wp)\/.+/.test(url.pathname)||
    host==='updates.push.services.mozilla.com'&&/^\/wpush\/v[12]\/.+/.test(url.pathname)||
    host==='web.push.apple.com'&&url.pathname.length>1||
    /^[a-z0-9-]+\.notify\.windows\.com$/.test(host)&&/^\/w\/?$/.test(url.pathname)&&!!url.search;
  assert(allowed,'INVALID_PUSH_ENDPOINT');return url.href;
}
function decodeKey(value,length){
  assert(typeof value==='string'&&value.length<=100&&/^[A-Za-z0-9_-]+={0,2}$/.test(value));
  let raw;try{raw=Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}catch(_){throw pushError('INVALID_PUSH_SUBSCRIPTION');}
  assert(raw.length===length);return raw;
}
function base64url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export async function normalizeSubscription(input,now=Date.now()){
  assert(input&&typeof input==='object'&&!Array.isArray(input));
  const endpoint=validatePushEndpoint(input.endpoint),p256dh=decodeKey(input.keys?.p256dh,65),auth=decodeKey(input.keys?.auth,16);
  assert(p256dh[0]===4);
  try{await crypto.subtle.importKey('raw',p256dh,{name:'ECDH',namedCurve:'P-256'},false,[]);}catch(_){throw pushError('INVALID_PUSH_SUBSCRIPTION');}
  const expiry=input.expirationTime??null;
  assert(expiry===null||Number.isSafeInteger(expiry)&&expiry>now&&expiry<32503680000000);
  return {endpoint,keys:{p256dh:base64url(p256dh),auth:base64url(auth)},expirationTime:expiry};
}
export function normalizeDevice(value){assert(typeof value==='string'&&/^[A-Za-z0-9_.:-]{8,120}$/.test(value),'INVALID_DEVICE_ID');return value;}
export function normalizeLanguage(value){const key=String(value||'ar').toLowerCase().split(/[-_]/)[0];return ['ar','en','tr','fr','ru'].includes(key)?key:'en';}
export async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function constantEqual(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
