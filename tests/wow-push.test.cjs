'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {webcrypto} = require('node:crypto');
const createClient = require('../modules/platform/push/wow-push-client.js');
const installWorker = require('../modules/platform/push/wow-push-sw.js');
const devices = require('../modules/platform/push/wow-push-device.js');

// Serialized IDB read/write fixture. Page and worker share the same committed record.
function storage() {
  let current, tail = Promise.resolve();
  const database = {createObjectStore() {}, transaction() {
    const jobs = [], tx = {objectStore: () => ({
      get() { const req = {}; jobs.push(() => { req.result = structuredClone(current); req.onsuccess(); }); return req; },
      put(value) { jobs.push(() => { current = structuredClone(value); }); }
    })};
    tail = tail.then(() => { while (jobs.length) jobs.shift()(); tx.oncomplete(); }); return tx;
  }};
  return devices.create({open() { const req = {result: database}; queueMicrotask(() => { req.onupgradeneeded(); req.onsuccess(); }); return req; }});
}
const rawKey = Buffer.alloc(65, 2); rawKey[0] = 4;
const publicKey = rawKey.toString('base64url');
const user = {authenticated: true, role: 'owner', userId: 'owner', workspaceId: 'workspace', sessionVersion: 1, mode: 'remote'};
const issuedBinding='72e22abc-430f-4846-9900-283b36a393d1';
const validity=()=>new Date(Date.now()+60000).toISOString();
const cloudIdentity=state=>({...state,currentAccount:state.currentAccount||{id:state.userId,role:state.role,status:'active',permissions:state.permissions||[],sessionVersion:state.sessionVersion}});
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(overrides = {}) {
  const store = overrides.store || storage(), calls = [], serviceEvents = {}, subscribers = [], localSubscribers = [], alerts = [];
  let state = {...user, ...overrides.state}, local = overrides.local || {configured: false}, native = null, pause, testFailure = false;
  const Notification = {permission: 'default'};
  const subscription = {endpoint:'https://push.example/device', options: {applicationServerKey: Uint8Array.from(rawKey)},
    toJSON() { return {endpoint: this.endpoint, expirationTime: null, keys: {auth:'secret', p256dh:'recipient-public-key'}}; },
    async unsubscribe() { calls.push('browser.unsubscribe'); native = null; return true; }};
  const registration = {active:{}, pushManager:{async getSubscription() { return native; },
    subscribe(opts) { calls.push('browser.subscribe'); assert.equal(opts.userVisibleOnly, true); assert.deepEqual(Buffer.from(opts.applicationServerKey), rawKey); Notification.permission = 'granted'; native = subscription; return Promise.resolve(native); }},
    async getNotifications() { return alerts; }};
  const cloud = {ready: Promise.resolve(), getSnapshot: () => cloudIdentity(state), subscribe(fn) { subscribers.push(fn); }, async request(action, payload) {
    calls.push({action, payload}); if (action === 'push.config') return {ok: true, publicKey};
    if (action === 'push.subscribe' && pause) await pause;
    if (action === 'push.test' && testFailure) throw Error('UNAVAILABLE');
    if(action==='push.subscribe')return overrides.subscribeResult||{ok:true,subscribed:true,bindingId:issuedBinding,financial:state.role==='owner'};
    if(action==='push.test')return overrides.testResult||{ok:true,queued:true,eventId:'event'};
    return {ok:true};
  }};
  const nav = {userAgent: '', onLine:true, serviceWorker:{ready:Promise.resolve(registration), getRegistration:async () => registration, addEventListener(name, fn) { serviceEvents[name] = fn; }}};
  const doc = {documentElement:{lang:'ar'}, addEventListener() {}};
  const root = {document: doc, navigator: nav, isSecureContext: true, Notification, PushManager: {}, atob, crypto:webcrypto, WFCloud:cloud,
    WFAccountAccess: {ready: Promise.resolve(), can:p=>state.role==='owner'||state.permissions?.includes(p),
      service: {getSnapshot: () => local, subscribe(fn) { localSubscribers.push(fn); }}}, ...overrides.root};
  if (overrides.ios) Object.assign(nav, {userAgent:'iPhone', standalone:false});
  const api = createClient(root, {store, cloud, checkWorker: async () => {}});
  return {api, store, calls, nav, doc, subscription, Notification, alerts, registration, serviceEvents,
    state(next) { state = {...state,...next}; for (const fn of subscribers) fn(state); },
    local(next) { local = next; for (const fn of localSubscribers) fn(next); },
    failTest() { testFailure = true; }, pause(value) { pause = value; }, native(value) { native = value; }};
}

