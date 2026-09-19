'use strict';

const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const { execFile } = require('node:child_process');
const { appendFile, chmod, mkdir, readFile, rename, writeFile } = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const LEASE_BIN = '/usr/local/bin/3dvr-browser-lease';
const LANE_PORTS = { general: 9222, encore: 9333, messaging: 9444, training: 9555 };
const TTL_MS = Math.max(60_000, Number(process.env.HANDOFF_TTL_MS) || 3_600_000);
const LEASE_TTL_SECONDS = Math.ceil(TTL_MS / 1000) + 90;
const PUBLIC_BASE = (process.env.HANDOFF_PUBLIC_BASE || 'https://portal.3dvr.tech/human-handoff/').replace(/\/+$/, '/');
const STATIC_DIR = path.resolve(__dirname, '../../../../human-handoff');
const STATE_DIR = process.env.HANDOFF_STATE_DIR || path.join(os.homedir(), '.local/state/3dvr/human-handoff');
const SECRET_FILE = process.env.HANDOFF_ADMIN_SECRET_FILE || path.join(os.homedir(), '.config/3dvr/handoff-gateway/admin.secret');
const HANDOFF_STATE_FILE = path.join(STATE_DIR, 'handoffs.json');

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

function normalizeGuideSteps(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).map((step, index) => {
    if (typeof step === 'string') {
      const instruction = step.trim().slice(0, 240);
      return instruction ? { id: `step-${index + 1}`, instruction, targetText: '' } : null;
    }
    if (!step || typeof step !== 'object') return null;
    const instruction = String(step.instruction || step.label || '').trim().slice(0, 240);
    if (!instruction) return null;
    return {
      id: String(step.id || `step-${index + 1}`).trim().slice(0, 80),
      instruction,
      targetText: String(step.targetText || '').trim().slice(0, 240),
    };
  }).filter(Boolean);
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

function persistableHandoff(handoff) {
  return {
    id: handoff.id,
    lane: handoff.lane,
    origin: handoff.origin,
    serviceName: handoff.serviceName,
    reason: handoff.reason,
    guideSteps: normalizeGuideSteps(handoff.guideSteps),
    state: handoff.state,
    createdAt: handoff.createdAt,
    expiresAt: handoff.expiresAt,
    initialHash: handoff.initialHash,
    sessionHash: handoff.sessionHash || '',
    targetId: handoff.targetId || '',
  };
}

