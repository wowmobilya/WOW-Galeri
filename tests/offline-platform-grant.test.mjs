import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,mkdtemp,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {webcrypto,randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {IDBFactory} from 'fake-indexeddb';
import {createOfflineGrantActions} from '../supabase/functions/wow-cloud/modules/offline-grant.mjs';
import {generatePrivateFile} from '../supabase/management/generate-offline-owner-key.mjs';
const use=createRequire(import.meta.url),Store=use('../modules/platform/offline/store.js'),Grant=use('../modules/platform/offline/grant.js'),
  Transport=use('../modules/platform/offline/transport.js'),policy=use('../accounts-policy.js'),gallery=use('../modules/gallery/core.js');
const source=await readFile(new URL('../modules/platform/registry.js',import.meta.url),'utf8');
const wait=()=>new Promise(resolve=>setTimeout(resolve,3));
async function until(fn){for(let i=0;i<250;i++){if(await fn())return;await wait();}assert.fail('condition did not settle');}
const te=new TextEncoder(),origin='https://app.fixture.invalid',endpoint='https://backend.fixture.invalid/functions/v1/wow-cloud';
const uuid=randomUUID,localOwner='account_'+'a'.repeat(32),localEpoch=2;
async function server(){
  const pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const jwk=await webcrypto.subtle.exportKey('jwk',pair.privateKey),publicKey={crv:jwk.crv,kty:jwk.kty,x:jwk.x,y:jwk.y};
  const pin=createHash('sha256').update(JSON.stringify(publicKey)).digest('base64url');
  const clock={ms:1760000000000},workspace=uuid(),account={id:uuid(),status:'active',role:'owner',sessionVersion:3,permissions:[],expiresAt:null};
  const options={rpc:async(action)=>{assert.equal(action,'session.snapshot');return {workspaceId:workspace,identity:{currentAccount:account}};},
    origins:[origin],endpoint,signingKey:JSON.stringify(jwk),permissionKeys:policy.permissionKeys,now:()=>clock.ms};
  const handler=createOfflineGrantActions(options)['offline.ownerGrant'],actor={userId:account.id,sessionId:uuid()};
  const issue=(body,aud=origin)=>handler({actor,body,request:new Request(endpoint,{headers:{origin:aud}})});
  const cfg={enabled:true,origin,endpoint,pin,permissionKeys:policy.permissionKeys};
  return {pair,cfg,account,clock,workspace,options,issue};
}
async function device(f){
  const s=Store.create({indexedDB:new IDBFactory(),now:()=>f.clock.ms}),dev=await Grant.deviceFor(s,webcrypto,true,()=>{});
  const who={localOwner,localEpoch},proof=await Grant.enrollment(dev,f.cfg,who,webcrypto,()=>f.clock.ms);
  return {s,dev,proof,who};
}
test('ES256 saved-copy grant verifies exact app/issuer/pin, proof of device possession, owner, epoch, full permission set and signed lifetime',async()=>{
  const f=await server(),{dev,proof,who}=await device(f),env=await f.issue(proof),second=await device(f);
  const trusted={...who,workspace:f.workspace,user:f.account.id,serverEpoch:3};
  const verify=(e=env,c=f.cfg,d=dev,x=trusted,t=f.clock.ms)=>Grant.verify(e,c,d,x,webcrypto,()=>t);
  const claims=await verify();assert.equal(claims.exp-claims.iat,86400);assert.equal(claims.localOwner,localOwner);
  assert.equal(dev.privateKey.extractable,false);await assert.rejects(webcrypto.subtle.exportKey('jwk',dev.privateKey));
  const [h,p,signature]=env.grant.split('.'),tampered=Buffer.from(JSON.stringify({...claims,serverEpoch:9})).toString('base64url');
  await assert.rejects(verify({...env,grant:[h,tampered,signature].join('.')}));await assert.rejects(verify(env,{...f.cfg,origin:'https://other.invalid'}));
  await assert.rejects(verify(env,{...f.cfg,endpoint:'https://different-backend.invalid/api'}));
  await assert.rejects(verify(env,{...f.cfg,pin:'g'.repeat(43)}));await assert.rejects(verify(env,{...f.cfg,permissionKeys:['gallery.view']}));
  await assert.rejects(verify(env,f.cfg,second.dev));await assert.rejects(verify(env,f.cfg,{...dev,privateKey:second.dev.privateKey}));
  for(const patch of [{localOwner:'account_'+'b'.repeat(32)},{localEpoch:8},{serverEpoch:1},{user:uuid()},{workspace:uuid()}]){
    await assert.rejects(verify(env,f.cfg,dev,{...trusted,...patch}));}
  await assert.rejects(verify(env,f.cfg,dev,trusted,claims.exp*1000));await assert.rejects(verify(env,f.cfg,dev,trusted,(claims.iat-40)*1000));
  async function signed(c){const value=h+'.'+Buffer.from(JSON.stringify(c)).toString('base64url');
    const s=await webcrypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},f.pair.privateKey,te.encode(value));
    return {...env,grant:value+'.'+Buffer.from(s).toString('base64url')};}
  await assert.rejects(verify(await signed({...claims,exp:claims.iat+86401})));
  await assert.rejects(f.issue({...proof,localEpoch:999}),{code:'ACCESS_DENIED'});
  await assert.rejects(f.issue(proof,'https://forged.invalid'),{code:'ACCESS_DENIED'});
  f.account.role='sales';await assert.rejects(f.issue(proof),{code:'ACCESS_DENIED'});f.account.role='owner';
  f.account.expiresAt=new Date(f.clock.ms+50000).toISOString();assert.equal((await verify(await f.issue(proof))).exp,Math.floor(f.clock.ms/1000)+50);
  const unset=createOfflineGrantActions({...f.options,signingKey:''})['offline.ownerGrant'];
  await assert.rejects(unset({body:proof,actor:{userId:f.account.id,sessionId:uuid()},request:new Request(endpoint,{headers:{origin}})}),{code:'OFFLINE_GRANT_UNCONFIGURED'});
});

