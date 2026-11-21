'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8');
const base='https://example.test/app/';
const url=value=>new URL(typeof value==='string'?value:value.url,base).href;
const music='./assets/gallery/wow-ambient-v1.mp3';
const musicBytes=fs.readFileSync(path.join(__dirname,'..',music));
const response=tag=>({ok:true,tag,clone(){return response(tag);}});
function fixture({fail=()=>false,seed=false,networkResponse}={}){
  let active=0,maximum=0,skip=0;const calls=[],requests=[],handlers={},stores=new Map();
  const previous=new Map();if(seed)stores.set('wow-furniture-v205-test',previous);
  const cache=name=>({
    async match(request){return stores.get(name)?.get(url(request))?.clone();},
    async put(request,value){stores.get(name).set(url(request),value.clone());},
    async delete(request){return stores.get(name).delete(url(request));},
    async add(request){
      calls.push(url(request));maximum=Math.max(maximum,++active);
      try{await new Promise(resolve=>setImmediate(resolve));if(fail(url(request)))throw new Error('asset unavailable');await this.put(request,response('network:'+url(request)));}
      finally{active--;}
    }
  });
  const context={importScripts(){},URL,Headers,Response,Uint8Array,crypto:webcrypto,Request:class extends Request{constructor(value,options={}){super(url(value),options);}},
    fetch:async(request,options)=>{calls.push(url(request));requests.push({request,options});if(fail(url(request)))throw new Error('network unavailable');return networkResponse?.(request,options)||
      (url(request)===url(music)?new Response(musicBytes,{headers:{'Content-Type':'audio/mpeg','Content-Length':String(musicBytes.length)}}):response('network:'+url(request)));},
    caches:{async keys(){return [...stores.keys()];},async open(name){if(!stores.has(name))stores.set(name,new Map());return cache(name);},async delete(name){return stores.delete(name);},async match(request){for(const data of stores.values())if(data.has(url(request)))return data.get(url(request)).clone();}},
    self:{location:{origin:'https://example.test',href:base+'sw.js'},addEventListener(name,fn){handlers[name]=fn;},skipWaiting(){skip++;return Promise.resolve();},clients:{claim:async()=>{}}},console};
  vm.runInNewContext(source+'\nthis.qa={CACHE_NAME,urlsToCache};',context);
  const seeded=Array.isArray(seed)?seed:seed?context.qa.urlsToCache.filter(value=>value.startsWith('./')&&/[?&]v=/.test(value)):[];
  for(const asset of seeded)previous.set(url(asset),response('previous:'+url(asset)));
  function install(){let pending;handlers.install({waitUntil(value){pending=value;}});return pending;}
  function activate(){let pending;handlers.activate({waitUntil(value){pending=value;}});return pending;}
  function request(asset,options={}){let pending;handlers.fetch({request:{url:url(asset),method:'GET',mode:'cors',headers:new Headers(),...options},respondWith(value){pending=value;}});return pending;}
  return{context,install,activate,request,calls,requests,stores,get maximum(){return maximum;},get skip(){return skip;}};
}
test('offline installation bounds network work and activates only after the required shell is ready',async()=>{
  const f=fixture(),pending=f.install();assert.equal(f.skip,0);await pending;
  assert(f.maximum<=6,'at most six asset requests at once');assert.equal(f.skip,1);
  const stored=f.stores.get(f.context.qa.CACHE_NAME);
  assert(stored.has(url('./index.html')));assert(stored.has(url('./')));
  assert.equal(f.calls.filter(value=>value===url('./')||value===url('./index.html')).length,1,'fetch the HTML once for both cache aliases');
  for(const asset of ['purchase-planner.js?v=3','invoice-preview.css?v=1','label-reprint-history.js?v=2','accounts-access.js?v=4','accounts-settings.css?v=1','modules/platform/cloud/wow-cloud-client.js?v=1','modules/platform/cloud/wow-cloud-sync.js?v=1','modules/platform/cloud/wow-cloud-settings.js?v=1','modules/platform/push/wow-push-device.js?v=2','modules/platform/push/wow-push-client.js?v=2','modules/platform/push/wow-push-settings.js?v=2','modules/platform/push/wow-push-sw.js?v=2'])assert(stored.has(url('./'+asset)));
});
test('updates reuse exactly versioned prior assets and fetch fresh unversioned configuration and HTML',async()=>{
  const f=fixture({seed:true});await f.install();
  assert.equal(f.calls.some(value=>/[?&]v=/.test(value)),false,'unchanged versioned assets do not download twice');
  assert(f.calls.includes(url('./index.html')));assert(f.calls.includes(url('./google-drive-config.js')));
  const stored=f.stores.get(f.context.qa.CACHE_NAME);
  assert.match(stored.get(url('./package-labels.js?v=8')).tag,/^previous:/);
});
test('a required script failure retains the old worker, while optional audio failure does not block the shell',async()=>{
  const required=fixture({fail:value=>value.includes('/purchase-planner.js')});
  await assert.rejects(required.install());assert.equal(required.skip,0);
  const optional=fixture({fail:value=>value.includes('/assets/robot-identity/')});
  await optional.install();assert.equal(optional.skip,1);assert(optional.stores.get(optional.context.qa.CACHE_NAME).has(url('./index.html')));
});
test('an update downloads new versions and retains installed speech compatibility imports after activation',async()=>{
  const aliases=[1,2,4].map(version=>'./reference-voice.js?v='+version);
  const unchanged='./vendor/JsBarcode.code128.min.js?v=3.11.5';
  const f=fixture({seed:['./index.html','./speech-controls.js?v=4','./accounts-core.js?v=1','./accounts-access.js?v=1',unchanged,...aliases]});
  await f.install();
  assert(f.calls.includes(url('./speech-controls.js?v=5')),'changed code must be downloaded');
  assert(f.calls.includes(url('./purchase-planner.js?v=3')),'new modules must be downloaded');
  for(const asset of ['accounts-core.js?v=3','accounts-access.js?v=4','modules/platform/cloud/wow-cloud-client.js?v=1','modules/platform/cloud/wow-cloud-sync.js?v=1','modules/platform/push/wow-push-sw.js?v=2'])assert(f.calls.includes(url('./'+asset)),'current owner and cloud code must replace the previous assets');
  assert.equal(f.calls.includes(url(unchanged)),false,'only exact unchanged URLs may be reused');
  assert.equal(f.calls.includes(url('./speech-controls.js?v=4')),false);
  await f.activate();
  assert.equal(f.stores.has('wow-furniture-v205-test'),false);
  const current=f.stores.get(f.context.qa.CACHE_NAME);
  for(const alias of aliases)assert.match(current.get(url(alias)).tag,/^previous:/);
  assert.equal(current.has(url('./speech-controls.js?v=4')),false);
});
test('failed HTML, CSS or JavaScript installation leaves every previous-cache entry intact',async()=>{
  for(const asset of ['./index.html','./invoice-preview.css?v=1','./purchase-planner.js?v=3']){
    const f=fixture({seed:['./index.html','./speech-controls.js?v=4','./reference-voice.js?v=1'],fail:value=>value===url(asset)});
    const previous=f.stores.get('wow-furniture-v205-test'),before=[...previous].map(([key,value])=>[key,value.tag]);
    await assert.rejects(f.install());
    assert.equal(f.skip,0,asset+' must not activate the incomplete shell');
    assert.deepEqual([...f.stores.get('wow-furniture-v205-test')].map(([key,value])=>[key,value.tag]),before);
  }
});
test('the released HTML and offline shell use the same existing local script and stylesheet versions',()=>{
  const f=fixture(),root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const assets=new Set(f.context.qa.urlsToCache.map(value=>url(value)));
  const references=[...html.matchAll(/(?:src|href)=["']([^"']+\.(?:m?js|css)(?:\?[^"']*)?)["']/g)]
    .map(match=>match[1]).filter(value=>! /^(?:https?:|data:|blob:)/.test(value));
  assert(references.length>100,'check the complete application shell');
  for(const reference of references)assert(assets.has(url(reference)),reference+' must use the same precached version');
  for(const asset of f.context.qa.urlsToCache.filter(value=>value.startsWith('./')&&value!=='./'))
    assert(fs.existsSync(path.join(root,asset.split('?')[0])),asset+' must exist before release');
});
test('warm navigation uses exact active-release asset hits without issuing network requests',async()=>{
  const f=fixture();await f.install();f.calls.length=0;
  const asset='./modules/platform/cloud/wow-cloud-client.js?v=1',cached=f.stores.get(f.context.qa.CACHE_NAME).get(url(asset));
  assert.equal((await f.request(asset)).tag,cached.tag);assert.equal(f.calls.length,0);
  f.stores.get(f.context.qa.CACHE_NAME).delete(url(asset));
  assert.match((await f.request(asset)).tag,/^network:/);assert.deepEqual(f.calls,[url(asset)]);
});
test('configuration, navigation, unlisted versions and sensitive requests keep the network path',async()=>{
  const f=fixture();await f.install();f.calls.length=0;
  await f.request('./modules/platform/cloud/wow-cloud-config.js?v=1');
  await f.request('./index.html',{mode:'navigate'});
  await f.request('./modules/platform/cloud/wow-cloud-client.js?v=900');
  await f.request('./modules/platform/cloud/wow-cloud-client.js?v=1',{cache:'no-store'});
  await f.request('https://example.supabase.co/rest/v1/private',{headers:{has:()=>true}});
  await f.request('./sensitive',{headers:{has:key=>key==='authorization'}});
  assert.deepEqual(f.calls,[url('./modules/platform/cloud/wow-cloud-config.js?v=1'),url('./index.html'),url('./modules/platform/cloud/wow-cloud-client.js?v=900'),url('./modules/platform/cloud/wow-cloud-client.js?v=1'),'https://example.supabase.co/rest/v1/private',url('./sensitive')]);
  assert.equal(f.stores.get(f.context.qa.CACHE_NAME).has('https://example.supabase.co/rest/v1/private'),false);
  assert.equal(f.stores.get(f.context.qa.CACHE_NAME).has(url('./sensitive')),false);
});

test('withdrawable share HTML and images stay network-only and cannot replay a poisoned cache offline',async()=>{
 let offline=false;
 const f=fixture({fail:value=>offline&&value.includes('/share/')} );await f.install();
 const targets=['https://example.test/share/aaaaaaaa-1111-4111-8111-111111111111/',
  'https://example.test/share/aaaaaaaa-1111-4111-8111-111111111111/image/0123456789abcdef.jpeg'];
 for(const target of targets){
  await f.request(target,{mode:'navigate'});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.stores.get(f.context.qa.CACHE_NAME).has(target),false,'no publication enters the application cache');
  f.stores.get(f.context.qa.CACHE_NAME).set(target,response('withdrawn copy'));
 }
 offline=true;
 for(const target of targets){const result=await f.request(target,{mode:'navigate'});
  assert.equal(result.ok,false);assert.equal(result.type,'error','no cached snapshot and no app-shell fallback');}
 assert.equal((await f.request('./modules/gallery/core.js?v=1')).ok,true,'ordinary installed code remains available');
});

