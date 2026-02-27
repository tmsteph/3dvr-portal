/* contacts/service-worker.js */

const CACHE_VERSION = 'v2';
const STATIC_CACHE = `contacts-static-${CACHE_VERSION}`;
const HTML_CACHE = `contacts-html-${CACHE_VERSION}`;
const SCOPE_URL = new URL(self.registration.scope);
const scopeAsset = (asset = '') => new URL(asset, SCOPE_URL).pathname;

const STATIC_ASSETS = [
  scopeAsset(''),
  scopeAsset('index.html'),
  scopeAsset('contacts-core.js'),
  scopeAsset('gun-init.js'),
  scopeAsset('auth-identity.js'),
  scopeAsset('score.js'),
  scopeAsset('pwa-install.js'),
  scopeAsset('install-banner.css'),
  scopeAsset('contacts.webmanifest'),
  scopeAsset('icons/icon-192.png'),
  scopeAsset('icons/icon-512.png'),
  scopeAsset('icons/maskable-512.png')
];

const createReloadedRequests = (assets) =>
  assets.map((asset) => new Request(asset, { cache: 'reload' }));

const networkFirst = async (request, cacheName, fallbackUrl = null) => {
  try {
    const fresh = await fetch(request, { cache: 'reload' });
    if (fresh && fresh.ok) {
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
        const isContactsCache = key.startsWith('contacts-static-') || key.startsWith('contacts-html-');
        if (isContactsCache && ![STATIC_CACHE, HTML_CACHE].includes(key)) {
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

  if (['style', 'script', 'image', 'font'].includes(request.destination)) {
    staleWhileRevalidate(event, STATIC_CACHE);
    return;
  }

  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