test('the application never prompts during startup; the gesture creates a native subscription and enrolls exactly this owner device', async () => {
  const f = fixture(); await f.api.ready;
  assert.equal(f.api.getSnapshot().status, 'ready'); assert(!f.calls.includes('browser.subscribe'));
  const enabling = f.api.enable(); assert(f.calls.includes('browser.subscribe'), 'browser subscribes on the original click stack'); await enabling;
  const binding = (await f.store.read()).binding, payload = f.calls.find(item => item.action === 'push.subscribe').payload;
  assert.equal(binding.active, true); assert.deepEqual(payload, {deviceId:binding.deviceId, language:'ar', subscription:f.subscription.toJSON()});
  assert.equal(f.api.getSnapshot().status, 'enabled'); assert.equal(f.api.getSnapshot().canTest, true);
  await f.api.test(); assert.deepEqual(f.calls.find(item => item.action === 'push.test').payload, {deviceId:binding.deviceId});
  assert.equal(f.api.getSnapshot().feedback, 'testQueued'); assert.equal(f.api.getSnapshot().entries.length, 0, 'request acceptance is not delivery');
  await f.api.refresh(); assert.equal(f.calls.filter(item => item.action === 'push.subscribe').length, 1);
  f.doc.documentElement.lang = 'tr'; await f.api.refresh(); assert.equal(f.calls.filter(item => item.action === 'push.subscribe').at(-1).payload.language, 'tr');
  assert.equal((await f.store.read()).binding.deviceId, binding.deviceId);
});

test('uninstalled iOS, denied browser permission, signed-out accounts and workers without a notification grant cannot subscribe', async () => {
  const ios = fixture({ios:true}); await ios.api.ready; assert.equal(ios.api.getSnapshot().status, 'install');
  const denied = fixture(); denied.Notification.permission = 'denied'; await denied.api.ready; assert.equal(denied.api.getSnapshot().status, 'denied');
  const staff = fixture({state:{role:'sales'}}), signedOut = fixture({state:{authenticated:false}});
  const localStaff = fixture({state:{mode:'local'}, local:{configured:true,currentAccount:{role:'sales'}}});
  for (const f of [ios, denied, staff, signedOut, localStaff]) { await f.api.ready; await f.api.enable(); assert(!f.calls.includes('browser.subscribe')); assert(!f.calls.some(item => item.action === 'push.subscribe')); }
});

test('sign-out clears the device and dismisses old financial notifications; cold signed-out startup preserves an existing opt-in', async () => {
  const f = fixture(); await f.api.ready; await f.api.enable(); const binding = (await f.store.read()).binding;
  await f.store.receive({...binding,validUntil:validity()}, {eventId:'one',kind:'expense',title:'Private amount'});
  const cold = fixture({store:f.store, state:{authenticated:false}}); await cold.api.ready;
  assert.equal((await f.store.read()).binding.deviceId, binding.deviceId); assert.deepEqual(cold.api.getSnapshot().entries, []);
  let closed = false; f.alerts.push({data:{deviceId:binding.deviceId}, close() { closed = true; }});
  await f.api.beforeSignOut(); assert.equal((await f.store.read()).binding, null); assert.equal((await f.store.read()).entries.length, 0);
  assert(closed); assert(f.calls.includes('browser.unsubscribe')); assert.deepEqual(f.calls.find(item => item.action === 'push.unsubscribe').payload, {deviceId:binding.deviceId, endpoint:f.subscription.endpoint});
});

