const CACHE_NAME = 'wow-furniture-v25-context-assistant';
const urlsToCache = [
  './',
  './index.html',
  './google-drive-config.js',
  './manifest.json',
  './assistant-core.js',
  './assistant-agent.js',
  './assistant-neural.js',
  './assistant-speech-worker.js',
  './assistant-learning.json',
  './assistant-adapter.js',
  './assistant-bridge.js',
  './assistant-voice.js',
  './assistant-ui.js',
  './assistant.css',
  './assistant-knowledge.json',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
  'https://h.top4top.io/p_3861refg81.png'
];
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.map(name => (name === CACHE_NAME || name === 'wow-male-voice-v1') ? null : caches.delete(name))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  const privateGoogle = url.hostname === 'accounts.google.com' ||
    url.hostname === 'oauth2.googleapis.com' ||
    url.hostname === 'www.googleapis.com' ||
    url.hostname.endsWith('.googleapis.com') ||
    url.hostname === 'wow-background-backup-iay1ii.v2.appdeploy.ai' ||
    url.hostname === 'api-v2.appdeploy.ai';

  if (request.method !== 'GET' || privateGoogle) {
    event.respondWith(fetch(request));
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const safeExternal = url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'h.top4top.io';
  if (!sameOrigin && !safeExternal) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