test('credential callbacks never enter CacheStorage request keys or navigation fallback',async()=>{
 let offline=false;const f=fixture({fail:()=>offline});await f.install();
 for(const key of ['token_hash','access_token','refresh_token','id_token','code','challenge','wf-customer']){
  const target=url('./?'+key+'=fixture-only-proof');
  await f.request(target,{mode:'navigate'});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.stores.get(f.context.qa.CACHE_NAME).has(target),false,key);
  f.stores.get(f.context.qa.CACHE_NAME).set(target,response('old credential URL'));
  offline=true;assert.equal((await f.request(target,{mode:'navigate'})).type,'error');offline=false;
 }
});

test('a response declaring private or no-store is not manually cached',async()=>{
 for(const control of ['no-store','private, max-age=600','max-age=0, no-store']){
  const f=fixture({networkResponse:request=>({...response('private'),headers:{get:key=>key==='cache-control'?control:null}})});
  await f.install();const target=url('./dynamic-result');await f.request(target);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.stores.get(f.context.qa.CACHE_NAME).has(target),false,control);
 }
});

test('bundled music uses the warm exact cache offline and serves bounded native byte ranges',async()=>{
 const f=fixture({fail:()=>true}),cache=await f.context.caches.open(f.context.qa.CACHE_NAME);
 assert.equal(musicBytes.length,128832);
 await cache.put(url(music),new Response(musicBytes,{headers:{'Content-Type':'audio/mpeg','Content-Encoding':'gzip','Transfer-Encoding':'chunked','Content-Length':'1'}}));
 const full=await f.request(music);assert.equal(full.status,200);assert.equal(full.headers.get('Content-Type'),'audio/mpeg');
 assert.equal(full.headers.get('Content-Length'),String(musicBytes.length));assert.equal(full.headers.get('Accept-Ranges'),'bytes');
 assert.equal(full.headers.get('Content-Encoding'),null);assert.equal(full.headers.get('Transfer-Encoding'),null);
 assert.deepEqual(Buffer.from(await full.arrayBuffer()),musicBytes);
 for(const [range,start,end] of [['bytes=0-1',0,1],['bytes=128830-',128830,128831],['bytes=-7',128825,128831],['bytes=128830-999999999999999999999',128830,128831],['bytes=-999999999999999999999',0,128831]]){
  const partial=await f.request(music,{headers:new Headers({Range:range})});
  assert.equal(partial.status,206,range);assert.equal(partial.headers.get('Content-Range'),`bytes ${start}-${end}/${musicBytes.length}`);
  assert.equal(partial.headers.get('Content-Length'),String(end-start+1));assert.equal(partial.headers.get('Accept-Ranges'),'bytes');
  assert.deepEqual(Buffer.from(await partial.arrayBuffer()),musicBytes.subarray(start,end+1));
 }
 assert.equal(f.calls.length,0,'warm full/range requests never contact the network');
});

