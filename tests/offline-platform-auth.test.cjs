'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readFileSync}=require('node:fs'),path=require('node:path'),{randomUUID,webcrypto}=require('node:crypto');
const {IDBFactory}=require('fake-indexeddb');
const Cloud=require('../modules/platform/cloud/wow-cloud-client.js'),Store=require('../modules/platform/offline/store.js');
const Transport=require('../modules/platform/offline/transport.js'),Policy=require('../accounts-policy.js');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,2));}assert.fail('did not settle');}

test('the cloud client rechecks local ownership when access-token renewal finishes and before a result leaves the client',async()=>{
  const held=deferred(),renewal=deferred(),resultStarted=deferred(),finish=deferred(),calls=[];
  let allowed=true,clock=100000;
  const account={id:'owner',role:'owner',permissions:[],sessionVersion:1,status:'active'};
  const auth=()=>({ok:true,workspaceId:'fixture',identity:{currentAccount:account,accounts:[account],audit:[]},
    session:{access_token:'access',refresh_token:'refresh',expires_at:Math.floor(clock/1000)+60}});
  const client=Cloud.create({mode:'local',config:{enabled:true,endpoint:'https://local.invalid/test',publishableKey:'fixture'},
    sessionStore:{read(){},clear(){},write(){}},getLocalSnapshot:()=>({configured:true,currentAccount:{id:'local-fixture',role:'owner',status:'active',sessionVersion:1}}),now:()=>clock,fetch:async(url,opts)=>{
      const {action}=JSON.parse(opts.body);calls.push(action);
      if(action==='auth.refresh'){renewal.resolve();await held.promise;}
      if(action==='files.list'){resultStarted.resolve();await finish.promise;}
      return {ok:true,status:200,json:async()=>action.startsWith('auth.')?auth():{ok:true,files:[]}};
    }});
  await client.signIn({username:'fixture',password:'fixture'});clock+=40000;
  const assertAuthorized=()=>{if(!allowed)throw Object.assign(Error('LOCAL_SWITCH'),{code:'AUTH_REQUIRED',status:401,local:true});};
  const request=client.request('finance.list',{tab:'boxes'},{assertAuthorized});
  await renewal.promise;allowed=false;held.resolve();await assert.rejects(request,{code:'AUTH_REQUIRED'});assert.deepEqual(calls,['auth.signIn','auth.refresh']);
  assert.equal(client.getSnapshot().authenticated,true);
  allowed=true;const later=client.request('files.list',{},{assertAuthorized});
  await resultStarted.promise;allowed=false;finish.resolve();await assert.rejects(later,{code:'AUTH_REQUIRED'});
  assert.equal(client.getSnapshot().authenticated,true);assert.equal((await client.request('session.snapshot')).ok,true);
});

