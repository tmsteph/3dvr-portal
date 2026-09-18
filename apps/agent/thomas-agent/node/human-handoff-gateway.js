'use strict';

const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const { execFile } = require('node:child_process');
const { appendFile, chmod, mkdir, readFile, writeFile } = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const LEASE_BIN = '/usr/local/bin/3dvr-browser-lease';
const LANE_PORTS = { general: 9222, encore: 9333, messaging: 9444, training: 9555 };
const TTL_MS = Math.max(60_000, Number(process.env.HANDOFF_TTL_MS) || 300_000);
const LEASE_TTL_SECONDS = Math.ceil(TTL_MS / 1000) + 90;
const PUBLIC_BASE = (process.env.HANDOFF_PUBLIC_BASE || 'https://portal.3dvr.tech/human-handoff/').replace(/\/+$/, '/');
const STATIC_DIR = path.resolve(__dirname, '../../../../human-handoff');
const STATE_DIR = process.env.HANDOFF_STATE_DIR || path.join(os.homedir(), '.local/state/3dvr/human-handoff');
const SECRET_FILE = process.env.HANDOFF_ADMIN_SECRET_FILE || path.join(os.homedir(), '.config/3dvr/handoff-gateway/admin.secret');

function hashToken(value = '') {
  return createHash('sha256').update(String(value)).digest('hex');
}

function safeEqual(left = '', right = '') {
  const a = createHash('sha256').update(String(left)).digest();
  const b = createHash('sha256').update(String(right)).digest();
  return timingSafeEqual(a, b);
}

function targetMatchesOrigin(targetUrl, requestedOrigin) {
  try {
    return new URL(targetUrl).origin === new URL(requestedOrigin).origin;
  } catch {
    return false;
  }
}

function json(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': data.length,
    'cache-control': 'no-store',
  });
  res.end(data);
}

async function readJson(req, maxBytes = 16 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('Request body too large.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

async function ensureAdminSecret() {
  try {
    return (await readFile(SECRET_FILE, 'utf8')).trim();
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await mkdir(path.dirname(SECRET_FILE), { recursive: true, mode: 0o700 });
  const value = randomBytes(32).toString('base64url');
  await writeFile(SECRET_FILE, `${value}\n`, { mode: 0o600 });
  await chmod(SECRET_FILE, 0o600).catch(() => {});
  return value;
}

async function audit(event, handoff) {
  await mkdir(STATE_DIR, { recursive: true, mode: 0o700 });
  const record = {
    at: new Date().toISOString(),
    event,
    handoffId: handoff.id,
    lane: handoff.lane,
    service: handoff.serviceName,
    state: handoff.state,
  };
  await appendFile(path.join(STATE_DIR, 'audit.jsonl'), `${JSON.stringify(record)}\n`, { mode: 0o600 });
}

async function lease(action, ...args) {
  const result = await execFileAsync('/usr/bin/sudo', ['-n', LEASE_BIN, action, ...args.map(String)], {
    timeout: 8_000,
    maxBuffer: 16 * 1024,
  });
  return String(result.stdout || '').trim();
}

async function browserTargets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3_000) });
  if (!response.ok) throw new Error(`Browser target listing failed (${response.status}).`);
  return response.json();
}

async function selectTarget(lane, origin) {
  const port = LANE_PORTS[lane];
  if (!port) throw new Error('Unknown browser lane.');
  const targets = await browserTargets(port);
  const pages = targets.filter(target => target.type === 'page' && target.webSocketDebuggerUrl);
  const target = pages.find(candidate => targetMatchesOrigin(candidate.url, origin));
  if (!target) throw new Error(`No open browser tab matches ${new URL(origin).origin} on lane ${lane}.`);
  return target;
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    if (this.socket?.readyState === WebSocket.OPEN) return;
    const socket = new WebSocket(this.url);
    this.socket = socket;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP connection timed out.')), 5_000);
      socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('CDP connection failed.'));
      }, { once: true });
    });
    socket.addEventListener('message', event => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!message.id || !this.pending.has(message.id)) return;
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || 'CDP command failed.'));
      else pending.resolve(message.result || {});
    });
    socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) pending.reject(new Error('CDP connection closed.'));
      this.pending.clear();
    });
    await this.send('Page.enable');
  }

  send(method, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error('CDP is not connected.');
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 8_000);
      this.pending.set(id, {
        resolve: value => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: error => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try {
      this.socket?.close();
    } catch {}
  }
}

