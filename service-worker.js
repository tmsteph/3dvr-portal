/* service-worker.js */

// Increment this to bust old caches when you deploy
const CACHE_VERSION = 'v6';
const STATIC_CACHE = `3dvr-static-${CACHE_VERSION}`;
const HTML_CACHE = `3dvr-html-${CACHE_VERSION}`;

// What to cache at install (add your CSS/JS/assets here)
const STATIC_ASSETS = [
  '/',                     // App shell (Start URL)
  '/index-style.css',
  '/styles/global.css',
  '/style.css?v=notes-refresh-20240204',
  '/navbar.js',
  '/score.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png'
];

const createReloadedRequests = (assets) =>
  assets.map((asset) => new Request(asset, { cache: 'reload' }));

const networkFirst = async (req) => {
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (error) {
    const cached = await caches.match(req);
    if (cached) return cached;
    throw error;
  }
};

const staleWhileRevalidate = (event, cacheName) => {
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(event.request);

    const fetchPromise = fetch(event.request, { cache: 'reload' })
      .then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          cache.put(event.request, res.clone());
        }
        return res;
      })
      .catch(() => null);

    if (cached) {
      event.waitUntil(fetchPromise);
      return cached;
    }

    const fresh = await fetchPromise;
    if (fresh) return fresh;

    const fallback = await cache.match(event.request);
    if (fallback) return fallback;

    return Response.error();
  })());
};

self.addEventListener('install', (event) => {
  const assetsToCache = createReloadedRequests(STATIC_ASSETS);

  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(assetsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => {
        if (![STATIC_CACHE, HTML_CACHE].includes(k)) return caches.delete(k);
      }))
    )
  );
  self.clients.claim();
});

// Simple helpers
const isHTML = (req) => req.headers.get('accept')?.includes('text/html');
const isGunRealtime = (url) => url.includes('/gun') || url.startsWith('wss://') || url.startsWith('ws://');
const isAPI = (url) => url.includes('/api/'); // adjust if you add APIs
const isStyleRequest = (req) => req.destination === 'style';

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET
  if (req.method !== 'GET') return;

  // Don’t touch Gun/WebSocket or dynamic APIs
  if (isGunRealtime(url.href) || req.destination === 'websocket' || isAPI(url.pathname)) {
    return; // let network handle it
  }

  if (isStyleRequest(req)) {
    event.respondWith(networkFirst(req));
    return;
  }

  if (isHTML(req)) {
    // Network-first for HTML for freshness
    event.respondWith(
      fetch(req).then((res) => {
        const resClone = res.clone();
        caches.open(HTML_CACHE).then((cache) => cache.put(req, resClone));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  if (['script', 'image', 'font'].includes(req.destination)) {
    staleWhileRevalidate(event, STATIC_CACHE);
    return;
  }

  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  const { type, payload } = data;
  if (type !== 'show-notification') return;

  const title = payload?.title;
  const options = payload?.options || {};
  if (!title) return;

  self.registration.showNotification(title, options).catch((error) => {
    console.error('Service worker failed to display notification', error);
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/chat.html';

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      if (client.url.includes(targetUrl) && 'focus' in client) {
        client.postMessage({ type: 'notification-clicked' });
        return client.focus();
      }
    }

    if (clients.openWindow) {
      return clients.openWindow(targetUrl);
    }
  })());
});
