import { createServer } from 'node:http';
import { access, readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = resolve(process.cwd());

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.htm', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.ico', 'image/x-icon'],
  ['.txt', 'text/plain; charset=utf-8']
]);

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function getMimeType(filePath) {
  return MIME_TYPES.get(extname(filePath).toLowerCase()) || 'application/octet-stream';
}

async function resolveFile(requestPath) {
  const safePath = decodeURIComponent(requestPath || '/')
    .replace(/^\/+/, '')
    .replace(/\.\.(\/|\\|$)/g, '');
  const candidate = normalize(join(ROOT, safePath || ''));

  if (!candidate.startsWith(ROOT)) {
    return null;
  }

  try {
    const fileStat = await stat(candidate);
    if (fileStat.isDirectory()) {
      const indexPath = join(candidate, 'index.html');
      await access(indexPath);
      return indexPath;
    }
    return candidate;
  } catch {
    const indexPath = join(candidate, 'index.html');
    try {
      await access(indexPath);
      return indexPath;
    } catch {
      return null;
    }
  }
}

const server = createServer(async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  const urlPath = new URL(req.url || '/', `http://${HOST}:${PORT}`).pathname;
  const filePath = await resolveFile(urlPath === '/' ? '/index.html' : urlPath);

  if (!filePath) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not found');
    return;
  }

  try {
    const body = await readFile(filePath);
    res.statusCode = 200;
    res.setHeader('Content-Type', getMimeType(filePath));
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: error?.message || 'Failed to read file.' }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`3dvr-portal dev server running at http://${HOST}:${PORT}`);
});
