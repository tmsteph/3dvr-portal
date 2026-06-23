/* service-worker.js */

importScripts('/chat/notification-routing.js');

// Increment this to bust old caches when you deploy
const CACHE_VERSION = 'v17';
const STATIC_CACHE = `3dvr-static-${CACHE_VERSION}`;
const HTML_CACHE = `3dvr-html-${CACHE_VERSION}`;
const chatNotificationRouting = self.ChatNotificationRouting || null;

// What to cache at install (add your CSS/JS/assets here). Keep HTML out of the
// install cache so stale app shells cannot survive a deploy.
const STATIC_ASSETS = [
  '/index-style.css',
  '/styles/global.css',
  '/home/style.css',
  '/home/script.js',
  '/style.css?v=notes-refresh-20240204',
  '/navbar.js',
  '/score.js',
  '/pwa-install.js',
  '/chat/notification-routing.js',
  '/styles/install-banner.css',
  '/manifest.webmanifest',
  '/seated-spine-reset/',
  '/seated-spine-reset/index.html',
  '/seated-spine-reset/styles.css',
  '/seated-spine-reset/app.js',
  '/seated-spine-reset/manifest.webmanifest',
  '/brand/portal-logo.svg',
  '/app-manifests/chat.webmanifest',
  '/app-manifests/tasks.webmanifest',
  '/app-manifests/notes.webmanifest',
  '/app-manifests/calendar.webmanifest',
  '/app-manifests/contacts.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png'
];

const createReloadedRequests = (assets) =>
  assets.map((asset) => new Request(asset, { cache: 'reload' }));

const SECURITY_CHECKPOINT_PATTERN = /Vercel Security Checkpoint|Failed to verify your browser|We(?:'|’)?re (?:verifying|checking) your browser|Code\s*(?:705|805)/i;

const createOfflinePortalFallbackResponse = () => new Response(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>3DVR Portal offline</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #0d1117;
      color: #e6edf3;
      font-family: Arial, Helvetica, sans-serif;
      line-height: 1.5;
    }
    main {
      width: min(92vw, 440px);
      border: 1px solid #30363d;
      border-radius: 12px;
      background: #161b22;
      padding: 24px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
    }
    h1 { margin: 0 0 8px; font-size: 1.4rem; }
    p { margin: 0 0 18px; color: #9ba3b4; }
    a {
      display: inline-block;
      border-radius: 999px;
      background: #58a6ff;
      color: #07111f;
      font-weight: 700;
      padding: 10px 14px;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <main>
    <h1>Open the portal again</h1>
    <p>The browser could not refresh the portal shell. Reconnect or reload to get a fresh copy.</p>
    <a href="/">Reload portal</a>
  </main>
</body>
</html>`, {
  headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  }
});

const shouldCacheHtmlResponse = (response) => {
  if (!response || !response.ok) return false;
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('text/html');
};

const cacheHtmlResponse = async (request, response) => {
  if (!shouldCacheHtmlResponse(response)) return;

  const responseForCache = response.clone();
  const responseForInspection = response.clone();
  const text = await responseForInspection.text();

  if (SECURITY_CHECKPOINT_PATTERN.test(text)) {
    return;
  }

  const cache = await caches.open(HTML_CACHE);
  await cache.put(request, responseForCache);
};

const getCachedHtmlFallback = async (request) => {
  const cached = await caches.match(request, { ignoreSearch: true });
  return cached || createOfflinePortalFallbackResponse();
};

const networkFirstHtml = async (request) => {
  const fresh = await fetch(request, { cache: 'reload' });
  const contentType = fresh.headers.get('content-type') || '';

  if (contentType.includes('text/html')) {
    const responseForInspection = fresh.clone();
    const text = await responseForInspection.text();

    if (SECURITY_CHECKPOINT_PATTERN.test(text)) {
      return getCachedHtmlFallback(request);
    }

    if (fresh.ok) {
      const cache = await caches.open(HTML_CACHE);
      await cache.put(request, fresh.clone());
    }
  }

  return fresh;
};

const networkFirst = async (req, { cacheMode = 'default' } = {}) => {
  try {
    const fresh = await fetch(req, { cache: cacheMode });
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
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.allSettled(
        assetsToCache.map(async (request) => {
          const response = await fetch(request);
          if (response && (response.ok || response.type === 'opaque')) {
            await cache.put(request, response);
          }
        })
      )
    )
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
const isHTML = (req) => req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html');
const isGunRealtime = (url) => url.includes('/gun') || url.startsWith('wss://') || url.startsWith('ws://');
const isAPI = (url) => url.includes('/api/'); // adjust if you add APIs
const isStyleRequest = (req) => req.destination === 'style';
const isScriptRequest = (req) => req.destination === 'script';
const isChatClientUrl = (clientUrl) => {
  try {
    const url = new URL(clientUrl);
    return url.origin === self.location.origin &&
      (url.pathname === '/chat/' || url.pathname === '/chat/index.html');
  } catch (error) {
    return false;
  }
};

function buildChatNotificationTarget(data = {}) {
  const room = chatNotificationRouting && typeof chatNotificationRouting.normalizeRoomName === 'function'
    ? chatNotificationRouting.normalizeRoomName(data.room)
    : (typeof data.room === 'string' ? data.room : 'general');
  const messageId = chatNotificationRouting && typeof chatNotificationRouting.normalizeMessageId === 'function'
    ? chatNotificationRouting.normalizeMessageId(data.messageId)
    : (typeof data.messageId === 'string' ? data.messageId.trim() : '');
  const url = typeof data.url === 'string' && data.url.trim()
    ? data.url.trim()
    : (
        chatNotificationRouting && typeof chatNotificationRouting.buildChatNotificationUrl === 'function'
          ? chatNotificationRouting.buildChatNotificationUrl({ room, messageId })
          : '/chat/'
      );

  return { room, messageId, url };
}

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
    event.respondWith(networkFirst(req, { cacheMode: 'reload' }));
    return;
  }

  if (isScriptRequest(req)) {
    event.respondWith(networkFirst(req, { cacheMode: 'reload' }));
    return;
  }

  if (isHTML(req)) {
    // Network-first for HTML for freshness
    event.respondWith(
      networkFirstHtml(req).catch(() => getCachedHtmlFallback(req))
    );
    return;
  }

  if (['image', 'font'].includes(req.destination)) {
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
  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
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
  const target = buildChatNotificationTarget(event.notification?.data || {});
  const targetUrl = target.url || '/chat/';

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });

    for (const client of allClients) {
      if (!isChatClientUrl(client.url)) {
        continue;
      }

      if ('navigate' in client) {
        try {
          await client.navigate(targetUrl);
        } catch (error) {
          console.error('Service worker failed to navigate chat client', error);
        }
      }

      if ('postMessage' in client) {
        client.postMessage({
          type: 'notification-clicked',
          payload: target
        });
      }

      if ('focus' in client) {
        return client.focus();
      }
    }

    if (clients.openWindow) {
      return clients.openWindow(targetUrl);
    }
  })());
});