function createGateway() {
  const handoffs = new Map();
  const initialIndex = new Map();
  const sessionIndex = new Map();

  function activeOrThrow(handoff) {
    if (!handoff) throw Object.assign(new Error('Handoff not found.'), { statusCode: 401 });
    if (Date.now() >= handoff.expiresAt) throw Object.assign(new Error('Handoff expired.'), { statusCode: 410 });
    if (!['needs_human', 'human_active'].includes(handoff.state)) {
      throw Object.assign(new Error('Handoff is no longer active.'), { statusCode: 410 });
    }
    return handoff;
  }

  async function releaseHandoff(handoff, state) {
    if (!handoff || !['needs_human', 'human_active'].includes(handoff.state)) return handoff;
    handoff.state = state;
    initialIndex.delete(handoff.initialHash);
    if (handoff.sessionHash) sessionIndex.delete(handoff.sessionHash);
    handoff.client?.close();
    handoff.client = null;
    const token = handoff.leaseToken;
    handoff.leaseToken = null;
    if (token) await lease('release', handoff.lane, token);
    await audit(state, handoff);
    return handoff;
  }

  async function createHandoff(options = {}) {
    const lane = String(options.lane || 'general');
    const origin = String(options.origin || '').trim();
    const serviceName = String(options.serviceName || 'Website').trim().slice(0, 80);
    const reason = String(options.reason || 'A human-only step needs your attention.').trim().slice(0, 240);
    if (!LANE_PORTS[lane]) throw new Error('Unsupported browser lane.');
    if (!/^https?:\/\//i.test(origin)) throw new Error('A valid target origin is required.');

    const target = await selectTarget(lane, origin);
    const id = randomBytes(12).toString('base64url');
    const owner = `human-handoff:${id}`;
    const leaseToken = await lease('acquire', lane, owner, LEASE_TTL_SECONDS);
    const client = new CdpClient(target.webSocketDebuggerUrl);
    try {
      await client.connect();
    } catch (error) {
      await lease('release', lane, leaseToken).catch(() => {});
      throw error;
    }

    const initialToken = randomBytes(32).toString('base64url');
    const handoff = {
      id,
      lane,
      origin: new URL(origin).origin,
      serviceName,
      reason,
      state: 'needs_human',
      createdAt: Date.now(),
      expiresAt: Date.now() + TTL_MS,
      initialHash: hashToken(initialToken),
      sessionHash: '',
      leaseToken,
      targetId: target.id,
      client,
    };
    handoffs.set(id, handoff);
    initialIndex.set(handoff.initialHash, id);
    await audit('created', handoff);
    return {
      id,
      url: `${PUBLIC_BASE}#${initialToken}`,
      expiresAt: new Date(handoff.expiresAt).toISOString(),
    };
  }

  function fromInitial(token) {
    const id = initialIndex.get(hashToken(token));
    return id ? handoffs.get(id) : null;
  }

  function fromSession(token) {
    const id = sessionIndex.get(hashToken(token));
    return id ? handoffs.get(id) : null;
  }

  async function preview(token) {
    const handoff = activeOrThrow(fromInitial(token));
    return {
      serviceName: handoff.serviceName,
      reason: handoff.reason,
      expiresAt: new Date(handoff.expiresAt).toISOString(),
    };
  }

  async function open(token) {
    const handoff = activeOrThrow(fromInitial(token));
    if (handoff.state !== 'needs_human') throw Object.assign(new Error('Handoff already opened.'), { statusCode: 409 });
    initialIndex.delete(handoff.initialHash);
    const sessionToken = randomBytes(32).toString('base64url');
    handoff.sessionHash = hashToken(sessionToken);
    sessionIndex.set(handoff.sessionHash, handoff.id);
    handoff.state = 'human_active';
    await audit('opened', handoff);
    return {
      sessionToken,
      serviceName: handoff.serviceName,
      reason: handoff.reason,
      expiresAt: new Date(handoff.expiresAt).toISOString(),
    };
  }

  async function frame(token) {
    const handoff = activeOrThrow(fromSession(token));
    if (handoff.state !== 'human_active') throw Object.assign(new Error('Handoff is not open.'), { statusCode: 409 });
    const result = await handoff.client.send('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 72,
      fromSurface: true,
      captureBeyondViewport: false,
    });
    return Buffer.from(result.data, 'base64');
  }

  async function input(token, action = {}) {
    const handoff = activeOrThrow(fromSession(token));
    if (handoff.state !== 'human_active') throw Object.assign(new Error('Handoff is not open.'), { statusCode: 409 });
    const kind = String(action.type || '');
    const x = Math.max(0, Math.min(5000, Number(action.x) || 0));
    const y = Math.max(0, Math.min(5000, Number(action.y) || 0));

    if (kind === 'click') {
      await handoff.client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await handoff.client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    } else if (kind === 'scroll') {
      const deltaY = Math.max(-2000, Math.min(2000, Number(action.deltaY) || 0));
      await handoff.client.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
    } else if (kind === 'text') {
      await handoff.client.send('Input.insertText', { text: String(action.text || '').slice(0, 1000) });
    } else if (kind === 'key') {
      const allowed = new Set(['Enter', 'Tab', 'Backspace', 'Escape']);
      const key = String(action.key || '');
      if (!allowed.has(key)) throw Object.assign(new Error('Unsupported key.'), { statusCode: 400 });
      await handoff.client.send('Input.dispatchKeyEvent', { type: 'keyDown', key });
      await handoff.client.send('Input.dispatchKeyEvent', { type: 'keyUp', key });
    } else {
      throw Object.assign(new Error('Unsupported input action.'), { statusCode: 400 });
    }
    return { ok: true };
  }

  async function resolve(token) {
    const handoff = activeOrThrow(fromSession(token));
    await releaseHandoff(handoff, 'resolved');
    return { ok: true, handoffId: handoff.id, state: handoff.state, resumeRequiresFreshLease: true };
  }

  async function cancel(token) {
    const handoff = activeOrThrow(fromSession(token));
    await releaseHandoff(handoff, 'cancelled');
    return { ok: true, handoffId: handoff.id, state: handoff.state };
  }

  async function renewActive() {
    for (const handoff of handoffs.values()) {
      if (!['needs_human', 'human_active'].includes(handoff.state) || !handoff.leaseToken) continue;
      if (Date.now() >= handoff.expiresAt) {
        await releaseHandoff(handoff, 'expired').catch(() => {});
        continue;
      }
      try {
        await lease('renew', handoff.lane, handoff.leaseToken, LEASE_TTL_SECONDS);
      } catch {
        handoff.state = 'lease_lost';
        initialIndex.delete(handoff.initialHash);
        if (handoff.sessionHash) sessionIndex.delete(handoff.sessionHash);
        handoff.client?.close();
        handoff.client = null;
        handoff.leaseToken = null;
        await audit('lease_lost', handoff).catch(() => {});
      }
    }
  }

  function status(id) {
    const handoff = handoffs.get(String(id || ''));
    if (!handoff) return null;
    return {
      id: handoff.id,
      lane: handoff.lane,
      serviceName: handoff.serviceName,
      state: handoff.state,
      createdAt: new Date(handoff.createdAt).toISOString(),
      expiresAt: new Date(handoff.expiresAt).toISOString(),
    };
  }

  return { createHandoff, preview, open, frame, input, resolve, cancel, renewActive, status };
}

