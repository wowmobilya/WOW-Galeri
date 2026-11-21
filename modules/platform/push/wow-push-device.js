/* The installed app and its service worker share one notification binding per browser profile. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WFPushDevice = api;
})(typeof self === 'object' ? self : globalThis, function () {
  'use strict';
  const LIMIT = 60;
  const empty = () => ({binding: null, entries: [], selected: ''});
  const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
  const finance = new Set(['proforma','payment','expense','receipt']);
  const routes = {
    chat:['chat','chat.view'], 'order.created':['gallery-orders','orders.view'], 'order.updated':['my-orders','myorders.view'],
    'stock.updated':['gallery','gallery.view'], operations:['server-admin','server.view']
  };
  // Only these module identifiers and typed parameters can cross a notification click.
  function target(entry) {
    if (finance.has(entry.kind) || entry.kind === 'test') return {route:'notifications',params:{}};
    const spec = Object.hasOwn(routes, entry.kind) && routes[entry.kind], params = entry.params;
    if (!spec || entry.route !== spec[0] || !params || typeof params !== 'object' || Array.isArray(params)) return null;
    let safe = {};
    if (entry.kind === 'chat') {
      if (!uuid(params.roomId) || typeof params.messageId !== 'string' || !/^[1-9]\d{0,18}$/.test(params.messageId) || BigInt(params.messageId)>9223372036854775807n) return null;
      safe = {roomId:params.roomId,messageId:params.messageId};
    } else if (entry.kind === 'stock.updated') {
      const id = params.productId;
      if (!Number.isSafeInteger(id) && !(typeof id === 'string' && id.trim() && id.length <= 180 && !/[\u0000-\u001f\u007f]/.test(id))) return null;
      safe = {productId:id};
    } else if (entry.kind === 'order.created' || entry.kind === 'order.updated') {
      if (!uuid(params.orderId)) return null;
      safe = {orderId:params.orderId};
    }
    return {route:spec[0],permission:spec[1],params:safe};
  }

  function create(indexedDB) {
    let opening;
    function open() {
      if (!opening) opening = new Promise((resolve, reject) => {
        const request = indexedDB.open('WOWPushDevice_v1', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('state');
        request.onerror = () => reject(request.error || Error('PUSH_STORAGE'));
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); opening = null; };
          resolve(db);
        };
      }).catch(error => { opening = null; throw error; });
      return opening;
    }

    async function transaction(change) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('state', change ? 'readwrite' : 'readonly');
        const store = tx.objectStore('state');
        const read = store.get('current');
        let result;
        read.onsuccess = () => {
          const state = read.result || empty();
          if (!change) { result = state; return; }
          const update = change(state);
          result = update.result;
          if (update.next) store.put(update.next, 'current');
        };
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(tx.error || Error('PUSH_STORAGE'));
      });
    }

    // Compare inside the transaction so a stale tab cannot clear or replace a newer account.
    function replace(expectedId, binding, expectedBinding) {
      return transaction(state => {
        if ((state.binding?.deviceId || null) !== expectedId ||
          expectedBinding !== undefined && (state.binding?.bindingId || null) !== expectedBinding) return {result: false};
        const same = binding && binding.deviceId === expectedId;
        const sameAccount = same && state.binding.userId===binding.userId && state.binding.workspaceId===binding.workspaceId && state.binding.sessionVersion===binding.sessionVersion;
        const preserve = sameAccount && state.binding.bindingId === binding.bindingId;
        return {next: {...(preserve ? state : empty()),pendingOpen:sameAccount ? state.pendingOpen : null,binding}, result: true};
      });
    }

    function receive(scope, entry) {
      return transaction(state => {
        const b = state.binding;
        if (!b?.active || b.deviceId !== scope.deviceId || b.workspaceId !== scope.workspaceId || b.userId !== scope.userId ||
          !uuid(b.bindingId) || b.bindingId !== scope.bindingId || !Number.isSafeInteger(scope.sessionVersion) || b.sessionVersion !== scope.sessionVersion ||
          !Number.isFinite(Date.parse(scope.validUntil)) || Date.parse(scope.validUntil)<=Date.now() ||
          (finance.has(entry.kind) || entry.kind==='operations') && b.financial!==true) return {result:null};
        const duplicate = state.entries.some(item => item.eventId === entry.eventId);
        const result = {deviceId: b.deviceId, language: b.language, duplicate};
        if (duplicate) return {result};
        return {next: {...state, entries: [entry, ...state.entries].slice(0, LIMIT)}, result};
      });
    }

    function select(deviceId, eventId) {
      return transaction(state => {
        const entry=state.entries.find(item=>item.eventId===eventId), destination=entry&&target(entry);
        if (!state.binding?.active || state.binding.deviceId !== deviceId || !destination) return {result: null};
        return {next:{...state,selected:eventId,pendingOpen:{kind:entry.kind,route:destination.route,params:destination.params,eventId}},
          result:{...state.binding,destination,eventId}};
      });
    }
    function takeOpen(binding,eventId) {
      return transaction(state=>{
        const b=state.binding,p=state.pendingOpen;
        if (!b?.active || !binding || b.deviceId!==binding.deviceId || b.bindingId!==binding.bindingId || b.workspaceId!==binding.workspaceId ||
          b.userId!==binding.userId || b.sessionVersion!==binding.sessionVersion || !p || p.eventId!==eventId) return {result:null};
        return {next:{...state,pendingOpen:null},result:target(p)};
      });
    }
    return Object.freeze({read: () => transaction(), replace, receive, select, takeOpen, target});
  }
  return Object.freeze({create});
});
