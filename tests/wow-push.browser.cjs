'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright');
const htmlType='text/html; charset=utf-8',scriptType='application/javascript; charset=utf-8';
const fixtureHTML='<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/modules/platform/push/wow-push-settings.css"></head><body><main id="page-notifications"><div class="wf-notifications-body"><section class="wf-notifications-empty"></section></div></main><section id="stab-cloud"></section><script src="/modules/platform/push/wow-push-device.js"></script><script src="/modules/platform/push/wow-push-client.js"></script><script src="/modules/platform/push/wow-push-settings.js"></script></body></html>';
const enableLabels={ar:'تفعيل إشعارات هذا الجهاز',tr:'Bu cihazda etkinleştir',fr:'Activer sur cet appareil',ru:'Включить на этом устройстве',en:'Enable on this device'};
async function bounded(promise,ms,label){
  let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timed out')),ms);})]);}
  finally{clearTimeout(timer);}
}
async function waitForControls(page,lang){
  await page.waitForFunction(()=>window.WFPush?.getSnapshot().canEnable,{},{timeout:10000});
  for(const host of ['#page-notifications','#stab-cloud']){
    const button=page.locator(host).getByRole('button',{name:enableLabels[lang],exact:true});
    await button.waitFor({state:'visible',timeout:10000});
    assert.equal(await button.count(),1,host+' must have one exact localized enable control');
    assert.equal(await button.isEnabled(),true,host+' enable control must be usable');
  }
  assert.equal(await page.getByText(enableLabels[lang],{exact:true}).count(),2,'both mounted controls must retain the exact '+lang+' text');
}

