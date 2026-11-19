/* Helm has its own install scope; conversation and API data stay outside this cache. */
const CACHE_NAME = 'helm-offline-v1';
const OFFLINE_URL = '/helm/offline.html';
const STATIC_ASSETS = [OFFLINE_URL, '/icons/helm-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('helm-offline-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Never intercept API calls, realtime traffic, or apps outside Helm.
  if (request.mode === 'navigate' && url.pathname.startsWith('/helm/')) {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  } else if (STATIC_ASSETS.includes(url.pathname) && !url.search) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
