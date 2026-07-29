// ⚠️ غيّر هذا الرقم (v2, v3, v4...) في كل مرة تقوم فيها بتعديل التطبيق وتريد نشره
const CACHE_NAME = 'wow-furniture-v7'; 

const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
  'https://h.top4top.io/p_3861refg81.png'
];

// 1. تثبيت النسخة الجديدة فوراً
self.addEventListener('install', event => {
  self.skipWaiting(); // إجبار المتصفح على تفعيل التحديث فوراً
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// 2. مسح النسخ القديمة من هواتف المستخدمين
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('تم مسح النسخة القديمة:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. استراتيجية (الإنترنت أولاً ثم الذاكرة المؤقتة)
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // إذا كان هناك إنترنت، جلب أحدث نسخة وتحديث الذاكرة
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        return response;
      })
      .catch(() => {
        // إذا لم يكن هناك إنترنت، استخدم النسخة المخزنة
        return caches.match(event.request);
      })
  );
});