function shell() {
  const routes=new Map(),nav=[],events=new Map(),calls=[],mounts=[],holds=[];
  let route='dashboard',dirty=false,allowLeave=false,clock=1000,mounted=0;
  const mk=()=>({children:[],dataset:{},setAttribute(){},addEventListener(){},classList:{add(){},toggle(){}},
    append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;}});
  const document={createElement:mk,getElementById:()=>({append(n){nav.push(n);}}),querySelector:()=>({id:'page-'+route})};
  const me=(id,role='owner',permissions=[])=>({id,role,permissions,status:'active',sessionVersion:1});
  let local={configured:true,currentAccount:me('local-owner')};
  let cloud={mode:'local',authenticated:true,workspaceId:'workspace',userId:'cloud-owner',role:'owner',authGeneration:1,sessionVersion:1,lastVerifiedAt:1000,currentAccount:me('cloud-owner')};
  const callbacks=new Set(),store=Store.create({indexedDB:new IDBFactory(),uuid:randomUUID});
  const root={document,WFAccountPolicy:Policy,confirm:()=>allowLeave,showPage:id=>{route=id;},WFAccountAccess:{service:{getSnapshot:()=>local},
    can:key=>!local.configured||Policy.can(local.currentAccount,key)},WFCloud:{getSnapshot:()=>cloud,getConfig:()=>({endpoint:'local-fixture'}),
    subscribe:fn=>callbacks.add(fn),request:async(a,p,opts)=>{opts.assertAuthorized?.();calls.push([a,p]);const h=holds.shift();if(h){h.start.resolve();await h.finish.promise;}return {ok:true,items:[{id:'private'}]};}},
    WFModuleTransport:{create:options=>Transport.create({...options,store,crypto:webcrypto,channel:null,isOnline:()=>true,isVisible:()=>true,
      setTimeout:()=>1,clearTimeout(){},now:()=>clock})},WFOperations:{locale:()=>'en',icon:()=>'',register:def=>{
      routes.set(def.id,def);return {body:mk(),page:mk(),actions:mk()};},notify(){}},addEventListener:(name,fn)=>{if(!events.has(name))events.set(name,[]);events.get(name).push(fn);}};
  vm.runInNewContext(readFileSync(path.join(__dirname,'../modules/platform/registry.js'),'utf8'),{window:root,queueMicrotask,Date,console});
  const register=(id,permission)=>root.WFModules.register({id,permission,title:{en:id},mount({api}){mounted++;const record={api,id,disposed:false};mounts.push(record);
    return {dispose(){record.disposed=true;},hasUnsavedChanges:()=>dirty};}});
  const change=()=>{clock+=50;for(const fn of callbacks)fn();};
  register('gallery','gallery.view');register('files','files.view');
  return {root,me,mounts,calls,route:()=>route,count:()=>mounted,hold(){const h={start:deferred(),finish:deferred()};holds.push(h);return h;},
    setLocal(next){local=next;change();},setCloud(next){cloud={...cloud,...next,lastVerifiedAt:clock+50};change();},dirty:v=>{dirty=v;},allowLeave:v=>{allowLeave=v;}};
}
test('registry checks local owner and remote employee identity at mount and on both sides of pending reads',async()=>{
  const h=shell();h.root.showPage('gallery');await until(()=>h.count()===1);
  const old=h.mounts[0].api,hold=h.hold(),pending=old.request('gallery.snapshot');await hold.start.promise;
  h.setLocal({configured:true,currentAccount:h.me('local-worker','custom',['gallery.view'])});
  hold.finish.resolve();await assert.rejects(pending,{code:'AUTH_REQUIRED'});await until(()=>h.mounts[0].disposed);
  await assert.rejects(old.request('gallery.snapshot'),{code:'AUTH_REQUIRED'});assert.equal(h.count(),1);
  h.setCloud({mode:'remote',currentAccount:h.me('cloud-worker','custom',['gallery.view']),userId:'cloud-worker',role:'custom',authGeneration:2});
  await new Promise(r=>setImmediate(r));assert.equal(h.count(),1);assert.equal(h.root.WFModules.can('gallery.view'),false);
  h.setLocal({configured:true,currentAccount:h.me('cloud-worker','custom',['gallery.view'])});await until(()=>h.count()===2);
  assert.equal(h.root.WFModules.can('gallery.edit'),false);await assert.rejects(h.mounts.at(-1).api.request('gallery.snapshot',{manage:true}),{code:'AUTH_REQUIRED'});
  assert.equal(h.calls.length,1);
});

test('same actor grant edits and old generation invalidate result delivery; dirty navigation and explicit refresh preserve the form',async()=>{
  const h=shell();h.root.showPage('gallery');await until(()=>h.count()===1);
  h.dirty(true);assert.equal(h.root.showPage('files'),false);assert.equal(h.route(),'gallery');
  h.root.WFModules.refresh();await new Promise(r=>setImmediate(r));assert.equal(h.count(),1);assert.equal(h.mounts[0].disposed,false);
  h.dirty(false);const old=h.mounts[0].api,hold=h.hold(),pending=old.request('gallery.snapshot');await hold.start.promise;
  h.root.showPage('files');await until(()=>h.mounts[0].disposed);hold.finish.resolve();await assert.rejects(pending,{code:'AUTH_REQUIRED'});
  h.root.showPage('gallery');await until(()=>h.count()>=3);
  const prior=h.mounts.at(-1).api;
  h.setCloud({mode:'remote',role:'custom',userId:'local-owner',currentAccount:h.me('local-owner','custom',['gallery.view','gallery.edit'])});
  await until(()=>h.mounts.at(-1).api!==prior);const broad=h.mounts.at(-1).api;
  h.setCloud({currentAccount:h.me('local-owner','custom',['gallery.view'])});
  await until(()=>h.mounts.at(-1).api!==broad);await assert.rejects(broad.request('gallery.snapshot',{}),{code:'AUTH_REQUIRED'});
  const latest=h.mounts.at(-1).api;await assert.rejects(latest.request('gallery.snapshot',{manage:true}),{code:'AUTH_REQUIRED'});
});