test('music byte range failures are explicit and unsupported or conditional ranges return the complete representation',async()=>{
 const f=fixture({fail:()=>true}),cache=await f.context.caches.open(f.context.qa.CACHE_NAME);
 await cache.put(url(music),new Response(musicBytes));
 for(const range of ['bytes=128832-','bytes=9-3','bytes=-0','bytes=999999999999999999999-']){
  const result=await f.request(music,{headers:new Headers({Range:range})});
  assert.equal(result.status,416,range);assert.equal(result.headers.get('Content-Range'),'bytes */128832');
  assert.equal(result.headers.get('Content-Length'),'0');assert.equal((await result.arrayBuffer()).byteLength,0);
 }
 for(const headers of [{Range:'items=0-1'},{Range:'bytes=0-1,5-6'},{Range:'bytes=bad'},{Range:'bytes=-'},{Range:'bytes=0-1','If-Range':'"different-entity"'}]){
  const result=await f.request(music,{headers:new Headers(headers)});
  assert.equal(result.status,200);assert.equal(result.headers.get('Content-Range'),null);
  assert.deepEqual(Buffer.from(await result.arrayBuffer()),musicBytes);
 }
 assert.equal(f.calls.length,0);
});

test('a cold range fetch downloads and caches one full music response, including concurrent requests',async()=>{
 const f=fixture();const [first,second]=await Promise.all([
  f.request(music,{headers:new Headers({Range:'bytes=0-1'})}),f.request(music,{headers:new Headers({Range:'bytes=-2'})})]);
 assert.equal(first.status,206);assert.deepEqual(Buffer.from(await first.arrayBuffer()),musicBytes.subarray(0,2));
 assert.equal(second.status,206);assert.deepEqual(Buffer.from(await second.arrayBuffer()),musicBytes.subarray(-2));
 assert.deepEqual(f.calls,[url(music)]);assert.equal(f.requests[0].request.headers.has('range'),false);
 assert.equal(f.requests[0].request.redirect,'error');
 const stored=await(await f.context.caches.open(f.context.qa.CACHE_NAME)).match(url(music));
 assert.equal(stored.status,200);assert.equal(stored.headers.has('Content-Range'),false);
 assert.deepEqual(Buffer.from(await stored.arrayBuffer()),musicBytes);
 assert.equal((await f.request(music)).status,200);assert.equal(f.calls.length,1);
});