function bearer(req) {
  const value = String(req.headers.authorization || '');
  return /^Bearer\s+/i.test(value) ? value.replace(/^Bearer\s+/i, '').trim() : '';
}

async function serveStatic(req, res) {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = pathname === '/human-handoff/' || pathname === '/human-handoff'
    ? 'index.html'
    : pathname.replace('/human-handoff/', '');
  if (!['index.html', 'app.js', 'styles.css'].includes(file)) return false;
  const body = await readFile(path.join(STATIC_DIR, file));
  const type = file.endsWith('.js')
    ? 'text/javascript; charset=utf-8'
    : file.endsWith('.css')
      ? 'text/css; charset=utf-8'
      : 'text/html; charset=utf-8';
  res.writeHead(200, {
    'content-type': type,
    'content-length': body.length,
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  });
  res.end(body);
  return true;
}

async function startServer() {
  const gateway = createGateway();
  const adminSecret = await ensureAdminSecret();
  const host = process.env.HANDOFF_BIND || '127.0.0.1';
  const port = Number(process.env.HANDOFF_PORT) || 4312;

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && await serveStatic(req, res)) return;
      const pathname = new URL(req.url, 'http://localhost').pathname;

      if (pathname === '/human-handoff/api/preview' && req.method === 'POST') {
        const body = await readJson(req);
        return json(res, 200, await gateway.preview(body.token));
      }
      if (pathname === '/human-handoff/api/open' && req.method === 'POST') {
        const body = await readJson(req);
        return json(res, 200, await gateway.open(body.token));
      }
      if (pathname === '/human-handoff/api/frame' && req.method === 'GET') {
        const image = await gateway.frame(bearer(req));
        res.writeHead(200, {
          'content-type': 'image/jpeg',
          'content-length': image.length,
          'cache-control': 'no-store',
        });
        return res.end(image);
      }
      if (pathname === '/human-handoff/api/input' && req.method === 'POST') {
        const body = await readJson(req);
        return json(res, 200, await gateway.input(bearer(req), body));
      }
      if (pathname === '/human-handoff/api/resolve' && req.method === 'POST') {
        return json(res, 200, await gateway.resolve(bearer(req)));
      }
      if (pathname === '/human-handoff/api/cancel' && req.method === 'POST') {
        return json(res, 200, await gateway.cancel(bearer(req)));
      }
      if (pathname === '/human-handoff/internal/create' && req.method === 'POST') {
        if (!safeEqual(bearer(req), adminSecret)) return json(res, 401, { error: 'unauthorized' });
        const body = await readJson(req);
        return json(res, 201, await gateway.createHandoff(body));
      }
      if (pathname.startsWith('/human-handoff/internal/status/') && req.method === 'GET') {
        if (!safeEqual(bearer(req), adminSecret)) return json(res, 401, { error: 'unauthorized' });
        const id = pathname.split('/').pop();
        const value = gateway.status(id);
        return json(res, value ? 200 : 404, value || { error: 'not_found' });
      }
      return json(res, 404, { error: 'not_found' });
    } catch (error) {
      const status = Number(error?.statusCode) || 500;
      if (status >= 500) console.error('handoff request failed:', error?.message || error);
      return json(res, status, { error: status >= 500 ? 'handoff_failed' : error.message });
    }
  });

  const timer = setInterval(() => {
    gateway.renewActive().catch(error => console.error('handoff renewal failed:', error?.message || error));
  }, 30_000);
  timer.unref();

  server.listen(port, host, () => {
    console.log(`3DVR Human Handoff gateway listening on http://${host}:${port}`);
  });
  return { server, gateway };
}

