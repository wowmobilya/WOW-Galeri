/* Customer email proofs are handled only on the server. Every authorization
 * decision comes from private application rows plus a verified Auth identity. */
import {failure,sha256,normalizeUsername} from '../core.mjs';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const need=(test,code='INVALID_CUSTOMER_REQUEST',status=422)=>{if(!test)throw failure(code,status);};
const clean=(value,max,required=false)=>{
 need(typeof value==='string');const text=value.trim().normalize('NFC');
 need((!required||text.length>0)&&Array.from(text).length<=max&&!/[\u0000-\u001f\u007f]/.test(text));return text;
};
export const CUSTOMER_COUNTRIES=Object.freeze('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' '));
export function normalizeCustomerEmail(value){
 const email=clean(value,254,true).toLowerCase();
 // A bounded, conventional mailbox grammar. International domains can use IDNA.
 need(/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(email)&&!email.includes('..')&&!email.endsWith('.invalid'),'INVALID_EMAIL');
 const [local,domain]=email.split('@');need(local.length<=64&&!local.startsWith('.')&&!local.endsWith('.')&&domain.split('.').every(label=>label.length<=63&&!label.startsWith('-')&&!label.endsWith('-')),'INVALID_EMAIL');return email;
}
export function normalizeCustomerProfile(body){
 const country=clean(body.country,2,true).toUpperCase(),callingCode=clean(body.callingCode,5,true),phone=clean(body.phone,14,true);
 need(CUSTOMER_COUNTRIES.includes(country)&&/^\+[1-9][0-9]{0,3}$/.test(callingCode)&&/^[0-9]{4,14}$/.test(phone)&&callingCode.length-1+phone.length<=15,'INVALID_PHONE');
 return {name:clean(body.name,100,true),username:normalizeUsername(body.username),company:clean(body.company||'',100),country,callingCode,phone};
}
function verifiedSession(session){
 try{
  need(typeof session?.access_token==='string'&&session.access_token.length<16384,'INVALID_EMAIL_LINK',401);
  const claim=JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
  need(uuid(claim.session_id),'INVALID_EMAIL_LINK',401);return claim.session_id;
 }catch(_){throw failure('INVALID_EMAIL_LINK',401);}
}
const accepted=()=>({accepted:true});

export function createCustomerAuthActions({provider,auth,origins=[],enabled=false}){
 const allowed=new Set(origins.filter(origin=>{try{const url=new URL(origin);return url.protocol==='https:'&&url.origin===origin;}catch(_){return false;}}));
 const configured=enabled===true&&provider?.configured===true&&allowed.size>0;
 const scope=(body,request)=>{
  need(uuid(body.workspaceId));const origin=request.headers.get('origin');
  // Email callbacks must be anchored to a configured application origin. No
  // request-supplied redirect URL or Referer fallback is accepted.
  need(allowed.has(origin),'ORIGIN_DENIED',403);return {workspaceId:body.workspaceId,origin};
 };
 const bound=(body,request)=>{const data=scope(body,request);need(uuid(body.requestId));return {...data,requestId:body.requestId};};
 const requireConfigured=()=>need(configured,'CUSTOMER_AUTH_UNAVAILABLE',503);
 const publicActions={
  'auth.customerOptions':async({body,request})=>{
   const data=scope(body,request);
   if(!configured)return {registrationEnabled:false,recoveryEnabled:false};
   const options=await provider.rpc('options',data);
   return {registrationEnabled:options.registrationEnabled===true,recoveryEnabled:options.recoveryEnabled===true};
  },
  'auth.customerRegister':async({body,request})=>{
   requireConfigured();const data=bound(body,request),email=normalizeCustomerEmail(body.email),profile=normalizeCustomerProfile(body);
   return requestMail({...data,kind:'register',email,emailHash:await sha256(email),profile},body.captchaToken);
  },
  'auth.customerRecover':async({body,request})=>{
   requireConfigured();const data=bound(body,request),email=normalizeCustomerEmail(body.email);
   return requestMail({...data,kind:'recover',email,emailHash:await sha256(email)},body.captchaToken);
  },
  'auth.customerVerify':async({body,request})=>{
   requireConfigured();const data=bound(body,request);
   need(typeof body.tokenHash==='string'&&/^[A-Za-z0-9_-]{32,512}$/.test(body.tokenHash),'INVALID_EMAIL_LINK',401);
   need(typeof body.challenge==='string'&&/^[A-Za-z0-9_-]{43}$/.test(body.challenge),'INVALID_EMAIL_LINK',401);
   data.challengeHash=await sha256(body.challenge);
   need(typeof body.password==='string'&&Array.from(body.password).length>=12&&Array.from(body.password).length<=128,'INVALID_PASSWORD');
   const proof=await provider.rpc('inspect',data);need(proof.allowed===true,'INVALID_EMAIL_LINK',401);
   let session,logoutScope='local';
   try{
    session=await provider.verify(body.tokenHash,proof.kind==='recover'?'recovery':'email');
    const sessionId=verifiedSession(session),user=await auth.getUser(session.access_token);
    need(uuid(user?.id)&&user.is_anonymous!==true&&user.email_confirmed_at&&normalizeCustomerEmail(user.email)===proof.email,'INVALID_EMAIL_LINK',401);
    const claim={...data,userId:user.id,sessionId,lease:crypto.randomUUID()};
    const prepared=await provider.rpc('claim',claim);need(prepared.allowed===true,'INVALID_EMAIL_LINK',401);
    if(proof.kind==='recover')logoutScope='global';
    // The mailbox holder chooses this password after proof; no password supplied
    // by an earlier, possibly malicious signup initiator can create an account.
    await provider.setPassword(session.access_token,body.password);
    const result=await provider.rpc('finish',claim);need(result.allowed===true,'INVALID_EMAIL_LINK',401);
    logoutScope='global';
    return {completed:true,username:result.username};
   }finally{
    // Never return a recovery session or persist it in the browser. The normal
    // username/password login opens a freshly checked application session.
    // A valid but unrelated proof must close only its newly issued session.
    // Global logout is reserved for a bound eligible recovery or completed signup.
    if(session?.access_token)try{await provider.signOut(session.access_token,logoutScope);}catch(_){}
   }
  }
 };
 async function requestMail(data,captchaToken){
  if(captchaToken!=null)need(typeof captchaToken==='string'&&captchaToken.length<=4096,'INVALID_CAPTCHA');
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  const challenge=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  data={...data,challengeHash:await sha256(challenge)};
  const result=await provider.rpc('begin',data);
  if(result.limited===true)throw failure('RATE_LIMITED',429,{retryAfter:3600});
  if(result.allowed!==true)return accepted();
  const redirect=new URL('/',data.origin);
  redirect.searchParams.set('wf-cloud','employee');redirect.searchParams.set('workspace',data.workspaceId);
  redirect.searchParams.set('wf-customer',data.kind);redirect.searchParams.set('request',data.requestId);
  redirect.hash='challenge='+challenge;
  let delivery='failed';
  try{await provider.send(data.kind,data.email,redirect.href,captchaToken);delivery='accepted';}catch(_){}
  await provider.rpc('delivery',{...data,delivery});
  // Identical responses for absent, ineligible and eligible addresses. Accepted
  // describes this request, never delivery of an email to a real mailbox.
  return accepted();
 }
 const actions={};
 for(const action of ['customerAuth.snapshot','customerAuth.configure','customerAuth.profile'])actions[action]=async({body,actor})=>{
  const data={...actor};
  if(action==='customerAuth.configure'){
   need(typeof body.registrationEnabled==='boolean'&&typeof body.recoveryEnabled==='boolean'&&Number.isSafeInteger(body.revision)&&body.revision>0,'INVALID_CUSTOMER_SETTING');
   if(body.registrationEnabled||body.recoveryEnabled)requireConfigured();
   Object.assign(data,{registrationEnabled:body.registrationEnabled,recoveryEnabled:body.recoveryEnabled,revision:body.revision});
  }
  if(action==='customerAuth.profile'&&body.accountId!=null){need(uuid(body.accountId));data.accountId=body.accountId;}
  const value=await provider.rpc(action,data);return {...value,configured};
 };
 return {publicActions,actions,configured};
}

export function createCustomerAuthProvider({url,serviceKey,fetch:fetcher=globalThis.fetch,timeoutMs=12000}={}){
 let base;try{const parsed=new URL(url);if(parsed.protocol==='https:'&&!parsed.username&&!parsed.password&&!parsed.search&&!parsed.hash&&parsed.pathname==='/')base=parsed.origin;}catch(_){}
 const configured=!!base&&typeof serviceKey==='string'&&!!serviceKey&&typeof fetcher==='function';
 const headers={apikey:serviceKey,...(serviceKey&&!serviceKey.startsWith('sb_secret_')?{authorization:'Bearer '+serviceKey}:{})};
 async function call(path,{body,token,method='POST',rpc=false}={}){
  need(configured,'CUSTOMER_AUTH_UNAVAILABLE',503);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await fetcher(base+path,{method,headers:{...headers,...(token?{authorization:'Bearer '+token}:{}),'content-type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:controller.signal});
   const reader=response.body?.getReader();let size=0,chunks=[];
   if(reader)while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>262144){await reader.cancel();throw failure('SERVICE_UNAVAILABLE',503);}chunks.push(part.value);}
   let data={};if(size){const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}try{data=JSON.parse(new TextDecoder().decode(bytes));}catch(_){throw failure('SERVICE_UNAVAILABLE',503);}}
   if(!response.ok){
    if(response.status===429)throw failure('RATE_LIMITED',429,{retryAfter:60});
    if(rpc&&data.code==='P0001'&&/^[A-Z][A-Z0-9_]{2,60}$/.test(data.message||''))throw failure(data.message,
     ['ACCESS_DENIED','ACCOUNT_UNAVAILABLE'].includes(data.message)?403:['AUTH_REQUIRED','SESSION_REVOKED','SESSION_EXPIRED'].includes(data.message)?401:
      ['IDENTITY_CONFLICT','CUSTOMER_REGISTRATION_CONFLICT'].includes(data.message)?409:data.message.startsWith('INVALID_')?422:503);
    if([400,401,403,404,422].includes(response.status))throw failure('INVALID_EMAIL_LINK',401);
    throw failure('SERVICE_UNAVAILABLE',503);
   }
   return data;
  }catch(error){if(error?.code)throw error;throw failure('SERVICE_UNAVAILABLE',503);}finally{clearTimeout(timer);}
 }
 return Object.freeze({configured,
  rpc:(action,data)=>call('/rest/v1/rpc/wow_customer_auth_service',{body:{p_action:action,p_data:data},rpc:true}),
  send:(kind,email,redirect,captchaToken)=>call('/auth/v1/'+(kind==='recover'?'recover':'otp')+'?redirect_to='+encodeURIComponent(redirect),{
   body:{email,...(kind==='register'?{create_user:true}:{}),...(captchaToken?{gotrue_meta_security:{captcha_token:captchaToken}}:{})}}),
  verify:(tokenHash,type)=>call('/auth/v1/verify',{body:{token_hash:tokenHash,type}}),
  setPassword:(token,password)=>call('/auth/v1/user',{method:'PUT',token,body:{password}}),
  signOut:(token,scope='local')=>{need(['local','global'].includes(scope),'SERVER_CONFIGURATION',503);return call('/auth/v1/logout?scope='+scope,{token});}
 });
}
