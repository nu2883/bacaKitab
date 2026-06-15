// ============================================================
// BacaKitab Service Worker
// Strategy: Cache First untuk asset statis, Network First untuk GAS API
// ============================================================

const CACHE_NAME    = 'bacakitab-v3';
const SCOPE         = '/bacaKitab/';

// Asset yang di-cache saat install (app shell)
const PRECACHE_URLS = [
  '/bacaKitab/',
  '/bacaKitab/index.html',
  '/bacaKitab/manifest.json',
  // CDN fonts & libraries
  'https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&display=swap',
];

// ---- INSTALL: precache app shell ----
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ---- ACTIVATE: hapus cache lama ----
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ---- FETCH: strategi per tipe request ----
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. GAS API (script.google.com) → Network First, jangan cache
  if (url.hostname.includes('script.google.com')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => new Response(
          JSON.stringify({ error: 'Offline: tidak dapat terhubung ke server.' }),
          { headers: { 'Content-Type': 'application/json' } }
        ))
    );
    return;
  }

  // 2. Font Google → Cache First (stale-while-revalidate)
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          const network = fetch(event.request).then(response => {
            cache.put(event.request, response.clone());
            return response;
          });
          return cached || network;
        })
      )
    );
    return;
  }

  // 3. File app (HTML, JS, CSS, ikon) → Cache First
  if (url.pathname.startsWith('/bacaKitab/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          // Hanya cache response yang valid
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // 4. Request lain → network biasa
  event.respondWith(fetch(event.request));
});

// ---- MESSAGE: force update dari UI ----
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