function parseCli(argv) {
  const args = { command: argv[0] || '' };
  for (let index = 1; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    args[item.slice(2)] = argv[index + 1] || '';
    index += 1;
  }
  return args;
}

async function runCli(argv = process.argv.slice(2)) {
  const args = parseCli(argv);
  if (!['create', 'status'].includes(args.command)) return startServer();

  const secret = await ensureAdminSecret();
  const headers = { authorization: `Bearer ${secret}` };

  if (args.command === 'create') {
    headers['content-type'] = 'application/json';
    const response = await fetch('http://127.0.0.1:4312/human-handoff/internal/create', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        lane: args.lane || 'general',
        origin: args.origin,
        serviceName: args.service || 'Website',
        reason: args.reason || 'A human-only step needs your attention.',
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Create failed.');
    console.log(`handoff_id=${body.id}`);
    console.log(`handoff_url=${body.url}`);
    console.log(`expires_at=${body.expiresAt}`);
    return;
  }

  const response = await fetch(
    `http://127.0.0.1:4312/human-handoff/internal/status/${encodeURIComponent(args.id || '')}`,
    { headers },
  );
  console.log(JSON.stringify(await response.json(), null, 2));
}

if (require.main === module) {
  runCli().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  CdpClient,
  createGateway,
  hashToken,
  parseCli,
  safeEqual,
  selectTarget,
  targetMatchesOrigin,
};