test('a changed account cannot finish a previous in-flight enrollment or read its history', async () => {
  const f = fixture(); await f.api.ready; let resume; f.pause(new Promise(resolve => { resume = resolve; }));
  const pending = f.api.enable(); await settle(); assert.equal((await f.store.read()).binding.active, false);
  f.state({role:'sales',userId:'employee'}); resume(); await pending; await settle();
  assert.equal((await f.store.read()).binding, null); assert(!f.api.getSnapshot().canTest); assert.deepEqual(f.api.getSnapshot().entries, []);
});

test('same-owner native key rotation is re-registered after verified authentication; changed application keys require an explicit reset', async () => {
  const f = fixture(); await f.api.ready; await f.api.enable(); const id = (await f.store.read()).binding.deviceId;
  f.subscription.endpoint += '-renewed'; await f.api.refresh();
  assert.equal((await f.store.read()).binding.deviceId, id); assert.equal((await f.store.read()).binding.endpoint, f.subscription.endpoint);
  f.subscription.options.applicationServerKey = new Uint8Array(65); await f.api.refresh();
  assert.equal(f.api.getSnapshot().status, 'keyChanged'); assert.equal(f.api.getSnapshot().canEnable, false);
  await f.api.disable(); assert.equal((await f.store.read()).binding, null); assert.equal(f.api.getSnapshot().status, 'ready');
});

function worker(store, windows = []) {
  const handlers = {}, shown = [], opened = [], root = {navigator:{language:'en-US'}, addEventListener(key, fn) { handlers[key] = fn; },
    registration:{scope:'https://wow.test/app/',async showNotification(title, options) { shown.push({title, ...options}); }},
    clients:{async matchAll() { return windows; }, async openWindow(url) { opened.push(url); }}};
  installWorker(root, store);
  return {shown, opened, run(type, data) { let pending; handlers[type]({...data, waitUntil(value) { pending = value; }}); return pending; }};
}
const binding = {workspaceId:'workspace',userId:'owner',deviceId:'device-id',mode:'remote',language:'ar',active:true,sessionVersion:1,bindingId:issuedBinding,financial:true};
const event = {...binding,validUntil:validity(),eventId:'invoice.23.created.1', kind:'proforma', title:'بروفرما جديدة', body:'العميل ١\nالإجمالي ٣٠٠ دولار', timestamp:'2026-11-21T02:00:00Z', url:'https://other.invalid/'};

test('closed-window pushes save the authorized full body, replace repeated tags and navigate only to the bound workspace', async () => {
  const store = storage(), w = worker(store); assert(await store.replace(null, binding));
  await Promise.all([w.run('push', {data:{json:() => event}}), w.run('push', {data:{json:() => event}})]);
  assert.equal((await store.read()).entries.length, 1); assert.equal(w.shown.length, 2); assert.equal(w.shown[0].tag, w.shown[1].tag);
  assert.equal(w.shown[0].body, event.body); assert.equal(w.shown[1].silent, true); assert.equal(w.shown[0].renotify, false);
  await w.run('notificationclick', {notification:{...w.shown[0],close(){}}});
  assert.deepEqual(w.opened, ['https://wow.test/app/?wf-cloud=employee&workspace=workspace#notifications']); assert.equal((await store.read()).selected, event.eventId);
  const messages = [], tab = {url:'https://wow.test/app/?wf-cloud=employee&workspace=workspace#invoices', async focus(){},postMessage(value){messages.push(value);}};
  const withTab = worker(store, [tab]); await withTab.run('notificationclick', {notification:{...w.shown[0],close(){}}});
  assert.deepEqual(messages, [{type:'wf-push-open',deviceId:binding.deviceId,eventId:event.eventId}]); assert.equal(withTab.opened.length, 0);
});

