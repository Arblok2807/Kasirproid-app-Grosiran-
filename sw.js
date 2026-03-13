// ══════════════════════════════════════
//  KASIR PRO — Service Worker v1.0
//  Full offline support + cache strategy
// ══════════════════════════════════════

const CACHE_NAME = 'kasir-pro-v1';
const STATIC_CACHE = 'kasir-pro-static-v1';

// File yang di-cache untuk offline
const STATIC_FILES = [
  './',
  './index.html',
  './manifest.json',
];

// ── Install: cache semua static files ──
self.addEventListener('install', event => {
  console.log('[SW] Installing Kasir Pro Service Worker...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Caching static files');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log('[SW] Install complete!');
        return self.skipWaiting(); // Langsung aktif tanpa nunggu
      })
      .catch(err => {
        console.warn('[SW] Cache install error (aman diabaikan):', err);
        return self.skipWaiting();
      })
  );
});

// ── Activate: hapus cache lama ──
self.addEventListener('activate', event => {
  console.log('[SW] Activating Kasir Pro Service Worker...');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== STATIC_CACHE && name !== CACHE_NAME)
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Activated! Kasir Pro siap offline.');
        return self.clients.claim(); // Kontrol semua tab langsung
      })
  );
});

// ── Fetch: Cache First strategy ──
// Prioritas: Cache → Network → Fallback
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET dan chrome-extension
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;
  if (url.protocol === 'chrome:') return;

  // Skip Google Sheets API (butuh network)
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

  // Untuk ZXing (barcode library CDN)
  if (url.hostname.includes('unpkg.com') || url.hostname.includes('cdn.')) {
    event.respondWith(
      caches.match(request)
        .then(cached => {
          if (cached) return cached;
          return fetch(request)
            .then(response => {
              if (response.ok) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
              }
              return response;
            })
            .catch(() => {
              return new Response('CDN tidak tersedia offline', {
                status: 503,
                headers: { 'Content-Type': 'text/plain' }
              });
            });
        })
    );
    return;
  }

  // Cache First untuk semua file lokal
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Serve dari cache, update di background
          const fetchPromise = fetch(request)
            .then(networkResponse => {
              if (networkResponse && networkResponse.ok) {
                const clone = networkResponse.clone();
                caches.open(STATIC_CACHE)
                  .then(cache => cache.put(request, clone));
              }
              return networkResponse;
            })
            .catch(() => null);

          // Return cache langsung (stale-while-revalidate)
          return cachedResponse;
        }

        // Gak ada di cache → fetch dari network
        return fetch(request)
          .then(response => {
            if (!response || !response.ok) return response;
            const clone = response.clone();
            caches.open(STATIC_CACHE)
              .then(cache => cache.put(request, clone));
            return response;
          })
          .catch(() => {
            // Fallback offline page
            if (request.destination === 'document') {
              return caches.match('./index.html');
            }
            return new Response('Offline', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' }
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

console.log('[SW] Kasir Pro Service Worker loaded!');
