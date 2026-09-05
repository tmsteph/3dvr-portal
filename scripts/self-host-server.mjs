import { createServer } from 'node:http';
import { access, readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import openAiSiteHandler from '../api/openai-site.js';
import { runNativeApi } from './self-host-api-router.mjs';
import workboardGithubHandler from '../src/workboard/github-feed.js';
import { createOAuthProviderHandler } from '../src/oauth/provider-api.js';
import { createOrganismBridgeHandler } from '../src/organism/bridge.js';

const PORT = Number(process.env.PORT || 4320);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = resolve(process.env.PORTAL_ROOT || process.cwd());
const RELEASE_SHA = String(process.env.PORTAL_RELEASE_SHA || '').trim();
const RELEASE_REF = String(process.env.PORTAL_RELEASE_REF || 'main').trim();
const LEGACY_API_ORIGIN = String(process.env.LEGACY_API_ORIGIN || '').replace(/\/+$/, '');
const oauthProviderHandler = createOAuthProviderHandler();
const organismBridgeHandler = createOrganismBridgeHandler();

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
  ['.jpg', 'image/jpg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.txt', 'text/plain; charset=utf-8']
]);

const PRIVATE_PREFIXES = [
  '/.github/', '/api/', '/src/', '/scripts/', '/tests/', '/ops/', '/node_modules/', '/apps/agent/'
];
const PRIVATE_ROOT_FILES = new Set([
  '/package.json', '/package-lock.json', '/vercel.json', '/AGENTS.md', '/.gitignore'
]);

function isPrivateStaticPath(pathname) {
  const clean = String(pathname || '/');
  return PRIVATE_ROOT_FILES.has(clean)
    || PRIVATE_PREFIXES.some(prefix => clean === prefix.slice(0, -1) || clean.startsWith(prefix));
}

function applyBaseHeaders(res, pathname = '') {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (pathname.endsWith('service-worker.js') || pathname.endsWith('pwa-install.js')) {
    res.setHeader('Cache-Control', 'no-cache');
  } else if (/\.(png|jpg|jpeg|gif|svg|webp|woff2?)$/i.test(pathname)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  }
}

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function safePath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname || '/');
  } catch {
    return null;
  }
  const clean = decoded.replace(/^\/+/, '').replace(/\.\.(\/|\\|$)/g, '');
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
      return { path: indexPath, redirect: pathname.endsWith('/') ? null : `${pathname}/` };
    }
    return { path: candidate, redirect: null };
  } catch {
    const indexPath = join(candidate, 'index.html');
    try {
      await access(indexPath);
      return { path: indexPath, redirect: pathname.endsWith('/') ? null : `${pathname}/` };
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
    if (size > maxBytes) throw Object.assign(new Error('Request body too large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function prepareApiRequest(req, url) {
  const raw = await readRequestBody(req);
  if (!raw.length) req.body = {};
  else {
    try { req.body = JSON.parse(raw.toString('utf8')); }
    catch { throw Object.assign(new Error('Invalid JSON request body'), { statusCode: 400 }); }
  }
  req.query = Object.fromEntries(url.searchParams.entries());
}

function adaptResponse(res) {
  res.status = code => { res.statusCode = code; return res; };
  res.json = payload => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
    return res;
  };
  return res;
}

async function runOpenAiSite(req, res, url) {
  try {
    if (req.method !== 'OPTIONS') await prepareApiRequest(req, url);
    else { req.body = {}; req.query = Object.fromEntries(url.searchParams.entries()); }
    await openAiSiteHandler(req, adaptResponse(res));
  } catch (error) {
    if (!res.headersSent) json(res, error?.statusCode || 500, { error: error?.message || 'API request failed' });
    else res.destroy(error);
  }
}

async function runOrganismRecall(req, res, url) {
  try {
    await prepareApiRequest(req, url);
    await organismBridgeHandler(req, adaptResponse(res));
  } catch (error) {
    if (!res.headersSent) json(res, error?.statusCode || 500, { ok: false, error: error?.message || 'Digital Organism request failed' });
    else res.destroy(error);
  }
}

async function runWorkboardGithub(req, res, url) {
  try {
    req.query = Object.fromEntries(url.searchParams.entries());
    await workboardGithubHandler(req, adaptResponse(res));
  } catch (error) {
    if (!res.headersSent) json(res, error?.statusCode || 500, { error: error?.message || 'Workboard GitHub feed failed' });
    else res.destroy(error);
  }
}

async function runOAuthProvider(req, res, url) {
  try {
    if (req.method !== 'OPTIONS') await prepareApiRequest(req, url);
    else { req.body = {}; req.query = Object.fromEntries(url.searchParams.entries()); }
    const parts = url.pathname.split('/').filter(Boolean);
    const provider = decodeURIComponent(parts[parts.length - 1] || '');
    req.query = { ...(req.query || {}), provider };
    await oauthProviderHandler(req, adaptResponse(res));
  } catch (error) {
    if (!res.headersSent) json(res, error?.statusCode || 500, { error: error?.message || 'OAuth request failed' });
    else res.destroy(error);
  }
}

async function proxyLegacyApi(req, res, url) {
  if (!LEGACY_API_ORIGIN) return json(res, 404, { error: 'API route is not enabled on this self-host yet.' });
  const target = new URL(url.pathname + url.search, `${LEGACY_API_ORIGIN}/`);
  const body = ['GET', 'HEAD'].includes(req.method || '') ? undefined : await readRequestBody(req);
  let upstream;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers: {
        'content-type': req.headers['content-type'] || 'application/json',
        'accept': req.headers.accept || '*/*'
      },
      body
    });
  } catch (error) {
    return json(res, 502, { error: 'Legacy API fallback unavailable', detail: error?.message || String(error) });
  }
  res.statusCode = upstream.status;
  for (const name of ['content-type', 'cache-control', 'location']) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  const buffer = Buffer.from(await upstream.arrayBuffer());
  res.end(buffer);
}

