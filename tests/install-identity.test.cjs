const test=require('node:test'),assert=require('node:assert/strict');
const {CACHE,DEFAULTS,normalize,cleanImage,buildManifest,platform,iconGeometry,createStore,createResponder}=require('../install-identity.js');
const origin='https://galeri.wowfurniture.com.tr',png='data:image/png;base64,aGVsbG8=';
function fakeCaches(){
  const buckets=new Map();let fail='';
  const api={set fail(value){fail=value;},async open(name){if(!buckets.has(name))buckets.set(name,new Map());const entries=buckets.get(name);return {
    async put(key,value){const url=typeof key==='string'?key:key.url;if(fail&&url.includes(fail))throw new Error('QuotaExceededError');entries.set(url,value.clone());},
    async match(key,options){const url=typeof key==='string'?key:key.url;for(const [saved,response] of entries)if(saved===url||(options?.ignoreSearch&&saved.split('?')[0]===url.split('?')[0]))return response.clone();},
    async delete(key){return entries.delete(typeof key==='string'?key:key.url);},
    async keys(){return [...entries.keys()].map(url=>new Request(url));}
  };},async keys(){return [...buckets.keys()];},async match(key,options){const url=typeof key==='string'?key:key.url;for(const entries of buckets.values())for(const [saved,response] of entries){if(saved===url||(options?.ignoreSearch&&saved.split('?')[0]===url.split('?')[0]))return response.clone();}}};return api;
}
test('default install identity is independent of business settings and uploaded app logo',()=>{
  assert.deepEqual(normalize({companyName:'Business',branding:{logo:png}}),{name:'مارك ربوت',mode:'default',source:'',custom:false});
  assert.equal(normalize({appIdentity:{version:1,logo:png,installIconMode:'default'}}).source,'');
  assert.equal(normalize({appIdentity:{version:1,logo:png,installIconMode:'app'}}).source,png);
  assert.equal(normalize({appIdentity:{version:1,logo:png,installIcon:png,installIconMode:'custom'}}).source,png);
});
test('retired stock names discard installation artwork while other custom brands retain it',()=>{
  for(const name of ['INFINITY',' infinity ','إنفنتي','انفنتي']){
    const settings={companyName:'Unchanged invoice company',appIdentity:{version:1,name,logo:png,installIcon:png,installIconMode:'custom'}};
    const before=structuredClone(settings);
    assert.deepEqual(normalize(settings),{name:'مارك ربوت',mode:'default',source:'',custom:false});
    assert.deepEqual(settings,before);
  }
  assert.deepEqual(normalize({appIdentity:{version:1,name:'Custom Store',logo:png,installIconMode:'app'}}),{name:'Custom Store',mode:'app',source:png,custom:true});
});
test('names and local image inputs are bounded; unsafe or external images are rejected',()=>{
  assert.equal(normalize({appIdentity:{version:1,name:' \u202eBrand\n ',installIconMode:'other'}}).name,'Brand');
  assert.equal(Array.from(normalize({appIdentity:{version:1,name:'😀'.repeat(80)}}).name).length,60);
  for(const image of ['https://example.com/icon.png','javascript:alert(1)','data:image/svg+xml;base64,abcd','data:image/png;base64,'+'a'.repeat(2100001)])assert.equal(cleanImage(image),'');
  assert.equal(cleanImage(png),png);
});
test('every local manifest preserves the existing app identity, route and scope',()=>{
  const manifest=buildManifest({name:'Other',id:'/wrong',scope:'/wrong',start_url:'/wrong',theme_color:'#123456'},normalize({appIdentity:{version:1,name:'متجري'}}),[{src:'/app-icon-512.png?wf-identity=0123456789abcdef',sizes:'512x512',type:'image/png'}]);
  assert.equal(manifest.id,'/');assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');assert.equal(manifest.name,'متجري');assert.equal(manifest.short_name,'متجري');assert.equal(manifest.theme_color,'#123456');assert.equal(manifest.display,'standalone');assert.equal(manifest.icons.length,1);
  assert(DEFAULTS.icons.some(icon=>icon.sizes==='192x192'));assert(DEFAULTS.icons.some(icon=>icon.sizes==='512x512'&&icon.purpose==='maskable'));
});
test('icon writes must succeed before a manifest can expose the new identity',async()=>{
  const caches=fakeCaches(),store=createStore({caches,origin});const old=buildManifest({},normalize({}),[]);await store.publish(old);
  caches.fail='wf-identity';await assert.rejects(store.publish({...old,name:'New'},[{url:'/app-icon-512.png?wf-identity=0123456789abcdef',blob:new Blob(['x'])}]),/QuotaExceededError/);
  const response=await(await caches.open(CACHE)).match(origin+'/manifest.json');assert.equal((await response.json()).name,'مارك ربوت');
});
test('worker retires an old personalized stock manifest before app settings initialize',async()=>{
  for(const name of ['INFINITY','إنفنتي','انفنتي']){
    const caches=fakeCaches(),store=createStore({caches,origin});
    await store.publish({...DEFAULTS,name,icons:[{src:'/app-icon-512.png?wf-identity=0123456789abcdef'}]},[{url:'/app-icon-512.png?wf-identity=0123456789abcdef',blob:new Blob(['old-stock-artwork'])}]);
    const responder=createResponder({caches,origin,fetch:async()=>new Response(JSON.stringify(DEFAULTS),{headers:{'Content-Type':'application/manifest+json'}})});
    const result=await responder.respond(new Request(origin+'/manifest.json?v=5'));
    assert.equal((await result.json()).name,'مارك ربوت');
    assert.equal(await(await caches.open(CACHE)).match(origin+'/manifest.json'),undefined);
  }
});
test('stale staging cannot overwrite a newer committed preference',async()=>{
  const caches=fakeCaches(),store=createStore({caches,origin});let current=1;
  const first=store.publish({...DEFAULTS,name:'Old'},[],()=>current===1);current=2;
  const second=store.publish({...DEFAULTS,name:'New'},[],()=>current===2);
  assert.equal(await first,false);assert.equal(await second,true);
  assert.equal((await(await(await caches.open(CACHE)).match(origin+'/manifest.json')).json()).name,'New');
});
test('worker serves only local manifest and versioned icon requests, with a public-file fallback',async()=>{
  const caches=fakeCaches(),store=createStore({caches,origin}),fetches=[];
  const responder=createResponder({caches,origin,fetch:async request=>{fetches.push(request.url);return new Response('public',{headers:{'Content-Type':'image/png'}});}});
  await store.publish({...DEFAULTS,name:'Personal'},[{url:'/app-icon-512.png?wf-identity=0123456789abcdef',blob:new Blob(['custom'])}]);
  const local=await responder.respond(new Request(origin+'/manifest.json?v=4'));assert.equal(local.headers.get('X-WF-Install-Identity'),'local');assert.equal((await local.json()).name,'Personal');
  assert.equal(await(await responder.respond(new Request(origin+'/app-icon-512.png?wf-identity=0123456789abcdef'))).text(),'custom');
  for(const url of [origin+'/manifest.json?wf-static=1',origin+'/app-icon-512.png',origin+'/index.html','https://other.example/manifest.json'])assert.equal(responder.respond(new Request(url)),null,url);
  assert.equal(responder.respond(new Request(origin+'/manifest.json',{method:'POST'})),null);
  assert.equal(await(await responder.respond(new Request(origin+'/app-icon-512.png?wf-identity=ffffffffffffffff'))).text(),'public');assert.equal(fetches[0],origin+'/app-icon-512.png');
});
test('reset changes only derived installation metadata and retains the offline public fallback',async()=>{
  const caches=fakeCaches(),store=createStore({caches,origin});await store.publish({...DEFAULTS,name:'Personal'});
  await(await caches.open('wow-furniture-release')).put(origin+'/manifest.json',new Response(JSON.stringify(DEFAULTS)));
  await store.clear();const responder=createResponder({caches,origin,fetch:async()=>{throw new Error('offline');}});
  const result=await responder.respond(new Request(origin+'/manifest.json?v=5'));assert.equal((await result.json()).name,'مارك ربوت');
});
test('platform status recognizes Android and iPad desktop user agents without claiming OS changes',()=>{
  assert.equal(platform({userAgent:'Mozilla Android'}),'android');assert.equal(platform({userAgent:'iPhone'}),'ios');assert.equal(platform({platform:'MacIntel',maxTouchPoints:5}),'ios');assert.equal(platform({platform:'Win32'}),'desktop');
});
test('custom maskable artwork stays inside the safe circle for square, portrait and landscape uploads',()=>{
  for(const [width,height] of [[512,512],[1600,400],[400,1600]]){
    const box=iconGeometry(width,height,512,true);assert(Math.hypot(box.width/2,box.height/2)<512*.4);
    assert.equal(box.x+box.width/2,256);assert.equal(box.y+box.height/2,256);
    const regular=iconGeometry(width,height,512);assert.equal(Math.max(regular.width,regular.height),512*.84);
  }
});
function browserFixture(options={}){
  const vm=require('node:vm'),fs=require('node:fs'),handlers=new Map(),nodes=new Map(),events=[];
  const document={head:{append(node){if(node.name)nodes.set('meta[name="'+node.name+'"]',node);}},body:{append(){}},querySelector(selector){return nodes.get(selector)||null;},querySelectorAll(){return [];},createElement(tag){return {tag,setAttribute(name,value){this[name]=value;},cloneNode(){return {...this};},replaceWith(){},click(){},remove(){}};}};
  const navigator={userAgent:'Test desktop',...options.navigator};
  const window={location:{origin},isSecureContext:true,matchMedia:()=>({matches:false}),addEventListener(name,fn){handlers.set(name,fn);},dispatchEvent(event){events.push(event);}};
  const context={window,document,navigator,URL,Response,Request,Blob,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},setTimeout,clearTimeout,console};
  vm.runInNewContext(fs.readFileSync(require.resolve('../install-identity.js'),'utf8'),context);
  return {api:window.wfInstallIdentity,handlers,events,nodes};
}
test('install remains user-driven and captured browser prompts are consumed once',async()=>{
  const fixture=browserFixture();let prompted=0,prevented=0;
  assert.equal(fixture.api.status().canInstall,false);assert.equal((await fixture.api.install()).outcome,'unavailable');
  fixture.handlers.get('beforeinstallprompt')({preventDefault(){prevented++;},prompt(){prompted++;return Promise.resolve();},userChoice:Promise.resolve({outcome:'accepted'})});
  assert.equal(prevented,1);assert.equal(prompted,0);assert.equal(fixture.api.status().canInstall,true);
  const action=fixture.api.install();assert.equal(prompted,1,'prompt must execute before yielding user activation');
  assert.equal((await action).outcome,'accepted');assert.equal((await fixture.api.install()).outcome,'unavailable');assert.equal(prompted,1);
});
test('modern installation reports browser outcome and never presents an unavailable API as installed',async()=>{
  let invoked=0;const fixture=browserFixture({navigator:{install(){invoked++;return Promise.resolve();}}});
  const result=fixture.api.install();assert.equal(invoked,1);assert.equal((await result).outcome,'installed-or-opened');
  const unavailable=browserFixture();const applied=await unavailable.api.apply({appIdentity:{version:1,name:'Personal'}});
  assert.equal(applied.mode,'static-fallback');assert.equal(applied.installed,false);assert.equal(unavailable.nodes.get('meta[name="application-name"]').content,'Personal');
});
