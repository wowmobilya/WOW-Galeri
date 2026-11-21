'use strict';
/* Exercise the actual root service worker and original MP3. This loopback server
   serves only the worker's explicit public-shell allowlist and a synthetic page.
   It implements no range handling; every 206 must come from the real worker. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const {createHash}=require('node:crypto');
const acorn=require('acorn');
const {chromium}=require('playwright');
const base=path.resolve(__dirname,'..'),track='/assets/gallery/wow-ambient-v1.mp3';
const html=`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="data:,"><link rel="stylesheet" href="/modules/gallery/styles.css?v=2">
<style>:root{--brand-primary:#23556d;--text:#122d39;--text2:#54666c;--card:#fff;--border:#cad8dc}body{font:16px sans-serif;margin:20px}.page:not(.active){display:none}</style>
</head><body><section class="page active"><main class="wfg-workspace"></main></section>
<script>
window.WFCloud={getConfig:()=>({endpoint:location.origin+'/fixture-endpoint'})};
window.fixtureSession={authenticated:true,mode:'remote',workspaceId:'synthetic-workspace',userId:'synthetic-customer',sessionVersion:1,authGeneration:1,
 currentAccount:{id:'synthetic-customer',role:'customer',status:'active',permissions:['gallery.view']}};
window.WFProgramSpeech={getState:()=>({active:false})};
</script><script src="/modules/gallery/music.js?v=1"></script><script>
window.music=WFGalleryMusic.mount({container:document.querySelector('main'),api:{getSession:()=>fixtureSession,can:()=>true},lang:'en'});
document.querySelector('audio').muted=true;
</script></body></html>`;
const mime={'.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json',
  '.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp3':'audio/mpeg',
  '.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2'};

async function fixtureFiles(){
  const worker=await fs.readFile(path.join(base,'sw.js'),'utf8');
  const ast=acorn.parse(worker,{ecmaVersion:'latest',sourceType:'script'});
  const declaration=name=>ast.body.filter(node=>node.type==='VariableDeclaration').flatMap(node=>node.declarations).find(node=>node.id?.name===name)?.init;
  const manifest=declaration('urlsToCache'),cache=declaration('CACHE_NAME');
  assert.equal(manifest?.type,'ArrayExpression','The fixture only accepts an explicit literal public shell manifest.');
  assert.equal(cache?.type,'Literal');assert.equal(typeof cache.value,'string');
  const files=new Map([['/',{body:Buffer.from(html),type:'text/html'}],['/index.html',{body:Buffer.from(html),type:'text/html'}],
    ['/sw.js',{body:Buffer.from(worker),type:'application/javascript'}]]);
  const names=new Set();
  for(const item of manifest.elements){
    assert.equal(item?.type,'Literal');assert.equal(typeof item.value,'string');
    // The actual installer excludes external manifest references. The fixture never serves or visits them.
    if(!item.value.startsWith('./')){assert.match(item.value,/^https:\/\//);continue;}
    if(item.value==='./'||item.value==='./index.html')continue;
    const url=new URL(item.value,'http://fixture.invalid/'),relative=url.pathname.slice(1);
    assert.match(item.value,/^\.\/[A-Za-z0-9_./-]+(?:\?v=[A-Za-z0-9_.-]+)?$/);
    assert.equal(relative.split('/').some(piece=>piece==='..'||piece.startsWith('.')),false);
    assert.ok(!relative.includes('/')||['modules','assets','vendor'].includes(relative.split('/')[0]),'Only public shell directories may be read: '+relative);
    assert.ok(mime[path.extname(relative)],'Unsupported public asset type: '+relative);
    names.add(relative);
    files.set(url.pathname+url.search,{relative,type:mime[path.extname(relative)]});
  }
  // All worker imports must already belong to the explicit shell list; no wildcard file server exists.
  for(const name of ['install-identity.js','modules/platform/push/wow-push-sw.js','modules/platform/push/wow-push-device.js'])assert.ok(names.has(name),'Missing allowed worker import '+name);
  await Promise.all([...files.values()].filter(file=>file.relative).map(async file=>{file.body=await fs.readFile(path.join(base,file.relative));}));
  assert.ok(files.has(track));assert.ok(files.has('/modules/gallery/music.js?v=1'));assert.ok(files.has('/modules/gallery/styles.css?v=2'));
  const audio=files.get(track).body;assert.ok(audio.length>0&&audio.length<=200000);
  return {files,audio,cacheName:cache.value,digest:createHash('sha256').update(audio).digest('hex')};
}

async function main(){
  const fixture=await fixtureFiles();
  if(process.argv.includes('--check-fixture')){
    console.log('Offline music fixture static validation: actual worker, '+fixture.files.size+' exact public shell URLs, synthetic HTML, '+fixture.audio.length+'-byte original MP3.');
    return;
  }
  let origin='',trackRequests=0;const rejected=[],serverErrors=[];
  const server=http.createServer((request,response)=>{
    try{
      const url=new URL(request.url,origin);
      const allowed=url.origin===origin&&['GET','HEAD'].includes(request.method)&&fixture.files.get(url.pathname+url.search);
      if(!allowed){rejected.push(request.url);response.writeHead(404).end();return;}
      if(url.pathname===track)trackRequests++;
      const worker=url.pathname==='/sw.js';
      response.writeHead(200,{
        'Content-Type':/^(?:text\/|application\/(?:javascript|json)$|image\/svg\+xml$)/.test(allowed.type)?allowed.type+'; charset=utf-8':allowed.type,
        'Content-Length':allowed.body.length,'X-Content-Type-Options':'nosniff',
        // Public cache policy is intentional. CDP disables/clears the HTTP cache so CacheStorage is the only warm source.
        'Cache-Control':worker||allowed.type==='text/html'?'no-cache':'public, max-age=31536000, immutable',
        'Content-Security-Policy':"default-src 'none'; script-src 'self'"+(worker?'':" 'unsafe-inline'")+"; worker-src 'self'; connect-src 'self'; media-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'"
      });
      response.end(request.method==='HEAD'?undefined:allowed.body);
    }catch(error){serverErrors.push(error.message);if(!response.headersSent)response.writeHead(500);response.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  origin='http://127.0.0.1:'+server.address().port;
  let browser;
  const watchdog=setTimeout(()=>{console.error('Offline music fixture exceeded its 90-second limit.');process.exit(1);},90000);watchdog.unref();
  try{
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox'],timeout:20000});
    const context=await browser.newContext({viewport:{width:390,height:820}}),external=[],errors=[];
    context.on('request',request=>{const url=new URL(request.url());if(['http:','https:'].includes(url.protocol)&&url.origin!==origin)external.push(request.url());});
    const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
    const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
    await page.goto(origin+'/',{waitUntil:'load'});
    assert.equal(trackRequests,0,'Mounting the synthetic controller must not load its audio.');
    await page.evaluate(()=>{
      window.installState='installing';
      navigator.serviceWorker.register('/sw.js',{scope:'/'}).then(()=>navigator.serviceWorker.ready)
        .then(()=>{window.installState='ready';}).catch(error=>{window.installState=String(error);});
    });
    await page.waitForFunction(()=>window.installState!=='installing');assert.equal(await page.evaluate(()=>installState),'ready');
    await page.waitForFunction(()=>navigator.serviceWorker.controller?.scriptURL===location.origin+'/sw.js');
    const cached=await page.evaluate(async({cacheName,track})=>{
      const cache=await caches.open(cacheName),response=await cache.match(track);if(!response)return null;
      const bytes=await response.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
      return {status:response.status,length:bytes.byteLength,digest:Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')};
    },{cacheName:fixture.cacheName,track});
    assert.deepEqual(cached,{status:200,length:fixture.audio.length,digest:fixture.digest});
    assert.equal(trackRequests,1,'The real precache must fetch exactly one complete track.');
    await cdp.send('Network.clearBrowserCache');
    const installedRequests=trackRequests;
    const requestRange=async()=>{
      const observed=page.waitForResponse(response=>new URL(response.url()).pathname===track);
      const result=await page.evaluate(async track=>{
        // reload excludes a stale HTTP-cache fallback; the service-worker CacheStorage policy still applies.
        const response=await fetch(track,{cache:'reload',headers:{Range:'bytes=0-1'}});
        return {status:response.status,range:response.headers.get('content-range'),length:response.headers.get('content-length'),
          accept:response.headers.get('accept-ranges'),type:response.headers.get('content-type'),bytes:Array.from(new Uint8Array(await response.arrayBuffer()))};
      },track);
      assert.equal((await observed).fromServiceWorker(),true);
      assert.deepEqual(result,{status:206,range:'bytes 0-1/'+fixture.audio.length,length:'2',accept:'bytes',type:'audio/mpeg',bytes:[...fixture.audio.subarray(0,2)]});
    };
    await requestRange();assert.equal(trackRequests,installedRequests,'An online warm range must not fetch the server track.');
    await context.setOffline(true);await requestRange();
    const mediaResponse=page.waitForResponse(response=>new URL(response.url()).pathname===track);
    await page.getByRole('button',{name:'Play music',exact:true}).click();
    assert.equal((await mediaResponse).fromServiceWorker(),true);
    await page.waitForFunction(()=>{const audio=document.querySelector('audio');return !audio.paused&&audio.currentTime>.15;});
    const playing=await page.locator('audio').evaluate(audio=>({muted:audio.muted,loop:audio.loop,duration:audio.duration,source:audio.currentSrc}));
    assert.equal(playing.muted,true);assert.equal(playing.loop,true);assert.ok(playing.duration>15&&playing.duration<17);assert.equal(playing.source,origin+track);
    assert.equal(await page.getByRole('button',{name:'Pause music',exact:true}).getAttribute('aria-pressed'),'true');
    assert.equal(trackRequests,installedRequests,'Offline native playback must add no server track request.');
    await page.evaluate(()=>music.dispose());assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(rejected,[]);assert.deepEqual(serverErrors,[]);
    console.log('PASS: actual root sw.js precached the exact original MP3; online/offline byte ranges returned cached 206 headers and exact bytes; trusted muted native playback advanced offline without another server track request. No speaker/provider claim.');
  }finally{
    try{await browser?.close();}
    finally{
      try{
        await new Promise((resolve,reject)=>{
          try{server.close(error=>error?reject(error):resolve());}
          finally{server.closeAllConnections?.();}
        });
      }finally{clearTimeout(watchdog);}
    }
  }
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
