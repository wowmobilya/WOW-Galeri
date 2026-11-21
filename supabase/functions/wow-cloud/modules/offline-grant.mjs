// A non-bearer delegation for previously saved owner projections. No RPC accepts this JWS as authentication.
import {failure} from '../core.mjs';
const te=new TextEncoder(), policy={name:'ECDSA',namedCurve:'P-256'}, signature={name:'ECDSA',hash:'SHA-256'};
const word=/^[A-Za-z0-9_-]{43}$/, uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const localId=/^account_[0-9a-f]{32}$/;
const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const json=v=>encode(te.encode(JSON.stringify(v)));
const sha=async value=>encode(await crypto.subtle.digest('SHA-256',te.encode(value)));
const check=(condition,code='INVALID_OFFLINE_GRANT',status=422)=>{if(!condition)throw failure(code,status);};
function publicPart(jwk) {
  check(jwk?.kty==='EC'&&jwk.crv==='P-256'&&word.test(jwk.x||'')&&word.test(jwk.y||''));
  return {crv:'P-256',kty:'EC',x:jwk.x,y:jwk.y};
}
const unpack=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
export function createOfflineGrantActions({rpc,origins=[],endpoint,signingKey,permissionKeys=[],now=Date.now}) {
  let signer;
  async function getSigner(){
    if(!signer)signer=(async()=>{
      try {
        const raw=typeof signingKey==='string'?JSON.parse(signingKey):signingKey,publicKey=publicPart(raw);
        check(word.test(raw.d||''));
        const key=await crypto.subtle.importKey('jwk',raw,policy,false,['sign']);
        return {key,publicKey,kid:await sha(JSON.stringify(publicKey))};
      }catch{throw failure('OFFLINE_GRANT_UNCONFIGURED',503);}
    })();
    return signer;
  }
  return {'offline.ownerGrant':async({actor,body,request})=>{
    const origin=request?.headers?.get('origin');
    check(typeof origin==='string'&&origin.startsWith('https://')&&origins.includes(origin)&&new URL(origin).origin===origin,'ACCESS_DENIED',403);
    check(typeof endpoint==='string'&&endpoint.startsWith('https://')&&permissionKeys.length>0,'OFFLINE_GRANT_UNCONFIGURED',503);
    const {localOwner,localEpoch,localFence,deviceJwk,deviceProof,at}=body;
    const time=Math.floor(now()/1000);
    check(localId.test(localOwner||'')&&(localFence==='initial'||uuid.test(localFence||''))&&Number.isSafeInteger(localEpoch)&&localEpoch>0&&Number.isSafeInteger(at)&&Math.abs(at-time)<=300);
    check(deviceJwk&&!('d' in deviceJwk)&&typeof deviceProof==='string'&&/^[A-Za-z0-9_-]{86}$/.test(deviceProof));
    const identity=await rpc('session.snapshot',{userId:actor.userId,sessionId:actor.sessionId}),a=identity?.identity?.currentAccount;
    check(a?.role==='owner'&&a.status==='active'&&a.id===actor.userId&&uuid.test(a.id)&&uuid.test(identity.workspaceId)&&
      Number.isSafeInteger(a.sessionVersion)&&a.sessionVersion>0,'ACCESS_DENIED',403);
    const device=publicPart(deviceJwk),deviceId=await sha(JSON.stringify(device)),proof=JSON.stringify(['mark-robot-offline-device-v1',origin,endpoint,localOwner,localEpoch,localFence,deviceId,at]);
    let valid=false;try{
      const key=await crypto.subtle.importKey('jwk',device,policy,false,['verify']);
      valid=await crypto.subtle.verify(signature,key,unpack(deviceProof),te.encode(proof));
    }catch{}
    check(valid,'ACCESS_DENIED',403);
    const expires=a.expiresAt?Math.floor(Date.parse(a.expiresAt)/1000):Infinity;
    const exp=Math.min(time+86400,expires);check(exp>time,'ACCESS_DENIED',403);
    const {key,publicKey,kid}=await getSigner();
    const header=json({alg:'ES256',typ:'mark-robot-offline+jwt',kid});
    const claims={v:1,iss:endpoint,aud:origin,sub:a.id,workspace:identity.workspaceId,serverEpoch:a.sessionVersion,
      role:'owner',permissionHash:await sha(JSON.stringify([...new Set(permissionKeys)].sort())),cloudExpiresAt:a.expiresAt||null,
      localOwner,localEpoch,localFence,device:deviceId,iat:time,exp,purpose:'module-saved-copies'};
    const input=header+'.'+json(claims);
    return {publicKey,grant:input+'.'+encode(await crypto.subtle.sign(signature,key,te.encode(input)))};
  }};
}
