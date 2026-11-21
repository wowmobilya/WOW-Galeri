/* Account-bound Web Push. The browser creates its native subscription only from the device button. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.WFPush = factory(root);
})(typeof window === 'object' ? window : globalThis, function createPush(root, options) {
  'use strict';
  options = options || {};
  const cloud = options.cloud || root.WFCloud, access = root.WFAccountAccess;
  const store = options.store || root.WFPushDevice.create(root.indexedDB);
  const nav = root.navigator, doc = root.document, listeners = new Set();
  let scopeKey, generation = 0, prepared = null, verified = '', busy = false, started = false, refreshPending = false;
  let previousAccount = null, flight = null, status = 'checking', feedback = '', device = {binding: null, entries: [], selected: ''};
  const locale = () => { const value = doc.documentElement.lang?.toLowerCase().split(/[-_]/)[0]; return ['ar','en','tr','fr','ru'].includes(value) ? value : 'ar'; };
  const localState = () => access?.service?.getSnapshot?.();
  function accountIdentity() {
    const state = cloud?.getSnapshot(), account = state?.currentAccount;
    if (!state?.authenticated || !state.workspaceId || !state.userId || account?.id!==state.userId ||
      account.status!=='active' || account.sessionVersion!==state.sessionVersion || account.role!==state.role) return null;
    const remote=state.mode==='remote', financial=account.role==='owner', local=localState();
    if (!financial && (!remote || !['chat.view','gallery.view','orders.view','myorders.view'].some(p=>account.permissions?.includes(p)))) return null;
    if (local?.configured && (remote ? local.currentAccount?.id!==account.id : local.currentAccount?.role!=='owner')) return null;
    return {workspaceId:state.workspaceId,userId:account.id,sessionVersion:account.sessionVersion,mode:remote?'remote':'local',owner:financial};
  }
  const same = (left, right) => !!left && !!right && left.workspaceId === right.workspaceId && left.userId === right.userId && left.sessionVersion === right.sessionVersion;
  const blank = () => ({binding: null, entries: [], selected: ''});
  function snapshot() {
    const current = accountIdentity(), mine = same(current, device.binding);
    return {status: current ? status : 'account', busy, feedback: current ? feedback : '', bound: !!mine,owner:current?.owner===true,
      entries: mine && device.binding.active ? device.entries.map(row => ({...row})) : [], selected: mine ? device.selected : '',
      canEnable: !!current && status === 'ready' && !busy, canDisable: !!current && (mine || status === 'keyChanged') && !busy,
      canTest: !!current && mine && status === 'enabled' && !busy};
  }
  function emit() { const value = snapshot(); for (const listener of listeners) { try { listener(value); } catch (_) {} } }
  function problem(code) { return Object.assign(Error(code), {code}); }
  function supported() {
    const ios = /iP(?:hone|ad|od)/i.test(nav.userAgent || '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
    if (ios && !nav.standalone && !root.matchMedia?.('(display-mode: standalone)').matches && !root.matchMedia?.('(display-mode: fullscreen)').matches) return 'install';
    if (root.isSecureContext === false || !root.Notification || !nav.serviceWorker || !root.PushManager || !root.indexedDB && !options.store) return 'unsupported';
    if (root.Notification.permission === 'denied') return 'denied';
    return '';
  }
  function keyBytes(input) {
    if (typeof input !== 'string' || !/^[A-Za-z0-9_-]{87}=?$/.test(input)) throw problem('PUSH_KEY');
    const bytes = Uint8Array.from(root.atob(input.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
    if (bytes.length !== 65 || bytes[0] !== 4) throw problem('PUSH_KEY');
    return bytes;
  }
  function matchesKey(subscription, key) {
    const raw = subscription?.options?.applicationServerKey;
    if (!raw) return true;
    const existing = new Uint8Array(raw);
    return existing.length === key.length && existing.every((byte, index) => byte === key[index]);
  }
  function withTimeout(promise, ms, errorCode) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(problem(errorCode)), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }
  async function checkWorker(registration) {
    if (!registration?.active || !registration.pushManager) throw problem('PUSH_WORKER');
    if (options.checkWorker) return options.checkWorker(registration);
    const channel = new root.MessageChannel();
    try {
      await withTimeout(new Promise((resolve, reject) => {
        channel.port1.onmessage = event => event.data?.version === 2 ? resolve() : reject(problem('PUSH_WORKER'));
        registration.active.postMessage({type: 'wf-push-probe'}, [channel.port2]);
      }), 2500, 'PUSH_WORKER');
    } finally { channel.port1.close(); }
  }
  function errorStatus(error) {
    if (root.Notification?.permission === 'denied') return 'denied';
    if (error?.code === 'PUSH_WORKER') return 'updating';
    if (error?.code === 'NETWORK' || nav.onLine === false) return 'offline';
    if (error?.code === 'PUSH_KEY' || /PUSH_(?:UNCONFIGURED|NOT_CONFIGURED|UNAVAILABLE)/.test(error?.code || '')) return 'unavailable';
    if (error?.name === 'NotAllowedError') return 'ready';
    return 'error';
  }
  function guard(run, identity) { if (run !== generation || !same(identity, accountIdentity())) throw problem('PUSH_ACCOUNT_CHANGED'); }
  function registrationPayload(binding, subscription) {
    return {deviceId: binding.deviceId, language: binding.language, subscription: subscription.toJSON()};
  }
  function enrolled(result,identity) {
    if (result?.subscribed!==true || typeof result.bindingId!=='string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(result.bindingId) ||
      result.financial!==identity.owner) throw problem('PUSH_REGISTRATION_UNCONFIRMED');
    return {bindingId:result.bindingId,financial:result.financial,active:true};
  }
  async function loadDevice() { device = await store.read(); }

  // Clear local preview data first. Delayed or offline provider unregistration then cannot reveal old amounts.
  async function detach(binding, authenticated, knownRegistration) {
    if (!binding || !await store.replace(binding.deviceId, null,binding.bindingId||null)) return;
    if (device.binding?.deviceId === binding.deviceId) device = blank();
    verified = ''; emit();
    const remote = authenticated ? cloud.request('push.unsubscribe', {endpoint: binding.endpoint, deviceId: binding.deviceId}) : Promise.resolve();
    const browser = (async () => {
      const registration = knownRegistration || await nav.serviceWorker?.getRegistration?.();
      if (!registration) return;
      const notices = await registration.getNotifications?.() || [];
      for (const notice of notices) if (notice.data?.deviceId === binding.deviceId) notice.close();
      const subscription = await registration.pushManager?.getSubscription();
      if (subscription?.endpoint === binding.endpoint) await subscription.unsubscribe();
    })();
    await withTimeout(Promise.allSettled([remote, browser]), 3000, 'PUSH_UNLINK_PENDING').catch(() => {});
  }
  async function prepare(run, identity) {
    if (!root.indexedDB && !options.store) { status = 'unsupported'; return; }
    await loadDevice(); guard(run, identity);
    if (device.binding && !same(device.binding, identity)) {
      await detach(device.binding, false); guard(run, identity); await loadDevice(); guard(run, identity);
    }
    const availability = supported();
    if (availability) {
      if (availability === 'denied' && device.binding) await detach(device.binding, true);
      guard(run, identity); status = availability; return;
    }
    if (nav.onLine === false) { status = 'offline'; return; }
    const [config, registration] = await Promise.all([cloud.request('push.config'), withTimeout(nav.serviceWorker.ready, 8000, 'PUSH_WORKER')]);
    guard(run, identity);
    const key = keyBytes(config.publicKey);
    await checkWorker(registration);
    const subscription = await registration.pushManager.getSubscription(); guard(run, identity);
    const binding = device.binding;
    prepared = {identity, key, registration, bindingId: binding?.deviceId || null};
    if (subscription && !matchesKey(subscription, key)) { status = 'keyChanged'; return; }
    if (!binding || !subscription || root.Notification.permission !== 'granted') { status = 'ready'; return; }
    const language = locale(), fingerprint = JSON.stringify([binding.deviceId, subscription.toJSON(), language]);
    if (verified !== fingerprint || !binding.active) {
      const next = {...binding, mode: identity.mode, language, endpoint: subscription.endpoint, active: true};
      const result=await cloud.request('push.subscribe', registrationPayload(next, subscription)); guard(run, identity);
      if (!await store.replace(binding.deviceId, {...next,...enrolled(result,identity)},binding.bindingId||null)) throw problem('PUSH_BINDING_CHANGED');
      guard(run, identity); verified = fingerprint; await loadDevice(); guard(run, identity);
    }
    status = 'enabled';
  }
  function refresh() {
    if (!started) return Promise.resolve();
    if (busy) { refreshPending = true; return Promise.resolve(); }
    if (flight) return flight;
    const identity = accountIdentity();
    if (!identity) { status = 'account'; prepared = null; emit(); return Promise.resolve(); }
    const run = ++generation;
    status = 'checking'; prepared = null; emit();
    const operation = prepare(run, identity).catch(error => {
      if (run === generation) status = errorStatus(error);
    }).finally(() => { if (flight === operation) flight = null; emit(); if(run===generation) openFromAddress().catch(()=>{}); });
    flight = operation; return operation;
  }
  function sessionChanged() {
    if (!started) return;
    const identity = accountIdentity(), state = cloud?.getSnapshot(), local = localState();
    const otherAccount = !!(!identity && (state?.authenticated || state?.mode === 'local' && local?.currentAccount && local.currentAccount.role !== 'owner'));
    const nextKey = JSON.stringify([identity, otherAccount]);
    if (nextKey === scopeKey) return;
    const previous = previousAccount;
    previousAccount = identity; scopeKey = nextKey; generation++; flight = null; prepared = null; verified = ''; feedback = ''; device = blank(); emit();
    // A fresh signed-out tab leaves the closed app's device enrolled. An actual account change detaches it.
    if (previous && !same(identity, previous) || otherAccount) {
      store.read().then(({binding}) => {
        if (binding && (same(binding, previous) || otherAccount && !same(binding, accountIdentity()))) return detach(binding, same(binding, accountIdentity()));
      }).catch(() => {}).finally(refresh);
    } else refresh();
  }
  async function runAction(action) {
    busy = true; feedback = ''; emit();
    try { await action(); }
    catch (error) { if (error?.code !== 'PUSH_ACCOUNT_CHANGED') { status = errorStatus(error); feedback = error?.name === 'NotAllowedError' ? 'permission' : 'failed'; } }
    finally { busy = false; emit(); if (refreshPending) { refreshPending = false; await refresh(); } }
  }
  function enable() {
    const setup = prepared, identity = accountIdentity();
    if (!snapshot().canEnable || !setup || !same(setup.identity, identity)) return Promise.resolve();
    const run = ++generation;
    // Call subscribe directly on the click stack. Browser permission prompts, including iOS Home Screen, need this gesture.
    let native;
    try { native = setup.registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: setup.key}); }
    catch (error) { native = Promise.reject(error); }
    return runAction(async () => {
      const subscription = await native; guard(run, identity);
      const state = await store.read(); guard(run, identity);
      if ((state.binding?.deviceId || null) !== setup.bindingId || state.binding && !same(state.binding, identity)) throw problem('PUSH_BINDING_CHANGED');
      const binding = {...identity,deviceId:setup.bindingId || root.crypto.randomUUID(),language:locale(),endpoint:subscription.endpoint,
        bindingId:state.binding?.bindingId||null,active:false};
      if (!await store.replace(setup.bindingId,binding,state.binding?.bindingId||null)) throw problem('PUSH_BINDING_CHANGED');
      guard(run, identity); device = {...state, binding};
      const result=await cloud.request('push.subscribe',registrationPayload(binding, subscription)); guard(run, identity);
      if (!await store.replace(binding.deviceId,{...binding,...enrolled(result,identity)},binding.bindingId)) throw problem('PUSH_BINDING_CHANGED');
      guard(run, identity); await loadDevice(); guard(run, identity);
      verified = JSON.stringify([binding.deviceId, subscription.toJSON(), binding.language]);
      prepared.bindingId = binding.deviceId; status = 'enabled';
    });
  }
  function disable() {
    if (!snapshot().canDisable) return Promise.resolve();
    const identity = accountIdentity(), reg = prepared?.registration, run = ++generation;
    return runAction(async () => {
      const state = await store.read(); guard(run, identity);
      if (same(state.binding, identity)) await detach(state.binding, true, reg);
      else if (status === 'keyChanged' && !state.binding) await (await reg?.pushManager.getSubscription())?.unsubscribe();
      guard(run, identity); prepared = null; status = 'checking'; feedback = 'disabled'; refreshPending = true;
    });
  }
  function test() {
    if (!snapshot().canTest) return Promise.resolve();
    const identity = accountIdentity(), bindingId = device.binding.deviceId, run = generation;
    return runAction(async () => {
      const state = await store.read(); guard(run, identity);
      if (!same(state.binding, identity) || state.binding.deviceId !== bindingId) throw problem('PUSH_BINDING_CHANGED');
      const result=await cloud.request('push.test',{deviceId:bindingId}); guard(run, identity);
      if(result?.queued!==true||typeof result.eventId!=='string'||!result.eventId)throw problem('PUSH_TEST_UNCONFIRMED');
      feedback = 'testQueued';
    });
  }
  async function beforeSignOut() {
    const identity = accountIdentity();
    if (!identity) return;
    generation++; verified = ''; flight = null; const registration = prepared?.registration; prepared = null;
    try {
      const {binding} = await store.read();
      if (same(binding, identity)) await detach(binding, true, registration);
    } catch (_) {
      // Storage may be unavailable in a locked browser profile. Signing the app out must still work.
      const binding = device.binding;
      if (same(binding, identity)) {
        const remove = cloud.request('push.unsubscribe', {endpoint: binding.endpoint, deviceId: binding.deviceId});
        const close = registration?.pushManager.getSubscription().then(sub => sub?.endpoint === binding.endpoint ? sub.unsubscribe() : null);
        await withTimeout(Promise.allSettled([remove, close]), 3000, 'PUSH_UNLINK_PENDING').catch(() => {});
      }
      device = blank(); emit();
    }
  }
  async function openSelected(eventId,deviceId) {
    const identity=accountIdentity(),binding=device.binding;
    if(!identity || !same(binding,identity) || binding.deviceId!==deviceId || !eventId)return false;
    const dest=await store.takeOpen(binding,eventId);
    if(!dest || !same(identity,accountIdentity()))return false;
    if(dest.route==='notifications' || !root.WFModules?.open || !access?.can?.(dest.permission))root.WFNotifications?.open();
    else root.WFModules.open(dest.route,dest.params);
    return true;
  }
  async function openFromAddress() {
    if(!root.location?.href || !root.WFModules?.open || doc.readyState==='loading')return;
    const url=new URL(root.location.href), eventId=url.searchParams.get('wf-notice');
    if(!eventId || !device.binding?.active)return;
    if(await openSelected(eventId,device.binding.deviceId)){
      const current=new URL(root.location.href);current.searchParams.delete('wf-notice');
      root.history?.replaceState(root.history.state,'',current.href);
    }
  }
  async function openEntry(eventId){
    try{
      await loadDevice();const binding=device.binding;
      if(!same(binding,accountIdentity()) || !await store.select(binding.deviceId,eventId))return false;
      return await openSelected(eventId,binding.deviceId);
    }catch{return false;}
  }
  async function onMessage({data}) {
    if (data?.type === 'wf-push-subscription-change') { verified = ''; await refresh(); return; }
    if (!['wf-push-changed', 'wf-push-open'].includes(data?.type) || !accountIdentity()) return;
    await loadDevice(); emit();
    if (data.type === 'wf-push-open') await openSelected(data.eventId,data.deviceId);
  }
  cloud?.subscribe(sessionChanged); if (access?.service !== cloud) access?.service?.subscribe?.(sessionChanged);
  nav.serviceWorker?.addEventListener('message', event => { onMessage(event).catch(() => {}); });
  nav.serviceWorker?.addEventListener('controllerchange', () => { verified = ''; refresh(); });
  root.addEventListener?.('online', () => { verified = ''; refresh(); });
  root.addEventListener?.('offline', refresh);
  doc.addEventListener?.('visibilitychange', () => { if (doc.visibilityState === 'visible') refresh(); });
  root.addEventListener?.('load',()=>{openFromAddress().catch(()=>{});},{once:true});
  if (root.MutationObserver) new root.MutationObserver(refresh).observe(doc.documentElement, {attributes: true, attributeFilter: ['lang']});
  const ready = Promise.allSettled([cloud?.ready, access?.ready]).then(() => { started = true; sessionChanged(); return flight; });
  return Object.freeze({ready, refresh, enable, disable, test, beforeSignOut, openEntry, getSnapshot: snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }});
});
