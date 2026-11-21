const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const acorn=require('acorn'),walk=require('acorn-walk');
const root=path.resolve(__dirname,'..');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
let referenceShellAssets;
function referenceShell(){
  if(referenceShellAssets)return referenceShellAssets;
  const origin='https://example.test/',html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const scripts=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(match=>new URL(match[1],origin));
  const entries=new Map();
  for(const file of ['reference-voice-assets.js','reference-voice.js']){
    const found=scripts.filter(url=>url.pathname==='/'+file);assert.equal(found.length,1,file+' must be loaded exactly once by the application');
    assert.match(found[0].search,/^\?v=\d+$/,file+' must have an explicit current version');entries.set(file,found[0].href);
  }
  const required=new Set(entries.values()),queue=[...required];
  while(queue.length){
    const current=queue.shift(),code=fs.readFileSync(path.join(root,new URL(current).pathname.slice(1)),'utf8');
    const add=value=>{
      if(typeof value!=='string'||!/^\.?\/?reference-voice(?:-assets|-host|-engine)?\.js\?v=\d+$/.test(value))return;
      const url=new URL(value,current),file=url.pathname.slice(1);
      if(entries.has(file))assert.equal(url.href,entries.get(file),'cold worker imports must use the same current '+file+' as HTML');
      if(!required.has(url.href)){required.add(url.href);queue.push(url.href);}
    };
    walk.simple(acorn.parse(code,{ecmaVersion:'latest',sourceType:'module'}),{
      ImportDeclaration(node){add(node.source.value);},
      ImportExpression(node){if(node.source.type==='Literal')add(node.source.value);},
      NewExpression(node){if(node.callee.type==='Identifier'&&node.callee.name==='URL'&&node.arguments[0]?.type==='Literal')add(node.arguments[0].value);}
    });
  }
  for(const file of ['reference-voice-host.js','reference-voice-engine.js'])assert([...required].some(url=>new URL(url).pathname==='/'+file),'cold worker dependency graph must reach '+file);
  referenceShellAssets={required,host:[...required].find(url=>new URL(url).pathname==='/reference-voice-host.js')};return referenceShellAssets;
}

test('every installed local reference asset matches its published bytes and hash',()=>{
  const context={};vm.runInNewContext(fs.readFileSync(path.join(root,'reference-voice-assets.js'),'utf8'),context);
  const manifest=context.WFReferenceVoiceAssets;
  assert.equal(manifest.assets.reduce((sum,a)=>sum+a.bytes,0),manifest.bytes);
  assert.equal(new Set(manifest.assets.map(a=>a.url)).size,manifest.assets.length);
  for(const asset of manifest.assets){
    assert.match(asset.sha256,/^[0-9a-f]{64}$/);assert(asset.bytes>0);
    if(asset.url.startsWith('./')){
      const bytes=fs.readFileSync(path.join(root,asset.url.split('?')[0]));
      assert.equal(bytes.length,asset.bytes,asset.url+' size');assert.equal(sha(bytes),asset.sha256,asset.url+' SHA256');
    }else assert(asset.url.startsWith('https://huggingface.co/Zyphra/ZONOS3-Mini/resolve/'+manifest.modelRevision+'/web/'));
  }
  const model=path.join(root,manifest.engineBase,'model');
  const heads=JSON.parse(fs.readFileSync(path.join(model,'laci/index.json'),'utf8'));
  for(const language of ['ar','tr','en_us','fr_fr','ru'])assert(fs.existsSync(path.join(model,'laci',heads[language])));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(model,'voices/voices.json'),'utf8')),[]);
});

function serviceWorker({offline=false}={}){
  const handlers={},network=[],cached=[],entries=new Map(),shellEntries=new Map();
  // WorkerLocation includes the worker script URL; relative imports and shell
  // entries resolve against that URL, not against an origin-only placeholder.
  const workerURL=new URL('https://example.test/sw.js');
  const location=Object.freeze(Object.fromEntries(['href','origin','protocol','host','hostname','port','pathname','search','hash'].map(key=>[key,workerURL[key]])));
  const cacheKey=request=>new URL(request.url||String(request),location.href).href;
  const makeCache=items=>({
    match:async request=>items.get(cacheKey(request))?.clone(),
    add:async request=>{cached.push(request.url);items.set(cacheKey(request),new Response('cached shell asset'));},
    put:async(request,response)=>{items.set(cacheKey(request),response.clone());},
    delete:async request=>items.delete(cacheKey(request))
  });
  const cache=makeCache(entries),shell=makeCache(shellEntries);
  const self={location,addEventListener:(name,handler)=>handlers[name]=handler,skipWaiting(){},clients:{claim:async()=>{}}};
  class LocalRequest extends Request{constructor(input,options){super(new URL(input,location.href),options);}}
  vm.runInNewContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),{
    self,URL,Request:LocalRequest,Response,Headers,Uint8Array,crypto:crypto.webcrypto,Promise,importScripts(){},
    caches:{open:async name=>name==='infinity-offline-voice-v1'?cache:shell,match:async request=>(await cache.match(request))||(await shell.match(request)),keys:async()=>[],delete:async()=>true},
    fetch:async request=>{
      network.push(request.url);if(offline)throw new Error('offline');
      if(request.url==='https://example.test/assets/gallery/wow-ambient-v1.mp3'){
        const bytes=fs.readFileSync(path.join(root,'assets/gallery/wow-ambient-v1.mp3'));
        return new Response(bytes,{headers:{'Content-Type':'audio/mpeg','Content-Length':String(bytes.length)}});
      }
      return new Response('network bytes');
    }
  });
  return {handlers,network,cached,entries,shellEntries,async get(url,options){let result;handlers.fetch({request:new Request(url,options),respondWith(promise){result=promise;}});return result;}};
}