test('offline music misses and unexpected partial network responses never create a false complete cache entry',async()=>{
 for(const options of [{fail:()=>true},{networkResponse:()=>new Response(musicBytes.subarray(0,2),{status:206,headers:{'Content-Range':'bytes 0-1/128832'}})},
  {networkResponse:()=>new Response('missing',{status:404})}]){
  const f=fixture(options),result=await f.request(music,{headers:new Headers({Range:'bytes=0-1'})});
  assert.equal(result.type,'error');assert.equal(f.stores.get(f.context.qa.CACHE_NAME)?.has(url(music))||false,false);
 }
 const f=fixture(),cache=await f.context.caches.open(f.context.qa.CACHE_NAME);
 await cache.put(url(music),new Response(musicBytes.subarray(0,2),{status:206,headers:{'Content-Range':'bytes 0-1/128832'}}));
 const recovered=await f.request(music);assert.equal(recovered.status,200);assert.deepEqual(Buffer.from(await recovered.arrayBuffer()),musicBytes);
 assert.equal((await cache.match(url(music))).status,200);assert.equal(f.calls.length,1);
});

test('music responses are stream-bounded before buffering and are never cached beyond 200 KiB',async()=>{
 const maximum=200*1024;
 for(const declared of [String(maximum+1),null]){
  let pulls=0,cancelled=false;
  const f=fixture({networkResponse:()=>new Response(new ReadableStream({
   pull(controller){pulls++;controller.enqueue(new Uint8Array(65536));},cancel(){cancelled=true;}
  },{highWaterMark:0}),{headers:declared?{'Content-Length':declared}:{}})});
  assert.equal((await f.request(music)).type,'error');assert.equal(cancelled,true);
  assert(pulls<=4,'stop reading once the next chunk crosses the limit');
  if(declared)assert.equal(pulls,0,'reject oversized advertised content before reading');
  assert.equal(f.stores.get(f.context.qa.CACHE_NAME)?.has(url(music))||false,false);
 }
});

