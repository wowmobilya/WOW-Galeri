/* Native, muted media verification. Every request is served from this routed fixture;
   no production app, Supabase account, external recording or real speaker is used. */
const {chromium}=require('playwright');
const {readFile}=require('node:fs/promises');
const path=require('node:path'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'..'),origin='https://gallery-music-fixture.invalid';
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
const html=`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>:root{--brand-primary:#23556d;--ui-accent:#23556d;--text:#122d39;--text2:#54666c;--card:#fff;--border:#cad8dc;--on-primary:#fff;--bg:#f0f5f6}*{box-sizing:border-box}body{margin:12px;font:16px Arial,sans-serif;background:var(--bg)}.page:not(.active){display:none}</style>
<link rel="stylesheet" href="modules/gallery/styles.css?v=2"></head><body><section id="route" class="page active"><main class="wfg-workspace"></main></section>
<script>
window.locale=new URL(location.href).searchParams.get('lang')||'en';
document.documentElement.lang=locale;document.documentElement.dir=locale==='ar'?'rtl':'ltr';
window.session={authenticated:true,mode:'remote',workspaceId:'fixture-workspace',userId:'fixture-buyer',sessionVersion:1,authGeneration:1,
 currentAccount:{id:'fixture-buyer',role:'customer',status:'active',permissions:['gallery.view']}};
window.WFCloud={getConfig:()=>({endpoint:'https://music-backend-fixture.invalid/functions/v1/wow-cloud'})};
window.speech={active:false};window.WFProgramSpeech={getState:()=>window.speech};
window.setSpeech=active=>{window.speech={active};dispatchEvent(new CustomEvent('wf-program-speech-state',{detail:window.speech}));};
</script><script src="modules/gallery/music.js?v=1"></script><script>
window.music=WFGalleryMusic.mount({container:document.querySelector('main'),api:{getSession:()=>window.session,can:()=>true},lang:locale});
document.querySelector('audio').muted=true;
</script></body></html>`;

(async()=>{
  const asset=await readFile(path.join(base,'assets/gallery/wow-ambient-v1.mp3'));
  assert.ok(asset.length>0&&asset.length<=200000,'The original bundled loop must stay small.');
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try{
    for(const [width,language] of [[390,'ar'],[1280,'en']]){
      const page=await browser.newPage({viewport:{width,height:860}}),errors=[];
      page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
      let mediaRequests=0,hold=false,held=deferred(),release=deferred();
      await page.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.origin!==origin)return route.abort();
        if(url.pathname==='/subdir/')return route.fulfill({contentType:'text/html; charset=utf-8',body:html});
        if(url.pathname==='/subdir/modules/gallery/music.js')return route.fulfill({contentType:'text/javascript; charset=utf-8',body:await readFile(path.join(base,'modules/gallery/music.js'))});
        if(url.pathname==='/subdir/modules/gallery/styles.css')return route.fulfill({contentType:'text/css; charset=utf-8',body:await readFile(path.join(base,'modules/gallery/styles.css'))});
        if(url.pathname==='/subdir/assets/gallery/wow-ambient-v1.mp3'){
          mediaRequests++;if(hold){held.resolve();await release.promise;}
          try{await route.fulfill({contentType:'audio/mpeg',headers:{'Cache-Control':'no-store'},body:asset});}
          catch(error){if(!route.request().failure())throw error;}
          return;
        }
        return route.abort();
      });
      await page.goto(origin+'/subdir/?lang='+language);
      const toggle=page.locator('.wfg-music button'),audio=page.locator('audio');
      assert.equal(mediaRequests,0,'The native media element must not request the track on mount.');
      assert.equal(await audio.getAttribute('src'),null);assert.equal(await toggle.getAttribute('aria-pressed'),'false');
      await toggle.evaluate(button=>button.click());
      assert.equal(mediaRequests,0,'A script-generated click must not start audio.');
      await toggle.click();
      await page.waitForFunction(()=>{const audio=document.querySelector('audio');return !audio.paused&&audio.currentTime>.1;});
      assert.equal(await toggle.getAttribute('aria-pressed'),'true');
      const metadata=await audio.evaluate(node=>({duration:node.duration,loop:node.loop,muted:node.muted}));
      assert.ok(metadata.duration>15&&metadata.duration<17);assert.equal(metadata.loop,true);assert.equal(metadata.muted,true);
      await page.getByRole('slider').press('End');assert.equal(await audio.evaluate(node=>node.volume),1);
      await audio.evaluate(node=>{node.currentTime=node.duration-.12;});
      await page.waitForFunction(()=>{const audio=document.querySelector('audio');return !audio.paused&&audio.currentTime<1;});
      await page.evaluate(()=>setSpeech(true));assert.equal(await audio.evaluate(node=>node.paused),true);assert.equal(await toggle.isDisabled(),true);
      await page.evaluate(()=>setSpeech(false));assert.equal(await audio.evaluate(node=>node.paused),true);assert.equal(await toggle.isDisabled(),false);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);

      // A new visit retains the preference, never the playing state.
      await page.reload();assert.equal(await audio.getAttribute('src'),null);assert.equal(await audio.evaluate(node=>node.paused),true);
      assert.equal(await audio.evaluate(node=>node.volume),1);assert.equal(await toggle.getAttribute('aria-pressed'),'false');

      // Real network-pending play, not a mocked promise: a retained dirty route becomes hidden.
      hold=true;held=deferred();release=deferred();await toggle.click();
      await held.promise;
      await page.evaluate(()=>document.getElementById('route').classList.remove('active'));
      await page.waitForFunction(()=>document.querySelector('audio').paused);
      release.resolve();await page.waitForFunction(()=>document.querySelector('.wfg-music button').getAttribute('aria-busy')==='false');
      await page.evaluate(()=>document.getElementById('route').classList.add('active'));
      await page.waitForFunction(()=>!document.querySelector('.wfg-music button').disabled);
      assert.equal(await audio.evaluate(node=>node.paused),true);assert.equal(await audio.getAttribute('src'),null);
      assert.equal(await toggle.getAttribute('aria-pressed'),'false');
      await page.evaluate(()=>music.dispose());assert.equal(await page.locator('audio').count(),0);
      assert.deepEqual(errors,[]);await page.close();
    }
    console.log('Gallery music: native muted MP3 decode/play/loop, trusted gesture, saved preference without autoplay, speech interruption, pending hidden-route cancellation, and Arabic mobile/English desktop layout passed.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