test('malformed, unbound, mismatched, or stale payloads display only a generic notification and never persist private data', async () => {
  const store = storage(), w = worker(store); await store.replace(null, binding);
  for (const change of [{deviceId:'old'}, {userId:'old'}, {workspaceId:'old'}, {kind:'unknown'}, {eventId:''},
    {bindingId:undefined},{bindingId:'b20f5773-5c7f-4277-a16e-4157824a53fd'},{sessionVersion:2},{validUntil:new Date(0).toISOString()}]) await w.run('push',{data:{json:()=>({...event,...change})}});
  await w.run('push', {data:{json(){throw Error('INVALID')}}}); await store.replace(binding.deviceId, null); await w.run('push',{data:{json:()=>event}});
  for (const notice of w.shown) { assert.equal(notice.title,'WOW FURNITURE'); assert(!notice.body.includes(event.body)); assert.deepEqual(notice.data,{}); }
  assert.deepEqual((await store.read()).entries, []);
  await w.run('notificationclick', {notification:{...w.shown[0], data:{deviceId:'old',eventId:'old',url:'https://other.invalid/'},close(){}}});
  assert.deepEqual(w.opened, ['https://wow.test/app/#dashboard']);
});

test('device binding writes compare inside one transaction and the local inbox has a finite size', async () => {
  const store = storage(); assert.deepEqual(await Promise.all([store.replace(null,binding), store.replace(null,{...binding,deviceId:'other'})]), [true,false]);
  for (let i = 0; i < 70; i++) await store.receive({...binding,validUntil:validity()},{eventId:'r'+i,kind:'chat'});
  const state = await store.read(); assert.equal(state.entries.length, 60); assert.equal(state.entries[0].eventId,'r69');
  assert.equal(await store.replace('other',null),false); assert.equal((await store.read()).binding.deviceId,binding.deviceId);
});

test('verified worker devices receive generic chat and typed gallery targets and reject finance, operations and forged routes',async()=>{
  const opened=[],f=fixture({state:{role:'sales',userId:'staff',permissions:['chat.view','gallery.view']},
    root:{WFModules:{open:(route,params)=>opened.push({route,params})}}});
  await f.api.ready;await f.api.enable();assert.equal(f.api.getSnapshot().status,'enabled');
  const b=(await f.store.read()).binding;assert.equal(b.financial,false);
  const w=worker(f.store),base={...event,...b},room='3b267e77-85f6-48c1-91e0-fcf96cbb5d2d';
  const deliver=p=>w.run('push',{data:{json:()=>({...base,...p})}});
  for(const p of [{kind:'expense'},{kind:'operations',route:'server-admin',params:{}},
    {kind:'chat',route:'https://other.invalid',params:{roomId:room,messageId:'3'}},{kind:'chat',route:'chat',params:{roomId:room,messageId:'99999999999999999999'}}])await deliver(p);
  assert.equal((await f.store.read()).entries.length,0);assert(w.shown.every(n=>n.title==='WOW FURNITURE'));
  const params={roomId:room,messageId:'9223372036854775807'},notice={kind:'chat',title:'Yeni mesaj',body:'Sohbeti açın.',route:'chat',params:{...params,url:'https://other.invalid'},eventId:'chat-1'};
  await deliver(notice);await w.run('notificationclick',{notification:{...w.shown.at(-1),close(){}}});
  assert.equal(new URL(w.opened.at(-1)).hash,'#chat');assert.equal(new URL(w.opened.at(-1)).searchParams.get('wf-notice'),'chat-1');
  assert(await f.api.openEntry('chat-1'));assert.deepEqual(opened.pop(),{route:'chat',params});
  for(const id of [7,'7']){
    const eventId='gallery-'+typeof id;await deliver({kind:'stock.updated',route:'gallery',params:{productId:id},eventId});
    assert(await f.api.openEntry(eventId));assert.deepEqual(opened.pop(),{route:'gallery',params:{productId:id}});
  }
  await f.api.test();assert.equal(f.api.getSnapshot().feedback,'testQueued');
});

test('a generic success response never confirms device enrollment or test delivery',async()=>{
  const failed=fixture({subscribeResult:{ok:true}});await failed.api.ready;await failed.api.enable();
  assert.equal(failed.api.getSnapshot().canTest,false);assert.equal((await failed.store.read()).binding.active,false);
  const other=fixture({testResult:{ok:true}});await other.api.ready;await other.api.enable();await other.api.test();
  assert.equal(other.api.getSnapshot().feedback,'failed');assert.equal(other.api.getSnapshot().entries.length,0);
});