test('music HTTP 200 hosting fallbacks and truncated downloads cannot become permanent offline hits',async()=>{
 for(const broken of [()=>new Response('<html>Hosting fallback</html>',{headers:{'Content-Type':'text/html'}}),
  ()=>new Response(musicBytes.subarray(0,854),{headers:{'Content-Type':'audio/mpeg'}})]){
  let available=false;
  const f=fixture({networkResponse:()=>available?new Response(musicBytes):broken()});
  assert.equal((await f.request(music)).type,'error');assert.equal(f.stores.get(f.context.qa.CACHE_NAME)?.has(url(music))||false,false);
  available=true;
  const recovered=await f.request(music,{headers:new Headers({Range:'bytes=0-1'})});assert.equal(recovered.status,206);
  assert.deepEqual(Buffer.from(await recovered.arrayBuffer()),musicBytes.subarray(0,2));assert.equal(f.calls.length,2);
  assert.equal((await f.request(music)).status,200);assert.equal(f.calls.length,2,'only validated recovered bytes stay cache-first');
 }
});

test('music validates its fixed digest for same-length HTTP bodies and existing poisoned cache entries',async()=>{
 const poisoned=Buffer.from(musicBytes);poisoned[512]^=255;
 const cold=fixture({networkResponse:()=>new Response(poisoned,{headers:{'Content-Type':'audio/mpeg'}})});
 assert.equal((await cold.request(music)).type,'error');assert.equal(cold.stores.get(cold.context.qa.CACHE_NAME)?.has(url(music))||false,false);
 for(const offline of [false,true]){
  const f=fixture({fail:()=>offline}),cache=await f.context.caches.open(f.context.qa.CACHE_NAME);
  await cache.put(url(music),new Response(poisoned,{headers:{'Content-Type':'audio/mpeg'}}));
  const result=await f.request(music);assert.equal(f.calls.length,1);
  if(offline){assert.equal(result.type,'error');assert.equal(f.stores.get(f.context.qa.CACHE_NAME).has(url(music)),false);}
  else{assert.equal(result.status,200);assert.deepEqual(Buffer.from(await result.arrayBuffer()),musicBytes);
   assert.deepEqual(Buffer.from(await(await cache.match(url(music))).arrayBuffer()),musicBytes);}
 }
});

test('music cache handling does not widen to authenticated, no-store, navigation, callback or different URLs',async()=>{
 const f=fixture(),cache=await f.context.caches.open(f.context.qa.CACHE_NAME);
 await cache.put(url(music),new Response(musicBytes));
 const cases=[[music,{headers:new Headers({Authorization:'Bearer fixture'})}],[music,{headers:new Headers({apikey:'fixture'})}],
  [music,{cache:'no-store'}],[music,{mode:'navigate'}],[music+'?token_hash=fixture',{}],[music+'?v=other',{}],
  ['https://other.test/app/assets/gallery/wow-ambient-v1.mp3',{}]];
 for(const [asset,options] of cases)await f.request(asset,options);
 assert.deepEqual(f.calls,cases.map(([asset])=>url(asset)));
 for(const control of ['private','no-store']){
  const isolated=fixture({networkResponse:()=>new Response(musicBytes,{headers:{'Cache-Control':control}})});
  assert.equal((await isolated.request(music)).status,200);assert.equal(isolated.stores.get(isolated.context.qa.CACHE_NAME)?.has(url(music))||false,false);
 }
});
