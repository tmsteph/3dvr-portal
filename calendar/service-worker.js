/* calendar/service-worker.js */

const CACHE_VERSION = 'v2';
const STATIC_CACHE = `calendar-static-${CACHE_VERSION}`;
const HTML_CACHE = `calendar-html-${CACHE_VERSION}`;
const SCOPE_URL = new URL(self.registration.scope);
const scopeAsset = (asset = '') => new URL(asset, SCOPE_URL).pathname;

const STATIC_ASSETS = [
  scopeAsset(''),
  scopeAsset('index.html'),
  scopeAsset('global.css'),
  scopeAsset('calendar.css'),
  scopeAsset('install-banner.css'),
  scopeAsset('calendar.js'),
  scopeAsset('gun-init.js'),
  scopeAsset('oauth.js'),
  scopeAsset('pwa-install.js'),
  scopeAsset('calendar.webmanifest'),
  scopeAsset('icons/icon-192.png'),
  scopeAsset('icons/icon-512.png'),
  scopeAsset('icons/maskable-512.png')
];

const createReloadedRequests = (assets) =>
  assets.map((asset) => new Request(asset, { cache: 'reload' }));

const networkFirst = async (request, cacheName, fallbackUrl = null) => {
  try {
    const fresh = await fetch(request, { cache: 'reload' });
    if (fresh && (fresh.ok || fresh.type === 'opaque')) {
      const cache = await caches.open(cacheName);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallbackUrl) return caches.match(fallbackUrl);
    throw error;
  }
};

const staleWhileRevalidate = (event, cacheName) => {
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(event.request);

    const fetchPromise = fetch(event.request, { cache: 'reload' })
      .then((response) => {
        if (response && (response.ok || response.type === 'opaque')) {
          cache.put(event.request, response.clone());
        }
        return response;
      })
      .catch(() => null);

    if (cached) {
      event.waitUntil(fetchPromise);
      return cached;
    }

    const fresh = await fetchPromise;
    if (fresh) return fresh;
    return Response.error();
  })());
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(createReloadedRequests(STATIC_ASSETS)))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => {
        const isCalendarCache = key.startsWith('calendar-static-') || key.startsWith('calendar-html-');
        if (isCalendarCache && ![STATIC_CACHE, HTML_CACHE].includes(key)) {
          return caches.delete(key);
        }
        return Promise.resolve();
      }))
    )
  );
  self.clients.claim();
});

const isGunRealtime = (url) =>
  url.includes('/gun') || url.startsWith('wss://') || url.startsWith('ws://');
const isApiRequest = (pathname) => pathname.startsWith('/api/');

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (isGunRealtime(url.href) || isApiRequest(url.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, HTML_CACHE, scopeAsset('index.html')));
    return;
  }

  if (['style', 'script'].includes(request.destination)) {
    event.respondWith(networkFirst(request, STATIC_CACHE, request));
    return;
  }

  if (['image', 'font'].includes(request.destination)) {
    staleWhileRevalidate(event, STATIC_CACHE);
    return;
  }

  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