test('reference worker imports use the installed cache and cannot trigger a model/runtime download',async()=>{
  const f=serviceWorker(),url='https://example.test/vendor/zonos3/a50e141/engine.js';
  f.entries.set(url,new Response('verified runtime'));
  assert.equal(await(await f.get(url)).text(),'verified runtime');assert.equal(f.network.length,0);
  const missing=await f.get('https://example.test/vendor/zonos3/a50e141/worker.js');
  assert.equal(missing.type,'error');assert.equal(f.network.length,0);
  assert.equal(await(await f.get(url,{cache:'no-store'})).text(),'network bytes');
  assert.deepEqual(f.network,[url],'only the explicit installer request uses the network');
});

test('the application shell installs reference metadata needed by cold offline worker imports',async()=>{
  const f=serviceWorker();let installed;
  f.handlers.install({waitUntil(promise){installed=promise;}});await installed;
  for(const url of referenceShell().required)assert.equal(f.cached.filter(cached=>cached===url).length,1,'offline shell must install the exact cold-worker dependency '+url);
  // Retained compatibility URLs for previously installed workers, independent
  // of the current HTML/worker versions verified above.
  assert(f.cached.includes('https://example.test/reference-voice.js?v=1'));
  assert(f.cached.includes('https://example.test/reference-voice.js?v=2'));
  assert(!f.cached.some(url=>/shard-\d+\.bin/.test(url)),'opening the program must not download large voice shards');
  const musicURL='https://example.test/assets/gallery/wow-ambient-v1.mp3';
  assert.equal(f.network.filter(url=>url===musicURL).length,1,'the bounded bundled track uses its verified full fetch');
  assert.equal(sha(Buffer.from(await f.shellEntries.get(musicURL).clone().arrayBuffer())),
    sha(fs.readFileSync(path.join(root,'assets/gallery/wow-ambient-v1.mp3'))));
});

test('an offline app update uses the new speech host without reinstalling the model pack',async()=>{
  const f=serviceWorker({offline:true}),currentHost=referenceShell().host;
  f.entries.set('https://example.test/reference-voice-host.js?v=1',new Response('old buffered host'));
  f.shellEntries.set(currentHost,new Response('current streaming host'));
  const response=await f.get(currentHost);
  assert.equal(await response.text(),'current streaming host');
  assert(!f.network.some(url=>url.includes('/model/')));
});

test('offline speech imports prefer updated app code over an older copy in the installed voice cache',async()=>{
  const f=serviceWorker({offline:true}),url='https://example.test/reference-voice.js?v=1';
  f.entries.set(url,new Response('old buffered coordinator'));
  f.shellEntries.set(url,new Response('current streaming coordinator'));
  assert.equal(await(await f.get(url)).text(),'current streaming coordinator');
});

test('installed Mark weights remain ready when application speech adapters are updated separately',async()=>{
  const {createManager,VERSION}=require('../offline-voice.js');
  const context={};vm.runInNewContext(fs.readFileSync(path.join(root,'reference-voice-assets.js'),'utf8'),context);
  const manifest=context.WFReferenceVoiceAssets,origin='https://example.test';
  const assets=manifest.assets.map(item=>({...item,url:new URL(item.url,origin+'/').href}));
  let network=0;
  const cache={async match(url){
    if(url===origin+'/__infinity_voice__/mark-zonos3-reference-v1.json')return new Response(JSON.stringify({version:VERSION,model:'f814bd3f85cf039b99492f1fce92580adee9b879649bb18ee6d9c52411cd6362'}));
    const asset=assets.find(item=>item.url===url&&!/\/reference-voice(?:-host)?\.js/.test(item.url));
    return asset?new Response('',{headers:{'X-WF-SHA256':asset.sha256,'Content-Length':String(asset.bytes)}}):undefined;
  }};
  const manager=createManager({caches:{open:async()=>cache},fetch:async()=>{network++;throw new Error('no download');},origin,
    voices:[{locale:'ref',id:manifest.id,files:assets,runtime:[],bytes:manifest.bytes,sharedBytes:0}],shared:[]});
  assert.equal((await manager.refresh('ref')).ready,true);
  assert.equal(network,0);
});
