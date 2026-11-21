import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto,randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {IDBFactory} from 'fake-indexeddb';
import {createOfflineGrantActions} from '../supabase/functions/wow-cloud/modules/offline-grant.mjs';
const require=createRequire(import.meta.url),core=require('../accounts-core.js'),policy=require('../accounts-policy.js'),
 dataPolicy=require('../accounts-data-policy.js'),Store=require('../modules/platform/offline/store.js'),Grant=require('../modules/platform/offline/grant.js');
const [clientSource,accessSource]=await Promise.all(['modules/platform/cloud/wow-cloud-client.js','accounts-access.js'].map(p=>readFile(new URL('../'+p,import.meta.url),'utf8')));
const url='https://app.fixture.invalid/',endpoint='https://backend.fixture.invalid/functions/v1/wow-cloud';
const pass='Correct horse-2026',localId='account_'+'a'.repeat(32),workspace=randomUUID(),ownerId=randomUUID(),workerId=randomUUID();
const credential={algorithm:'PBKDF2-HMAC-SHA256',iterations:600000,salt:'00112233445566778899aabbccddeeff',hash:'14b26192bfcf425ce5fde54aec7d04e6e48b850adeddb8433742f0e1b389016e'};
const key='wf_wow_cloud_linked_owner_v2',legacy='wf_wow_cloud_owner_v1';
const held=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture(){
 const time='2026-11-21T10:00:00.000Z',row=(id,name,role)=>({id,name,username:name,role,permissions:policy.presets(role),status:'active',department:'',note:'',
  createdAt:time,updatedAt:time,lastLoginAt:null,expiresAt:null,deletedAt:null,sessionVersion:1,failedAttempts:0,lockedUntil:null,credential:{...credential}});
 return {clock:Date.parse(time),state:{schemaVersion:1,revision:1,accounts:[row(localId,'owner','owner'),row('account_'+'b'.repeat(32),'worker','carpentry')],audit:[]},disk:new Map()};
}
function storage(map){return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};}
function realApp(f,tab=new Map(),href=url){
 const calls=[],events=new Map(),reloads=[],s=storage(tab),ls=storage(f.disk),loc=new URL(href);
 let handler,role='owner';
 class Node{constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attrs=new Map();}append(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n);}}setAttribute(k,v){this.attrs.set(k,v);}hasAttribute(k){return this.attrs.has(k);}removeAttribute(k){this.attrs.delete(k);}addEventListener(){}focus(){}get previousElementSibling(){const a=this.parentElement?.children||[];return a[a.indexOf(this)-1];}}
 const doc={body:new Node('body'),documentElement:new Node('html'),getElementById:()=>null,querySelector:()=>null,createElement:t=>new Node(t),addEventListener(){}};
 doc.documentElement.lang='en';
 class E{constructor(type,o={}){this.type=type;this.detail=o.detail;}}
 const app={document:doc,location:{origin:loc.origin,search:loc.search,href:loc.href,reload(){reloads.push({cloud:app.WFCloud.getSnapshot(),stored:tab.get(key)});}},
  WFAccountPolicy:policy,WFAccountDataPolicy:dataPolicy,WFAccountsCore:{createService:options=>core.createService({...options,now:()=>f.clock})},
  WFAccountsLocalProvider:{create:()=>({read:async()=>structuredClone(f.state),commit:async(revision,state)=>{assert.equal(f.state?.revision||0,revision);f.state=structuredClone(state);}})},
  WOW_CLOUD_CONFIG:{enabled:true,publishableKey:'test-publishable',endpoint,projectRef:'test'},sessionStorage:s,localStorage:ls,
  crypto:webcrypto,Event:E,CustomEvent:E,addEventListener:(t,fn)=>{if(!events.has(t))events.set(t,[]);events.get(t).push(fn);},dispatchEvent:e=>{for(const fn of events.get(e.type)||[])fn(e);},
  requestAnimationFrame:()=>1,setInterval:()=>1,confirm:()=>true,setTimeout,clearTimeout,fetch:async(u,o)=>{
   const body=JSON.parse(o.body);calls.push({action:body.action,headers:o.headers,body});let value;
   if(handler)value=await handler(body,o);
   if(!value){if(body.action==='auth.signIn')role=body.username==='worker'?'sales':'owner';
    const me={id:role==='owner'?ownerId:workerId,role,permissions:policy.presets(role),name:role,status:'active',sessionVersion:1,expiresAt:null};
    value={ok:true,workspaceId:workspace,identity:{currentAccount:me,accounts:[me],audit:[]},
      session:{access_token:'fixture-access-'+role,refresh_token:'fixture-refresh-'+role,expires_at:Math.floor(f.clock/1000)+70}};}
   return {ok:true,status:200,json:async()=>value};
  }};
 class FixtureDate extends Date{static now(){return f.clock;}}
 const ctx=vm.createContext({window:app,URL,URLSearchParams,setTimeout,clearTimeout,Date:FixtureDate,Event:E,MutationObserver:class{observe(){}},console});
 vm.runInContext(clientSource,ctx);vm.runInContext(accessSource,ctx);
 return {app,tab,calls,reloads,storage:ls,handler:fn=>{handler=fn;},ready:()=>Promise.all([app.WFAccountAccess.ready,app.WFCloud.ready])};
}
async function pair(h){await h.ready();await h.app.WFAccountAccess.service.signIn({username:'owner',password:pass});await h.app.WFCloud.signIn({username:'owner',password:'fixture'});}
test('built-in Employee Access URL never inherits the local owner in the same tab, in an opener clone, or on employee-page reload',async()=>{
 const f=fixture(),owner=realApp(f);await pair(owner);
 const link=owner.app.WFCloud.entryUrl(url+'?wf-accounts=cloud'),wrapped=JSON.parse(owner.tab.get(key));
 assert.equal(wrapped.mode,'local');assert.equal(wrapped.localOwnerId,localId);assert.equal(wrapped.localVersion,1);assert.equal(wrapped.cloudVersion,1);
 assert.equal(new URL(link).searchParams.get('wf-cloud'),'employee');assert.equal(new URL(link).searchParams.get('workspace'),workspace);
 const child=realApp(f,new Map(owner.tab),link);await child.ready();assert.equal(child.app.WFAccountAccess.service,child.app.WFCloud);
 assert.equal(child.app.WFCloud.getSnapshot().authenticated,false);assert.equal(child.app.WFAccountAccess.can('accounts.edit'),false);
 assert.equal(child.calls.length,0);assert.equal(child.tab.has(key),false);assert.equal(child.tab.has('wf_owner_session_v1'),false);
 assert(owner.tab.has(key));assert(owner.tab.has('wf_owner_session_v1'));assert.equal(owner.app.WFCloud.getSnapshot().role,'owner');
 await child.app.WFAccountAccess.service.signIn({username:'worker',password:'fixture'});
 assert.equal(child.app.WFCloud.getSnapshot().role,'sales');assert.equal(child.tab.has(key),false);
 const reloaded=realApp(f,child.tab,link);await reloaded.ready();assert.equal(reloaded.calls.length,0);assert.equal(reloaded.app.WFCloud.getSnapshot().authenticated,false);
 const same=realApp(f,owner.tab,link);await same.ready();assert.equal(same.calls.length,0);assert.equal(same.app.WFAccountAccess.service.getSnapshot().currentAccount,null);
 const back=realApp(f,same.tab,url);await back.ready();assert.equal(back.app.WFAccountAccess.service.getSnapshot().currentAccount,null);assert.equal(back.app.WFCloud.getSnapshot().authenticated,false);
});
test('only the matching verified local owner and cloud actor, tenant and epoch can restore a persisted linked-owner continuation',async()=>{
 const f=fixture(),h=realApp(f);await pair(h);f.clock+=24*3600000;
 const same=realApp(f,new Map(h.tab));await same.ready();assert.deepEqual(same.calls.map(c=>c.action),['auth.refresh']);assert.equal(same.app.WFCloud.getSnapshot().role,'owner');
 for(const patch of [{mode:'remote'},{localOwnerId:'another'},{localVersion:99},{version:1}]){
   const clone=new Map(h.tab);clone.set(key,JSON.stringify({...JSON.parse(clone.get(key)),...patch}));const other=realApp(f,clone);await other.ready();
   assert.equal(other.calls.length,0);assert.equal(other.app.WFCloud.getSnapshot().authenticated,false);assert(!clone.has(key));}
 const old=new Map(h.tab);old.delete(key);old.set(legacy,JSON.stringify({version:1,refreshToken:'fixture-old'}));
 const oldTab=realApp(f,old);await oldTab.ready();assert.equal(oldTab.calls.length,0);assert(!old.has(legacy));
 const localSignedOut=new Map(h.tab);localSignedOut.delete('wf_owner_session_v1');
 const locked=realApp(f,localSignedOut);await locked.ready();assert.equal(locked.calls.length,0);assert.equal(locked.app.WFCloud.getSnapshot().authenticated,false);
 for(const patch of [{userId:randomUUID()},{workspaceId:randomUUID()},{cloudVersion:6}]){
   const clone=new Map(h.tab);clone.set(key,JSON.stringify({...JSON.parse(clone.get(key)),...patch}));const other=realApp(f,clone);await other.ready();
   assert.equal(other.calls.length,1);assert.equal(other.app.WFCloud.getSnapshot().authenticated,false);assert(!clone.has(key));}
});
test('a real local account switch erases live and stored cloud credentials, fences token renewal, and retires an issued offline grant before reload',async()=>{
 const f=fixture(),h=realApp(f);await pair(h);await h.app.WFAccountAccess.beforeInit();
 const pairKey=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const jwk=await webcrypto.subtle.exportKey('jwk',pairKey.privateKey);
 const pin=createHash('sha256').update(JSON.stringify({crv:jwk.crv,kty:jwk.kty,x:jwk.x,y:jwk.y})).digest('base64url');
 const cfg={enabled:true,origin:new URL(url).origin,endpoint,pin,permissionKeys:policy.permissionKeys};
 const rpc=async()=>({workspaceId:workspace,identity:{currentAccount:{id:ownerId,role:'owner',status:'active',sessionVersion:1}}});
 const issue=createOfflineGrantActions({rpc,origins:[cfg.origin],endpoint,signingKey:jwk,permissionKeys:policy.permissionKeys,now:()=>f.clock})['offline.ownerGrant'];
 h.handler(async body=>{if(body.action==='offline.ownerGrant')return {ok:true,...await issue({actor:{userId:ownerId,sessionId:randomUUID()},body,request:new Request(endpoint,{headers:{origin:cfg.origin}})})};});
 const store=Store.create({indexedDB:new IDBFactory(),now:()=>f.clock}),who={localOwner:localId,localEpoch:1};
 const controller=Grant.create({store,cloud:h.app.WFCloud,local:()=>h.app.WFAccountAccess.service.getSnapshot(),config:()=>cfg,
   liveIdentity:state=>state.authenticated?{owner:'fixture',scope:'known',runtime:'live',cloudVersion:1,localVersion:1,verifiedAt:f.clock}:null,
   notify(){},now:()=>f.clock,online:()=>true,retirementStore:()=>h.storage});
 await controller.update();const rec=await store.savedGrant('grant:'+JSON.stringify([endpoint,cfg.origin,localId,1])),dev=await store.device(null);
 const originalFence=Grant.retirement(endpoint,who,h.storage);
 assert(rec);assert(originalFence);assert.equal((await Grant.verify(rec.envelope,cfg,dev,{...who,localFence:originalFence},webcrypto,()=>f.clock)).role,'owner');
 f.clock+=45000;const entered=held(),finish=held();h.handler(async b=>{if(b.action==='auth.refresh'){entered.resolve();await finish.promise;}});
 const delayed=h.app.WFCloud.request('accounts.update',{accountId:'fixture'});await entered.promise;
 await h.app.WFAccountAccess.service.signIn({username:'worker',password:pass});
 assert.equal(h.app.WFCloud.getSnapshot().authenticated,false);assert.equal(h.app.WFCloud.can('accounts.edit'),false);
 assert(!h.tab.has(key));assert(h.reloads.length>0);assert(h.reloads.every(r=>!r.cloud.authenticated&&!r.stored));
 const replacement=Grant.retirement(endpoint,who,h.storage);assert(replacement&&replacement!==originalFence);
 await assert.rejects(Grant.verify(rec.envelope,cfg,dev,{...who,localFence:replacement},webcrypto,()=>f.clock));
 finish.resolve();await assert.rejects(delayed,{code:'AUTH_REQUIRED'});
 await assert.rejects(h.app.WFCloud.request('accounts.update',{}),{code:'AUTH_REQUIRED'});
 await assert.rejects(h.app.WFCloud.signIn({username:'owner',password:'fixture'}),{code:'AUTH_REQUIRED'});
 assert.equal(h.calls.filter(c=>c.action==='accounts.update').length,0);assert(!h.app.WFCloud.getSnapshot().authenticated);assert(!h.tab.has(key));
});
test('explicit local sign-out invalidates ordinary cloud callers synchronously and an unconfigured local installation cannot persist an owner credential',async()=>{
 const f=fixture(),h=realApp(f);await pair(h);await h.app.WFAccountAccess.service.signOut();
 assert.equal(h.app.WFCloud.getSnapshot().authenticated,false);assert.equal(h.app.WFCloud.isLinkedOwner(),false);assert(!h.tab.has(key));
 await assert.rejects(h.app.WFCloud.request('sync.pull',{}),{code:'AUTH_REQUIRED'});assert(!h.calls.some(c=>c.action==='sync.pull'));
 const unconfigured=fixture();unconfigured.state=null;const blank=realApp(unconfigured);await blank.ready();
 await blank.app.WFCloud.signIn({username:'owner',password:'fixture'});assert(blank.app.WFCloud.getSnapshot().authenticated);assert(!blank.tab.has(key));
 const reload=realApp(unconfigured,blank.tab);await reload.ready();assert.equal(reload.calls.length,0);assert(!reload.app.WFCloud.getSnapshot().authenticated);
});