const ownerMarkers=new WeakMap();
function browser(f,factory,{live=false,localRole='owner',localVersion=localEpoch,mode='local',configured=true}={}) {
  const mk=()=>({children:[],dataset:{},classList:{add(){},toggle(){}},setAttribute(){},addEventListener(){},
    append(...a){this.children.push(...a);},replaceChildren(...a){this.children=a;}});
  if(!ownerMarkers.has(factory))ownerMarkers.set(factory,new Map());
  const markers=ownerMarkers.get(factory),localStorage={getItem:k=>markers.get(k)||null,setItem:(k,v)=>markers.set(k,v)};
  const calls=[],subs=[],events=new Map(),mounted=[];
  let connected=live,route='gallery',isLive=live,lastError='',generation=live?1:0;
  const local={configured,currentAccount:configured&&localRole?{id:localOwner,role:localRole,sessionVersion:localVersion,status:'active',permissions:['gallery.view']}:null};
  const current=()=>isLive?{authenticated:true,mode,workspaceId:f.workspace,userId:f.account.id,role:'owner',authGeneration:generation,sessionVersion:3,currentAccount:f.account,
    connection:'online',lastVerifiedAt:f.clock.ms}:{authenticated:false,mode,workspaceId:null,userId:null,currentAccount:null,authGeneration:generation,connection:lastError?'signed-out':'offline',lastError};
  const store=Store.create({indexedDB:factory,uuid,now:()=>f.clock.ms});
  const cloud={getSnapshot:current,subscribe:fn=>subs.push(fn),isConfigured:()=>true,getConfig:()=>({endpoint}),request:async(action,p,opts)=>{
    opts.assertAuthorized?.();calls.push(action);if(!isLive)assert.fail('cold offline grant initiated a cloud call');
    if(action==='offline.ownerGrant')return f.issue(p);
    if(action==='gallery.snapshot')return {items:[{productId:7,name:'Verified display table'}]};
    if(action==='gallery.order.place')return {orderId:'server-confirmed'};
    throw Error(action);
  }};
  const doc={createElement:mk,getElementById:()=>mk(),querySelector:()=>({id:'page-'+route})};
  const noTimer=()=>1,root={localStorage,document:doc,location:{origin},navigator:{get onLine(){return connected;}},
    WOW_CLOUD_CONFIG:{offlineGrantPin:f.cfg.pin},WFAccountPolicy:policy,WFAccountAccess:{service:{getSnapshot:()=>local},can:key=>!configured||policy.can(local.currentAccount,key)},
    WFCloud:cloud,WFModuleStore:{create:()=>store},WFOfflineOwnerGrant:{retirement:Grant.retirement,create:opts=>Grant.create({...opts,now:()=>f.clock.ms,online:()=>connected,setTimer:noTimer,clearTimer(){},retirementStore:()=>localStorage})},
    WFModuleTransport:{create:opts=>Transport.create({...opts,now:()=>f.clock.ms,channel:null,isOnline:()=>connected,isVisible:()=>true,setTimeout:noTimer,clearTimeout(){}})},
    WFOperations:{locale:()=>'en',icon:()=>'',register:()=>({body:mk(),page:mk(),actions:mk()}),notify(){}},
    showPage:id=>{route=id;},addEventListener:(event,fn)=>{if(!events.has(event))events.set(event,[]);events.get(event).push(fn);}};
  vm.runInNewContext(source,{window:root,queueMicrotask,Date});
  root.WFModules.register({id:'gallery',permission:'gallery.view',title:{en:'Gallery'},mount({api}){
    const entry={api,session:api.getSession()};mounted.push(entry);
    api.request('gallery.snapshot').then(value=>entry.result=value,error=>entry.error=error);
    return {dispose(){entry.disposed=true;}};
  }});
  return {root,calls,mounted,cloud,store,goLive(){connected=true;isLive=true;generation++;for(const fn of subs)fn();},
    goOnlineHint(){connected=true;for(const fn of events.get('online')||[])fn();},
    signOut(){isLive=false;generation++;lastError='SESSION_REVOKED';for(const fn of subs)fn();}};
}
async function count(store,name){const db=await store.open();return new Promise(r=>{const q=db.transaction(name).objectStore(name).getAll();q.onsuccess=()=>r(q.result);});}
test('a fresh offline app/window with a verified local owner reopens its real cached module, queues safely, and posts only after matching fresh cloud authentication',async()=>{
  const f=await server(),factory=new IDBFactory(),first=browser(f,factory,{live:true});
  await until(()=>first.mounted[0]?.result);await until(async()=>(await count(first.store,'grantState')).some(r=>r.envelope));
  assert.equal(first.mounted[0].result._sync.source,'server');
  const cold=browser(f,factory);await until(()=>cold.mounted[0]?.result);
  const v=cold.mounted[0].api,s=v.getSession();
  assert.equal(cold.cloud.getSnapshot().authenticated,false);assert.equal(s.authenticated,false);assert.equal(s.offlineVerified,true);
  assert(gallery.scopeKey(s));assert.equal(cold.mounted[0].result.items[0].name,'Verified display table');
  assert.deepEqual([cold.mounted[0].result._sync.source,cold.mounted[0].result._sync.stale],['device',true]);
  assert.equal(v.can('assistant.view'),false);assert.equal(v.can('serveradmin.view'),false);
  const cmd={commandId:uuid(),accepted:true,items:[{productId:7,quantity:1,priceMinor:1200,currency:'USD'}]};
  const queued=await v.request('gallery.order.place',cmd);assert.equal(queued.queued,true);assert.equal((await v.listOutbox())[0].queueId,queued.queueId);
  cold.goOnlineHint();await assert.rejects(v.syncNow(),{code:'CLOUD_SIGN_IN_REQUIRED'});
  for(const action of ['assistant.ask','operations.health','gallery.image'])await assert.rejects(v.request(action,{}),{code:'NETWORK'});
  assert.deepEqual(cold.calls,[]);
  const secondFactory=new IDBFactory(),empty=browser(f,secondFactory);await wait();assert.equal(empty.mounted.length,0);
  const stranger=browser(f,factory,{localRole:'sales'}),remote=browser(f,factory,{mode:'remote'}),emptyLocal=browser(f,factory,{configured:false}),wrongEpoch=browser(f,factory,{localVersion:9});
  await new Promise(r=>setTimeout(r,35));for(const invalid of [stranger,remote,emptyLocal,wrongEpoch])assert.equal(invalid.mounted.length,0);
  cold.goLive();await until(()=>cold.mounted.length>=2&&cold.mounted.at(-1).result);
  const online=cold.mounted.at(-1).api,receipts=[];online.subscribeReceipts(r=>receipts.push(r));await online.syncNow();
  assert.equal(online.getSession().authenticated,true);assert.equal(cold.calls.filter(a=>a==='gallery.order.place').length,1);
  assert.equal(receipts[0].result.orderId,'server-confirmed');assert.equal(receipts[0].queueId,queued.queueId);
  cold.signOut();await until(async()=>!(await count(cold.store,'grantState')).some(r=>r.envelope));
  const reopened=browser(f,factory);await new Promise(r=>setTimeout(r,25));assert.equal(reopened.mounted.length,0);
});

test('operator helper creates only a protected private file and refuses to overwrite it',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'wf-key-fixture-')),out=join(dir,'signing.jwk');
  try{const pin=await generatePrivateFile(out),jwk=JSON.parse(await readFile(out,'utf8'));
    assert.match(pin,/^[A-Za-z0-9_-]{43}$/);assert.equal((await stat(out)).mode&0o777,0o600);
    assert.equal(pin,createHash('sha256').update(JSON.stringify({crv:jwk.crv,kty:jwk.kty,x:jwk.x,y:jwk.y})).digest('base64url'));
    await assert.rejects(generatePrivateFile(out),{code:'EEXIST'});await assert.rejects(generatePrivateFile('./bad.jwk'));
  }finally{await rm(dir,{recursive:true,force:true});}
});
