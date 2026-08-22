import { createServer } from 'node:http';
import { access, readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const PORT = Number(process.env.PORT || 4310);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = resolve(process.env.PREVIEW_ROOT || process.cwd());
const PREVIEW_SHA = String(process.env.PREVIEW_SHA || '').trim();
const PREVIEW_REF = String(process.env.PREVIEW_REF || '').trim();
const PRODUCTION_ORIGIN = String(process.env.PREVIEW_PRODUCTION_ORIGIN || 'https://portal.3dvr.tech').replace(/\/+$/, '');

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.htm', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.txt', 'text/plain; charset=utf-8']
]);

function setPreviewHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-3DVR-Preview-Sha', PREVIEW_SHA);
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  setPreviewHeaders(res);
  res.end(JSON.stringify(payload));
}

function safePath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname || '/');
  } catch {
    return null;
  }

  const clean = decoded
    .replace(/^\/+/, '')
    .replace(/\.\.(\/|\\|$)/g, '');
  const candidate = normalize(join(ROOT, clean || 'index.html'));
  return candidate.startsWith(ROOT) ? candidate : null;
}

async function findFile(pathname) {
  const candidate = safePath(pathname === '/' ? '/index.html' : pathname);
  if (!candidate) return null;

  try {
    const fileStat = await stat(candidate);
    if (fileStat.isDirectory()) {
      const indexPath = join(candidate, 'index.html');
      await access(indexPath);
      return {
        path: indexPath,
        redirect: pathname.endsWith('/') ? null : `${pathname}/`
      };
    }
    return { path: candidate, redirect: null };
  } catch {
    const indexPath = join(candidate, 'index.html');
    try {
      await access(indexPath);
      return {
        path: indexPath,
        redirect: pathname.endsWith('/') ? null : `${pathname}/`
      };
    } catch {
      return null;
    }
  }
}

async function readRequestBody(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error('Preview request body too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function isOperatorApi(url) {
  return url.pathname === '/api/openai-site' && url.searchParams.get('provider') === 'operator';
}

async function proxyOperatorApi(req, res, url) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    setPreviewHeaders(res);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  let body;
  try {
    body = await readRequestBody(req);
  } catch (error) {
    json(res, error?.statusCode || 400, { error: error?.message || 'Invalid request body' });
    return;
  }

  const upstreamUrl = new URL('/api/openai-site', `${PRODUCTION_ORIGIN}/`);
  upstreamUrl.search = url.search;

  let upstream;
  try {
    upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        'Accept': req.headers.accept || 'application/json'
      },
      body
    });
  } catch (error) {
    json(res, 502, { error: 'Production Operator API unavailable', detail: error?.message || String(error) });
    return;
  }

  res.statusCode = upstream.status;
  for (const headerName of ['content-type', 'cache-control']) {
    const value = upstream.headers.get(headerName);
    if (value) res.setHeader(headerName, value);
  }
  setPreviewHeaders(res);

  if (!upstream.body) {
    res.end();
    return;
  }

  try {
    const reader = upstream.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (error) {
    if (!res.headersSent) {
      json(res, 502, { error: 'Failed while streaming Operator response' });
    } else {
      res.destroy(error);
    }
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (url.pathname === '/__3dvr-preview') {
    json(res, 200, {
      ok: true,
      sha: PREVIEW_SHA,
      ref: PREVIEW_REF,
      productionApi: PRODUCTION_ORIGIN
    });
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    if (isOperatorApi(url)) {
      await proxyOperatorApi(req, res, url);
      return;
    }
    json(res, 404, { error: 'API route is not enabled in machine previews' });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    json(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  const found = await findFile(url.pathname);
  if (!found) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    setPreviewHeaders(res);
    res.end('Not found');
    return;
  }

  if (found.redirect) {
    res.statusCode = 308;
    res.setHeader('Location', `${found.redirect}${url.search}`);
    setPreviewHeaders(res);
    res.end();
    return;
  }

  try {
    const body = await readFile(found.path);
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME_TYPES.get(extname(found.path).toLowerCase()) || 'application/octet-stream');
    setPreviewHeaders(res);
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    json(res, 500, { error: error?.message || 'Failed to read preview file' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`3DVR preview ${PREVIEW_SHA || 'unknown'} running at http://${HOST}:${PORT}`);
});