// Exercise real Chromium workers, notifications and IndexedDB locally. DevTools supplies the provider event.
// No VAPID key, hosted workspace, owner session or physical device is used by this test.
async function main() {
  const dir = path.join(__dirname, '..'), files = new Set(['modules/platform/push/wow-push-sw.js','modules/platform/push/wow-push-device.js','modules/platform/push/wow-push-client.js','modules/platform/push/wow-push-settings.js','modules/platform/push/wow-push-settings.css','app-icon-192.png']);
  if(process.argv.includes('--check-fixture')){
    assert.match(fixtureHTML,/<meta charset="utf-8">/);assert.match(htmlType,/charset=utf-8/);assert.match(scriptType,/charset=utf-8/);
    const settings=await fs.readFile(path.join(dir,'modules/platform/push/wow-push-settings.js'),'utf8');
    for(const label of Object.values(enableLabels))assert(settings.includes(label),'current product copy must match '+label);
    for(const file of files)await fs.access(path.join(dir,file));
    console.log('PASS: synthetic UTF-8 document/script contract, exact five-locale control text and public fixture assets. Native Chromium execution remains required.');return;
  }
  const serverErrors=[],pageErrors=[],failedRequests=[];let phase='starting loopback server',context;
  const server = http.createServer(async (req, res) => {
    try{
    const name = new URL(req.url, 'http://localhost').pathname.slice(1);
    if (!name) { res.setHeader('content-type',htmlType); res.end(fixtureHTML); return; }
    if (name === 'sw.js') { res.setHeader('content-type',scriptType); res.end("importScripts('./modules/platform/push/wow-push-sw.js?v=2'); self.addEventListener('activate', e => e.waitUntil(clients.claim()));"); return; }
    if (!files.has(name)) { res.writeHead(404).end(); return; }
    res.setHeader('content-type', name.endsWith('.js') ? scriptType : name.endsWith('.css') ? 'text/css; charset=utf-8' : 'image/png');
    res.end(await fs.readFile(path.join(dir, name)));
    }catch(error){serverErrors.push(error.message);if(!res.headersSent)res.writeHead(500);res.end();}
  });
  await new Promise((resolve,reject) => {server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin = 'http://127.0.0.1:' + server.address().port, publicKey = Buffer.from([4,...Array(64).fill(2)]).toString('base64url');
  let browser;
  const watchdog=setTimeout(()=>{console.error('Push browser fixture exceeded 90 seconds during '+phase);process.exit(1);},90000);watchdog.unref();
  try {
    phase='launching Chromium';
    browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox'],timeout:20000});
    context = await browser.newContext({viewport:{width:390,height:820},permissions:['notifications']});
    context.setDefaultTimeout(10000);context.setDefaultNavigationTimeout(15000);
    context.on('page',page=>page.on('pageerror',error=>{if(pageErrors.length<20)pageErrors.push(error.message);}));
    context.on('requestfailed',request=>{if(failedRequests.length<20)failedRequests.push({url:request.url(),error:request.failure()?.errorText});});
    await context.addInitScript(({publicKey}) => {
      window.WFCloud = {ready:Promise.resolve(), getSnapshot:() => ({authenticated:true,role:'owner',workspaceId:'workspace',userId:'owner',sessionVersion:1,mode:'remote',
        currentAccount:{role:'owner',id:'owner',status:'active',sessionVersion:1,permissions:[]}}),subscribe(){},
        async request(action) { (window.pushRequests ||= []).push(action); return {ok:true,publicKey}; }};
      window.WFCloudSettings = {open(){}};
    }, {publicKey});
    const page = await context.newPage();
    const control = await context.newPage(), cdp = await context.newCDPSession(control), observing = await context.newCDPSession(page);
    const registered = new Promise(resolve => observing.on('ServiceWorker.workerRegistrationUpdated', ({registrations}) => {
      const item = registrations.find(x => x.scopeURL === origin + '/' && !x.isDeleted); if (item) resolve(item.registrationId);
    }));
    await Promise.all([observing.send('ServiceWorker.enable'),cdp.send('ServiceWorker.enable')]);
    phase='loading UTF-8 page and registering its native worker';
    await page.goto(origin);assert.equal(await page.evaluate(()=>document.characterSet),'UTF-8');
    await bounded(page.evaluate(() => navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready)),15000,'native worker registration');
    phase='waiting for both visible Arabic enable controls';
    await waitForControls(page,'ar');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    for (const lang of ['tr','fr','ru','en','ar']) {
      phase='checking both controls in '+lang;
      await page.evaluate(value => { document.documentElement.lang = value; }, lang);await waitForControls(page,lang);
    }
    const binding = {workspaceId:'workspace',userId:'owner',deviceId:'desktop',bindingId:'451f2d36-b2e1-49e3-aa11-92278c1b60a2',financial:true,sessionVersion:1,mode:'remote',language:'ar',active:true};
    await page.evaluate(b => WFPushDevice.create(indexedDB).replace(null,b), binding);
    const registrationId = await bounded(registered,10000,'DevTools worker registration event');
    await page.close();
    assert.equal(context.pages().some(p => p.url().startsWith(origin)), false);
    phase='delivering a native notification after all app windows close';
    await bounded(cdp.send('ServiceWorker.stopAllWorkers'),10000,'stopping workers');
    const details = {...binding,validUntil:new Date(Date.now()+60000).toISOString(),kind:'payment',eventId:'payment-1-created',title:'دفعة فاتورة',body:'الفاتورة 5001\nالمبلغ ١٢٠ دولارًا',timestamp:Date.now()};
    await bounded(cdp.send('ServiceWorker.deliverPushMessage',{origin,registrationId,data:JSON.stringify(details)}),10000,'DevTools push delivery');
    // The worker's own transaction and system notification finish before any owner app window is created again.
    const deadline = Date.now() + 10000;
    let outstanding = [];
    while (Date.now() < deadline) {
      const worker = context.serviceWorkers().find(w => w.url() === origin + '/sw.js');
      if (worker) try { outstanding = await bounded(worker.evaluate(async () => (await registration.getNotifications()).map(n => ({title:n.title,body:n.body,tag:n.tag}))),2000,'native notification inspection'); } catch (_) {}
      if (outstanding.length) break;
      await new Promise(resolve => setTimeout(resolve,50));
    }
    assert.equal(outstanding.length,1,'native notification must be posted while the app is closed'); assert.equal(outstanding[0].body, details.body);
    phase='checking the reopened Arabic device inbox';
    const reopened = await context.newPage(); await reopened.goto(origin);assert.equal(await reopened.evaluate(()=>document.characterSet),'UTF-8');
    await reopened.getByText(details.body,{exact:true}).waitFor();
    assert.equal(await reopened.locator('.wf-push-inbox li').count(),1); assert.equal(await reopened.getByText(details.title,{exact:true}).count(),1);
    assert.deepEqual(pageErrors,[]);assert.deepEqual(serverErrors,[]);
    console.log('PASS: native Chromium notification after closing all WOW windows and stopping its worker; Arabic inbox and both mobile controls verified. Provider transport was simulated.');
  }catch(error){
    let pages;
    try{pages=await bounded(Promise.all((context?.pages()||[]).filter(page=>!page.isClosed()).map(page=>page.evaluate(()=>({
      url:location.href,characterSet:document.characterSet,readyState:document.readyState,language:document.documentElement.lang,
      state:window.WFPush?.getSnapshot(),requests:window.pushRequests,
      buttons:[...document.querySelectorAll('.wf-push-card button')].map(button=>({text:button.textContent,hidden:button.hidden,disabled:button.disabled,visible:!!button.getClientRects().length})),
      titles:[...document.querySelectorAll('#wfPushPhoneTitle,#wfPushCloudTitle')].map(node=>node.textContent)
    })))),3000,'failure diagnostics');}catch(diagnosticError){pages={unavailable:diagnosticError.message};}
    console.error('Synthetic push fixture diagnostics: '+JSON.stringify({phase,pageErrors,serverErrors,failedRequests,pages}));throw error;
  }finally{
    let browserClosed=!browser;
    try{if(browser)await bounded(browser.close(),5000,'browser cleanup');browserClosed=true;}
    finally{
      await bounded(new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections?.();}),5000,'server cleanup');
      if(browserClosed)clearTimeout(watchdog);
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
