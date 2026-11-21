/* Imported by the existing root worker, so Web Push can wake the app after its windows close. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory; return; }
  root.importScripts('./modules/platform/push/wow-push-device.js?v=2');
  factory(root, root.WFPushDevice.create(root.indexedDB));
})(typeof self === 'object' ? self : globalThis, function installPush(root, store) {
  'use strict';
  const kinds = new Set(['proforma', 'payment', 'expense', 'receipt', 'test','chat','order.created','order.updated','stock.updated','operations']);
  const generic = {
    ar: 'افتح WOW للاطّلاع على إشعاراتك.', en: 'Open WOW to check your notifications.',
    tr: 'Bildirimlerinizi görmek için WOW uygulamasını açın.', fr: 'Ouvrez WOW pour consulter vos notifications.',
    ru: 'Откройте WOW, чтобы посмотреть уведомления.'
  };
  const base = new URL(root.registration.scope);
  const language = value => Object.hasOwn(generic, value) ? value : 'ar';
  function text(value, limit) {
    return typeof value === 'string' ? Array.from(value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ').trim()).slice(0, limit).join('') : '';
  }
  const identifier = (value, limit = 220) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit && !/[\s\u0000-\u001f\u007f]/.test(value);
  function payload(event) {
    let value;
    try { value = event.data?.json(); } catch (_) { return null; }
    if (!value || !kinds.has(value.kind) || !identifier(value.eventId) || !identifier(value.deviceId, 128) || !identifier(value.userId, 128) || !identifier(value.workspaceId, 128)) return null;
    const title = text(value.title, 120), body = text(value.body, 750), destination=store.target(value);
    if (!title || !body || !destination) return null;
    const time = typeof value.timestamp === 'number' ? value.timestamp : Date.parse(value.timestamp);
    return {scope: value, entry: {eventId: value.eventId, kind: value.kind, title, body, language: language(value.language),
      route:destination.route,params:destination.params,
      timestamp: Number.isFinite(time) && time > 0 && time < 8640000000000000 ? time : Date.now()}};
  }
  async function tellWindows(message) {
    const windows = await root.clients.matchAll({type: 'window', includeUncontrolled: true});
    for (const client of windows) client.postMessage(message);
  }
  async function deliver(event) {
    const parsed = payload(event);
    let match;
    // A queued event from a revoked binding must never expose its financial preview.
    try { if (parsed) match = await store.receive(parsed.scope, parsed.entry); } catch (_) {}
    const entry = match && parsed.entry;
    const lang = entry?.language || language(root.navigator?.language?.split('-')[0]);
    const data = match ? {deviceId: match.deviceId, eventId: entry.eventId} : {};
    const options = {body: entry?.body || generic[lang], lang, dir: lang === 'ar' ? 'rtl' : 'ltr',
      icon: new URL('app-icon-192.png?v=198', base).href, tag: match ? 'wow-push/' + match.deviceId + '/' + entry.eventId : 'wow-push/attention',
      renotify: false, data};
    if (entry) options.timestamp = entry.timestamp;
    if (match?.duplicate) options.silent = true;
    await root.registration.showNotification(entry?.title || 'WOW FURNITURE', options);
    if (match) await tellWindows({type: 'wf-push-changed'}).catch(() => {});
  }
  function destination(binding) {
    const url = new URL(base.href);
    if (binding?.mode === 'remote') { url.searchParams.set('wf-cloud', 'employee'); url.searchParams.set('workspace', binding.workspaceId); }
    if (binding?.destination && binding.destination.route!=='notifications') url.searchParams.set('wf-notice',binding.eventId);
    url.hash = binding ? binding.destination?.route || 'notifications' : 'dashboard';
    return url;
  }
  function sameApp(client, destination) {
    try {
      const url = new URL(client.url);
      return url.origin === base.origin && [base.pathname, new URL('index.html', base).pathname].includes(url.pathname) &&
        url.searchParams.get('wf-cloud') === destination.searchParams.get('wf-cloud') && url.searchParams.get('workspace') === destination.searchParams.get('workspace');
    } catch (_) { return false; }
  }
  async function open(event) {
    const data = event.notification.data || {};
    event.notification.close();
    let binding;
    if (identifier(data.deviceId, 128) && identifier(data.eventId)) {
      try { binding = await store.select(data.deviceId, data.eventId); } catch (_) {}
    }
    const url = destination(binding);
    const windows = await root.clients.matchAll({type: 'window', includeUncontrolled: true});
    const client = windows.find(item => item.focused && sameApp(item, url)) || windows.find(item => sameApp(item, url));
    if (client) {
      try {
        await client.focus();
        if (binding) client.postMessage({type:'wf-push-open',deviceId:binding.deviceId,eventId:binding.eventId});
        return;
      } catch (_) {}
    }
    await root.clients.openWindow(url.href);
  }
  root.addEventListener('push', event => event.waitUntil(deliver(event)));
  root.addEventListener('notificationclick', event => {
    if (event.notification.tag?.startsWith('wow-push/')) event.waitUntil(open(event));
  });
  // Re-registration uses the verified account in the page.
  root.addEventListener('pushsubscriptionchange', event => event.waitUntil(tellWindows({type: 'wf-push-subscription-change'})));
  root.addEventListener('message', event => {
    if (event.data?.type === 'wf-push-probe') event.ports?.[0]?.postMessage({version: 2});
  });
});
