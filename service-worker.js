/* service-worker.js */

// Increment this to bust old caches when you deploy
const CACHE_VERSION = 'v3';
const STATIC_CACHE = `3dvr-static-${CACHE_VERSION}`;
const HTML_CACHE = `3dvr-html-${CACHE_VERSION}`;

// What to cache at install (add your CSS/JS/assets here)
const STATIC_ASSETS = [
  '/',                     // App shell (Start URL)
  '/index-style.css',
  '/styles/global.css',
  '/navbar.js',
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

  // Cache-first for static assets
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const resClone = res.clone();
        // Optionally restrict what gets cached
        if (['script', 'style', 'image', 'font'].includes(req.destination)) {
          caches.open(STATIC_CACHE).then((cache) => cache.put(req, resClone));
        }
        return res;
      });
    })
  );
});
