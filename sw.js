// ══════════════════════════════════════
//  KASIR PRO — Service Worker v2.0
//  Network First + Auto Update
// ══════════════════════════════════════

const CACHE_VERSION = 'v2';
const CACHE_NAME    = 'kasir-pro-' + CACHE_VERSION;
const STATIC_CACHE  = 'kasir-pro-static-' + CACHE_VERSION;

const STATIC_FILES = [
  './',
  './index.html',
  './manifest.json',
];

// ── Install: cache static files & langsung aktif ──
self.addEventListener('install', event => {
  console.log('[SW] Installing Kasir Pro SW ' + CACHE_VERSION + '...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_FILES))
      .then(() => {
        console.log('[SW] Install complete!');
        return self.skipWaiting(); // Langsung aktif tanpa nunggu tab lama tutup
      })
      .catch(err => {
        console.warn('[SW] Cache install error:', err);
        return self.skipWaiting();
      })
  );
});

// ── Activate: hapus SEMUA cache versi lama ──
self.addEventListener('activate', event => {
  console.log('[SW] Activating SW ' + CACHE_VERSION + '...');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames
          .filter(name => name !== STATIC_CACHE && name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      ))
      .then(() => {
        console.log('[SW] Activated!');
        return self.clients.claim(); // Ambil kontrol semua tab langsung
      })
  );
});

// ── Fetch: Network First strategy ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;
  if (url.protocol === 'chrome:') return;

  // Skip Google APIs
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('google.com') ||
      url.hostname.includes('gstatic.com')) {
    event.respondWith(
      fetch(request).catch(() => new Response('Offline - Google Sheets tidak tersedia', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' }
      }))
    );
    return;
  }

  // CDN: Cache First (jarang berubah)
  if (url.hostname.includes('unpkg.com') || url.hostname.includes('cdn.')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
          }
          return response;
        }).catch(() => new Response('CDN tidak tersedia offline', {
          status: 503, headers: { 'Content-Type': 'text/plain' }
        }));
      })
    );
    return;
  }

  // ★ Network First untuk semua file lokal
  // Selalu ambil dari network dulu → update cache → return ke user
  // Kalau offline → fallback ke cache
  event.respondWith(
    fetch(request)
      .then(networkResponse => {
        if (networkResponse && networkResponse.ok) {
          caches.open(STATIC_CACHE)
            .then(cache => cache.put(request, networkResponse.clone()));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(request).then(cachedResponse => {
          if (cachedResponse) return cachedResponse;
          if (request.destination === 'document') {
            return caches.match('./index.html');
          }
          return new Response('Offline', {
            status: 503, headers: { 'Content-Type': 'text/plain' }
          });
        });
      })
  );
});

// ── Message handler ──
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

console.log('[SW] Kasir Pro Service Worker ' + CACHE_VERSION + ' loaded!');