function rewriteForHost(url, host) {
  const hostname = String(host || '').split(':')[0].toLowerCase();
  if (url.pathname === '/api/cache-reset') return '/cache-reset.html';
  if (url.pathname === '/' && hostname === 'crm.3dvr.tech') return '/crm/index.html';
  if (url.pathname === '/' && hostname === 'purpose.3dvr.tech') return '/purpose/index.html';
  if (url.pathname === '/' && hostname === 'growth.3dvr.tech') return '/growth-desk/index.html';
  if (url.pathname === '/' && hostname === 'danny.3dvr.tech') return '/danny/index.html';
  for (const [subdomain, prefix] of [['thomas-av.3dvr.tech','/thomas-av'], ['thomas-cs.3dvr.tech','/thomas-cs'], ['wenzo.3dvr.tech','/wenzo']]) {
    if (hostname === subdomain) return `${prefix}${url.pathname === '/' ? '/index.html' : url.pathname}`;
  }
  return url.pathname;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);
  applyBaseHeaders(res, url.pathname);

  if (url.pathname === '/__3dvr-health') {
    return json(res, 200, { ok: true, host: 'self', sha: RELEASE_SHA, ref: RELEASE_REF, operatorApi: 'native', organismRecall: 'signed-owner' });
  }

  if (url.pathname === '/health' || url.pathname === '/recall') {
    return runOrganismRecall(req, res, url);
  }

  if (url.pathname === '/api/openai-site') {
    return runOpenAiSite(req, res, url);
  }

  if (url.pathname === '/api/workboard/github') {
    return runWorkboardGithub(req, res, url);
  }

  if (url.pathname.startsWith('/api/oauth/')) {
    return runOAuthProvider(req, res, url);
  }

  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/webhooks/')) {
    const handled = await runNativeApi(req, res, url);
    if (handled) return;
    return proxyLegacyApi(req, res, url);
  }

  if (!['GET', 'HEAD'].includes(req.method || '')) return json(res, 405, { error: 'Method Not Allowed' });

  const pathname = rewriteForHost(url, req.headers.host);
  if (isPrivateStaticPath(pathname)) return json(res, 404, { error: 'Not found' });

  const found = await findFile(pathname);
  if (!found) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Not found');
  }

  if (found.redirect) {
    res.statusCode = 308;
    res.setHeader('Location', `${found.redirect}${url.search}`);
    return res.end();
  }

  try {
    const body = await readFile(found.path);
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME_TYPES.get(extname(found.path).toLowerCase()) || 'application/octet-stream');
    if (pathname.endsWith('service-worker.js')) res.setHeader('Service-Worker-Allowed', '/');
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    json(res, 500, { error: error?.message || 'Failed to read file' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`3DVR self-host ${RELEASE_SHA || 'unknown'} listening on http://${HOST}:${PORT}`);
});