async function persistHandoffs(handoffs) {
  await mkdir(STATE_DIR, { recursive: true, mode: 0o700 });
  const active = [...handoffs.values()]
    .filter(handoff => ['needs_human', 'human_active'].includes(handoff.state) && Date.now() < handoff.expiresAt)
    .map(persistableHandoff);
  const temp = `${HANDOFF_STATE_FILE}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(temp, `${JSON.stringify(active, null, 2)}\n`, { mode: 0o600 });
  await chmod(temp, 0o600).catch(() => {});
  await rename(temp, HANDOFF_STATE_FILE);
}

async function loadPersistedHandoffs() {
  try {
    const parsed = JSON.parse(await readFile(HANDOFF_STATE_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
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
    this.listeners = new Map();
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
      if (message.method && this.listeners.has(message.method)) {
        for (const listener of this.listeners.get(message.method)) {
          try {
            listener(message.params || {});
          } catch {}
        }
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

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(listener);
  }

  off(method, listener) {
    this.listeners.get(method)?.delete(listener);
  }

  close() {
    this.listeners.clear();
    try {
      this.socket?.close();
    } catch {}
  }
}

function createGateway() {
  const handoffs = new Map();
  const initialIndex = new Map();
  const sessionIndex = new Map();

  function initRuntime(handoff) {
    handoff.latestFrame = null;
    handoff.frameSeq = 0;
    handoff.lastFrameAcceptedAt = 0;
    handoff.frameWaiters = new Set();
    handoff.screencastHandler = null;
    handoff.screencastStarted = false;
    return handoff;
  }

  function wakeFrameWaiters(handoff) {
    for (const resolve of handoff.frameWaiters || []) resolve();
    handoff.frameWaiters?.clear();
  }

  async function startScreencast(handoff) {
    if (handoff.screencastStarted) return;
    if (!handoff.frameWaiters) initRuntime(handoff);

    const handler = params => {
      if (params.sessionId != null) {
        handoff.client.send('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {});
      }
      if (!params.data) return;
      handoff.lastFrameAcceptedAt = Date.now();
      handoff.latestFrame = Buffer.from(params.data, 'base64');
      handoff.frameSeq += 1;
      wakeFrameWaiters(handoff);
    };

    handoff.screencastHandler = handler;
    handoff.client.on('Page.screencastFrame', handler);
    await handoff.client.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 55,
      maxWidth: 1280,
      maxHeight: 900,
      everyNthFrame: 1,
    });
    handoff.screencastStarted = true;
  }

  async function stopScreencast(handoff) {
    wakeFrameWaiters(handoff);
    if (!handoff?.client || !handoff.screencastStarted) return;
    handoff.screencastStarted = false;
    if (handoff.screencastHandler) {
      handoff.client.off('Page.screencastFrame', handoff.screencastHandler);
      handoff.screencastHandler = null;
    }
    await handoff.client.send('Page.stopScreencast').catch(() => {});
  }

  async function waitForNewFrame(handoff, after, timeoutMs = 1200) {
    if (handoff.frameSeq > after) return;
    await new Promise(resolve => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        handoff.frameWaiters.delete(done);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      handoff.frameWaiters.add(done);
    });
  }

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
    await stopScreencast(handoff);
    handoff.client?.close();
    handoff.client = null;
    const token = handoff.leaseToken;
    handoff.leaseToken = null;
    if (token) await lease('release', handoff.lane, token);
    await audit(state, handoff);
    await persistHandoffs(handoffs);
    return handoff;
  }

  async function createHandoff(options = {}) {
    const lane = String(options.lane || 'general');
    const origin = String(options.origin || '').trim();
    const serviceName = String(options.serviceName || 'Website').trim().slice(0, 80);
    const reason = String(options.reason || 'A human-only step needs your attention.').trim().slice(0, 240);
    const guideSteps = normalizeGuideSteps(options.guideSteps || options.steps);
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
    const handoff = initRuntime({
      id,
      lane,
      origin: new URL(origin).origin,
      serviceName,
      reason,
      guideSteps,
      state: 'needs_human',
      createdAt: Date.now(),
      expiresAt: Date.now() + TTL_MS,
      initialHash: hashToken(initialToken),
      sessionHash: '',
      leaseToken,
      targetId: target.id,
      client,
    });
    handoffs.set(id, handoff);
    initialIndex.set(handoff.initialHash, id);
    await audit('created', handoff);
    await persistHandoffs(handoffs);
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
      guideSteps: normalizeGuideSteps(handoff.guideSteps),
      expiresAt: new Date(handoff.expiresAt).toISOString(),
    };
  }

  async function open(token) {
    const handoff = activeOrThrow(fromInitial(token));
    if (handoff.sessionHash) sessionIndex.delete(handoff.sessionHash);
    const sessionToken = randomBytes(32).toString('base64url');
    handoff.sessionHash = hashToken(sessionToken);
    sessionIndex.set(handoff.sessionHash, handoff.id);
    handoff.state = 'human_active';
    try {
      await startScreencast(handoff);
    } catch (error) {
      handoff.state = 'needs_human';
      sessionIndex.delete(handoff.sessionHash);
      handoff.sessionHash = '';
      initialIndex.set(handoff.initialHash, handoff.id);
      throw error;
    }
    await audit('opened', handoff);
    await persistHandoffs(handoffs);
    return {
      sessionToken,
      serviceName: handoff.serviceName,
      reason: handoff.reason,
      guideSteps: normalizeGuideSteps(handoff.guideSteps),
      expiresAt: new Date(handoff.expiresAt).toISOString(),
    };
  }

  async function frame(token, after = 0) {
    const handoff = activeOrThrow(fromSession(token));
    if (handoff.state !== 'human_active') throw Object.assign(new Error('Handoff is not open.'), { statusCode: 409 });
    if (!handoff.screencastStarted) await startScreencast(handoff);
    const requestedAfter = Math.max(0, Number(after) || 0);
    await waitForNewFrame(handoff, requestedAfter);

    // Chrome can stop emitting screencast frames across top-level navigation.
    // Never serve the cached pre-navigation image forever: if no fresh frame
    // arrived during the long-poll window, capture the current tab directly.
    if (!handoff.latestFrame || handoff.frameSeq <= requestedAfter) {
      const result = await handoff.client.send('Page.captureScreenshot', {
        format: 'jpeg',
        quality: 58,
        fromSurface: true,
        captureBeyondViewport: false,
      });
      handoff.latestFrame = Buffer.from(result.data, 'base64');
      handoff.frameSeq += 1;
    }

    return { image: handoff.latestFrame, seq: handoff.frameSeq };
  }

  async function guide(token, requestedIndex = 0) {
    const handoff = activeOrThrow(fromSession(token));
    if (handoff.state !== 'human_active') throw Object.assign(new Error('Handoff is not open.'), { statusCode: 409 });
    const steps = normalizeGuideSteps(handoff.guideSteps);
    if (!steps.length) return { index: 0, total: 0, step: null, found: false };

    const index = Math.max(0, Math.min(steps.length - 1, Number(requestedIndex) || 0));
    const step = steps[index];
    let found = false;

    if (step.targetText) {
      const expression = `(() => {
        const needle = ${JSON.stringify(step.targetText)}.toLowerCase().replace(/\\s+/g, ' ').trim();
        const textOf = el => String(
          el.innerText || el.textContent || el.value || el.getAttribute?.('aria-label') || ''
        ).toLowerCase().replace(/\\s+/g, ' ').trim();
        const candidates = Array.from(document.querySelectorAll(
          'button,a,label,input,textarea,[role=checkbox],[role=radio],[role=button],summary,p,span,div'
        ));
        const exact = candidates.find(el => textOf(el) === needle);
        const partial = exact || candidates.find(el => textOf(el).includes(needle));
        if (!partial) return false;
        partial.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
        return true;
      })()`;
      const result = await handoff.client.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
      }).catch(() => ({ result: { value: false } }));
      found = Boolean(result?.result?.value);
    }

    return { index, total: steps.length, step, found };
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
    } else if (kind === 'paste') {
      const control = { key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17 };
      const v = { key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86 };
      await handoff.client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...control, modifiers: 2 });
      await handoff.client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...v, modifiers: 2 });
      await handoff.client.send('Input.dispatchKeyEvent', { type: 'keyUp', ...v, modifiers: 2 });
      await handoff.client.send('Input.dispatchKeyEvent', { type: 'keyUp', ...control, modifiers: 0 });
    } else if (kind === 'key') {
      const key = String(action.key || '');
      const keySpec = {
        Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 },
        Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 },
        Backspace: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 },
        Delete: { key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 46 },
        Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 },
      }[key];
      if (!keySpec) throw Object.assign(new Error('Unsupported key.'), { statusCode: 400 });
      await handoff.client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...keySpec });
      await handoff.client.send('Input.dispatchKeyEvent', { type: 'keyUp', ...keySpec });
    } else {
      throw Object.assign(new Error('Unsupported input action.'), { statusCode: 400 });
    }
    const focusState = await handoff.client.send('Runtime.evaluate', {
      expression: `(() => { const el = document.activeElement; return !!(el && (el.matches('input:not([type=hidden]), textarea, [contenteditable=true]'))); })()`,
      returnByValue: true,
    }).catch(() => ({ result: { value: false } }));
    return { ok: true, editable: Boolean(focusState?.result?.value) };
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
        await stopScreencast(handoff).catch(() => {});
        handoff.client?.close();
        handoff.client = null;
        handoff.leaseToken = null;
        await audit('lease_lost', handoff).catch(() => {});
        await persistHandoffs(handoffs).catch(() => {});
      }
    }
  }

  async function restore() {
    const records = await loadPersistedHandoffs();
    let failures = 0;

    for (const record of records) {
      if (!record || !['needs_human', 'human_active'].includes(record.state)) continue;
      if (Date.now() >= Number(record.expiresAt || 0)) continue;
      if (!LANE_PORTS[record.lane] || !record.origin || !record.id) continue;

      let leaseToken = '';
      let client = null;
      try {
        const target = await selectTarget(record.lane, record.origin);
        leaseToken = await lease('acquire', record.lane, `human-handoff:${record.id}`, LEASE_TTL_SECONDS);
        client = new CdpClient(target.webSocketDebuggerUrl);
        await client.connect();

        const handoff = initRuntime({
          ...record,
          targetId: target.id,
          leaseToken,
          client,
        });
        handoffs.set(handoff.id, handoff);
        initialIndex.set(handoff.initialHash, handoff.id);
        if (handoff.state === 'human_active' && handoff.sessionHash) {
          sessionIndex.set(handoff.sessionHash, handoff.id);
          await startScreencast(handoff);
        } else {
          handoff.state = 'needs_human';
        }
        await audit('restored', handoff).catch(() => {});
      } catch (error) {
        failures += 1;
        client?.close();
        if (leaseToken) await lease('release', record.lane, leaseToken).catch(() => {});
        console.error(`handoff restore failed for ${record.id}:`, error?.message || error);
      }
    }

    if (!failures) await persistHandoffs(handoffs);
    return { restored: handoffs.size, failures };
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

  return { createHandoff, preview, open, frame, guide, input, resolve, cancel, renewActive, restore, status };
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
  await gateway.restore();
  const adminSecret = await ensureAdminSecret();
  const host = process.env.HANDOFF_BIND || '127.0.0.1';
  const port = Number(process.env.HANDOFF_PORT) || 4312;

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && await serveStatic(req, res)) return;
      const requestUrl = new URL(req.url, 'http://localhost');
      const pathname = requestUrl.pathname;

      if (pathname === '/human-handoff/api/preview' && req.method === 'POST') {
        const body = await readJson(req);
        return json(res, 200, await gateway.preview(body.token));
      }
      if (pathname === '/human-handoff/api/open' && req.method === 'POST') {
        const body = await readJson(req);
        return json(res, 200, await gateway.open(body.token));
      }
      if (pathname === '/human-handoff/api/frame' && req.method === 'GET') {
        const frame = await gateway.frame(bearer(req), requestUrl.searchParams.get('after'));
        res.writeHead(200, {
          'content-type': 'image/jpeg',
          'content-length': frame.image.length,
          'cache-control': 'no-store',
          'x-handoff-frame-seq': String(frame.seq),
        });
        return res.end(frame.image);
      }
      if (pathname === '/human-handoff/api/guide' && req.method === 'POST') {
        const body = await readJson(req);
        return json(res, 200, await gateway.guide(bearer(req), body.index));
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
        guideSteps: args.steps ? JSON.parse(args.steps) : [],
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
  normalizeGuideSteps,
  parseCli,
  persistableHandoff,
  safeEqual,
  selectTarget,
  targetMatchesOrigin,
};
