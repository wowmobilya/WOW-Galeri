const CACHE_NAME = 'wow-invoice-v2';

// ✅ الملفات الأساسية فقط للتخزين المؤقت
const CORE_ASSETS = [
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// ── تثبيت: خزّن الملفات الأساسية
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // addAll يفشل كلياً إذا فشل ملف واحد
        // نستخدم حلقة لتجنب الفشل الكلي
        return Promise.allSettled(
          CORE_ASSETS.map(url =>
            cache.add(url).catch(err =>
              console.warn('[SW] Failed to cache:', url, err)
            )
          )
        );
      })
      .then(() => {
        console.log('[SW] Install complete');
        return self.skipWaiting(); // تفعيل فوري
      })
  );
});

// ── تفعيل: احذف الكاش القديم
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch: Network First → Cache Fallback
self.addEventListener('fetch', (event) => {
  // تجاهل طلبات غير GET أو غير HTTP
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // ✅ حفظ نسخة جديدة في الكاش
        if (networkResponse.ok) {
          const cloned = networkResponse.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, cloned));
        }
        return networkResponse;
      })
      .catch(() => {
        // 📴 بدون إنترنت → استخدم الكاش
        return caches.match(event.request)
          .then(cached => cached || caches.match('/index.html'));
      })
  );
});
