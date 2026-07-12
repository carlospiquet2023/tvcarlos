const CACHE_NAME = 'eduvault-static-v3';
const OFFLINE_URL = '/offline.html';
const APP_SHELL_URL = '/index.html';
const STATIC_ASSETS = [APP_SHELL_URL, OFFLINE_URL];
const PRIVATE_PATH_PREFIXES = ['/api/', '/hls/', '/broadcast/', '/uploads/pdfs/'];
const CACHEABLE_DESTINATIONS = new Set(['font', 'image', 'manifest', 'script', 'style', 'worker']);

function isPrivateRequest(request, url) {
  const path = url.pathname.toLowerCase();
  return request.headers.has('Authorization')
    || PRIVATE_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))
    || /\.(?:m3u8|m4s|ts)(?:$|\/)/i.test(path);
}

function canCache(response) {
  if (!response || !response.ok || response.type !== 'basic') return false;
  const cacheControl = response.headers.get('Cache-Control') || '';
  return !/(?:no-store|private)/i.test(cacheControl);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (isPrivateRequest(request, url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => (
        await caches.match(APP_SHELL_URL)
        || await caches.match(OFFLINE_URL)
        || Response.error()
      ))
    );
    return;
  }

  if (!CACHEABLE_DESTINATIONS.has(request.destination)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (canCache(response)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached || Response.error());

      return cached || networkFetch;
    })
  );
});
