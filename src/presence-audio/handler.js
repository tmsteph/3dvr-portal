import { createHash, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, readFile, readdir, rename, stat, truncate, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const SESSION_RE = /^[A-Za-z0-9_-]{12,96}$/;
const HEADER_CACHE_BYTES = 128 * 1024;
const MAX_PAIR_BODY_BYTES = 8 * 1024;
const clean = (value = '') => String(value || '').trim();

function digest(value) {
  return createHash('sha256').update(clean(value)).digest();
}

function safeEqual(left, right) {
  if (!left || !right) return false;
  return timingSafeEqual(digest(left), digest(right));
}

function bearer(req) {
  const raw = clean(req.headers?.authorization);
  return raw.toLowerCase().startsWith('bearer ') ? raw.slice(7).trim() : '';
}
function requestOrigin(req) {
  const proto = clean(req.headers?.['x-forwarded-proto']) || 'https';
  const host = clean(req.headers?.['x-forwarded-host'] || req.headers?.host);
  return host ? proto + '://' + host : 'https://portal.3dvr.tech';
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify(payload));
}

function sendHtml(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.end(body);
}
async function readSmallJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_PAIR_BODY_BYTES) throw new Error('request too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function ensureDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
}

async function readMetadata(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { return null; }
}

async function writeMetadata(path, payload) {
  await writeFile(path, JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 });
}
function pairPage(pairToken) {
  const encoded = JSON.stringify(pairToken);
  return [
    '<!doctype html><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="referrer" content="no-referrer">',
    '<title>Pair Shared Presence · 3DVR Connect</title>',
    '<style>body{font-family:system-ui;max-width:680px;margin:8vh auto;padding:24px;background:#111;color:#eee}',
    'button,a{font:inherit}button{padding:14px 18px;border-radius:12px;border:0;font-weight:700}',
    '.card{background:#1d1d1d;padding:20px;border-radius:16px}.muted{color:#aaa}a{color:#9bc7ff}</style>',
    '<div class="card"><h1>Pair Shared Presence</h1>',
    '<p>This enables visible, consent-based ambient audio sharing from your phone.</p>',
    '<button id="pair">Pair this phone</button><p id="status" class="muted"></p><p id="share"></p></div>',
    '<script>const token=' + encoded + ';const b=document.getElementById("pair");',
    'b.onclick=async()=>{b.disabled=true;document.getElementById("status").textContent="Pairing…";',
    'const r=await fetch("/api/presence-audio/pair/claim",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token})});',
    'const d=await r.json();if(!r.ok){b.disabled=false;document.getElementById("status").textContent=d.error||"Pairing failed";return;}',
    'document.getElementById("status").textContent="Configuration ready. Opening 3DVR Companion…";',
    'document.getElementById("share").innerHTML="Partner listener: <a rel=\\"noreferrer\\" href=\\""+d.viewUrl+"\\">open listener</a>";',
    'location.href=d.deepLink;};</script>',
  ].join('');
}
async function serveRecording(req, res, filePath) {
  let info;
  try { info = await stat(filePath); }
  catch { return sendJson(res, 404, { ok: false, error: 'recording not found' }); }
  const total = info.size;
  const rawRange = clean(req.headers?.range);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', 'audio/ogg; codecs=opus');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (!rawRange) {
    res.statusCode = 200;
    res.setHeader('Content-Length', String(total));
    return createReadStream(filePath).pipe(res);
  }
  const match = /^bytes=(\d+)-(\d*)$/.exec(rawRange);
  if (!match) {
    res.statusCode = 416;
    res.setHeader('Content-Range', 'bytes */' + total);
    return res.end();
  }
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
  if (start >= total || end < start) {
    res.statusCode = 416;
    res.setHeader('Content-Range', 'bytes */' + total);
    return res.end();
  }
  res.statusCode = 206;
  res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + total);
  res.setHeader('Content-Length', String(end - start + 1));
  createReadStream(filePath, { start, end }).pipe(res);
}

export function createPresenceAudioHandler(options = {}) {
  const config = options.config || process.env;
  const storageRoot = resolve(clean(config.PRESENCE_AUDIO_DIR) || join(process.cwd(), '.presence-audio'));
  const uploadToken = clean(config.PRESENCE_AUDIO_UPLOAD_TOKEN);
  const viewToken = clean(config.PRESENCE_AUDIO_VIEW_TOKEN);
  const pairToken = clean(config.PRESENCE_AUDIO_PAIR_TOKEN);
  const active = new Map();

  function configured() {
    return uploadToken.length >= 32 && viewToken.length >= 32 && pairToken.length >= 20;
  }

  function isUploader(req) { return safeEqual(bearer(req), uploadToken); }
  function isViewer(req, url) {
    return safeEqual(bearer(req), viewToken) || safeEqual(url.searchParams.get('view'), viewToken);
  }

  function pathsFor(sessionId) {
    return {
      part: join(storageRoot, sessionId + '.ogg.part'),
      final: join(storageRoot, sessionId + '.ogg'),
      meta: join(storageRoot, sessionId + '.json'),
    };
  }

  async function getState(sessionId) {
    let state = active.get(sessionId);
    if (state) return state;
    state = {
      id: sessionId,
      listeners: new Set(),
      header: [],
      headerBytes: 0,
      uploading: false,
      startedAt: new Date().toISOString(),
      lastUploadAt: null,
      bytes: 0,
    };
    active.set(sessionId, state);
    return state;
  }
  async function hydrateHeader(state, filePath) {
    if (state.headerBytes || !filePath) return;
    let info;
    try { info = await stat(filePath); } catch { return; }
    if (!info.size) return;
    const length = Math.min(info.size, HEADER_CACHE_BYTES);
    const handle = await open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, 0);
      if (bytesRead) {
        state.header = [buffer.subarray(0, bytesRead)];
        state.headerBytes = bytesRead;
      }
    } finally { await handle.close(); }
  }

  function rememberHeader(state, chunk) {
    if (state.headerBytes >= HEADER_CACHE_BYTES) return;
    const remaining = HEADER_CACHE_BYTES - state.headerBytes;
    const slice = chunk.length <= remaining ? Buffer.from(chunk) : Buffer.from(chunk.subarray(0, remaining));
    state.header.push(slice);
    state.headerBytes += slice.length;
  }
  function broadcast(state, chunk) {
    for (const listener of [...state.listeners]) {
      if (listener.destroyed || listener.writableEnded) {
        state.listeners.delete(listener);
        continue;
      }
      if (listener.writableLength > 1024 * 1024) {
        state.listeners.delete(listener);
        listener.destroy();
        continue;
      }
      listener.write(chunk);
    }
  }

  async function uploadStream(req, res) {
    if (!configured()) return sendJson(res, 503, { ok: false, error: 'presence audio not configured' });
    if (!isUploader(req)) return sendJson(res, 401, { ok: false, error: 'unauthorized' });
    const sessionId = clean(req.headers['x-3dvr-session']);
    if (!SESSION_RE.test(sessionId)) return sendJson(res, 400, { ok: false, error: 'invalid session id' });
    const offset = Number(req.headers['x-3dvr-offset'] || 0);
    if (!Number.isSafeInteger(offset) || offset < 0) return sendJson(res, 400, { ok: false, error: 'invalid offset' });
    await ensureDirectory(storageRoot);
    const paths = pathsFor(sessionId);
    let currentSize = 0;
    try { currentSize = (await stat(paths.part)).size; }
    catch {
      try { currentSize = (await stat(paths.final)).size; await rename(paths.final, paths.part); }
      catch { currentSize = 0; }
    }
    if (offset > currentSize) {
      return sendJson(res, 409, { ok: false, error: 'offset ahead of server', offset: currentSize });
    }
    if (offset < currentSize) await truncate(paths.part, offset);

    const state = await getState(sessionId);
    state.uploading = true;
    state.lastUploadAt = new Date().toISOString();
    state.bytes = offset;
    await hydrateHeader(state, paths.part);
    const existingMeta = await readMetadata(paths.meta);
    await writeMetadata(paths.meta, {
      ...(existingMeta || {}),
      id: sessionId,
      startedAt: existingMeta?.startedAt || state.startedAt,
      finalizedAt: null,
      bytes: offset,
      active: true,
    });
    const output = createWriteStream(paths.part, { flags: 'a', mode: 0o600 });
    let failed = null;
    output.on('error', (error) => { failed = error; req.destroy(error); });
    try {
      for await (const chunk of req) {
        if (failed) throw failed;
        if (!output.write(chunk)) await new Promise((resolve) => output.once('drain', resolve));
        state.bytes += chunk.length;
        state.lastUploadAt = new Date().toISOString();
        rememberHeader(state, chunk);
        broadcast(state, chunk);
      }
      await new Promise((resolve, reject) => output.end((error) => error ? reject(error) : resolve()));
      state.uploading = false;
      const meta = await readMetadata(paths.meta);
      await writeMetadata(paths.meta, {
        ...(meta || {}),
        id: sessionId,
        bytes: state.bytes,
        active: true,
        lastUploadAt: state.lastUploadAt,
      });
      return sendJson(res, 200, { ok: true, sessionId, offset: state.bytes });
    } catch (error) {
      state.uploading = false;
      output.destroy();
      if (!res.headersSent) return sendJson(res, 500, { ok: false, error: 'stream interrupted', offset: state.bytes });
      res.destroy(error);
    }
  }
  async function uploadOffset(req, res, sessionId) {
    if (!isUploader(req)) return sendJson(res, 401, { ok: false, error: 'unauthorized' });
    const paths = pathsFor(sessionId);
    let size = 0;
    try { size = (await stat(paths.part)).size; }
    catch { try { size = (await stat(paths.final)).size; } catch { size = 0; } }
    return sendJson(res, 200, { ok: true, sessionId, offset: size });
  }

  async function finalize(req, res, sessionId) {
    if (!isUploader(req)) return sendJson(res, 401, { ok: false, error: 'unauthorized' });
    const paths = pathsFor(sessionId);
    let info;
    try { info = await stat(paths.part); }
    catch {
      try { info = await stat(paths.final); }
      catch { return sendJson(res, 404, { ok: false, error: 'session not found' }); }
    }
    try { await rename(paths.part, paths.final); } catch {}
    const state = active.get(sessionId);
    if (state) {
      for (const listener of state.listeners) listener.end();
      state.listeners.clear();
      active.delete(sessionId);
    }
    const meta = await readMetadata(paths.meta);
    const finalizedAt = new Date().toISOString();
    await writeMetadata(paths.meta, {
      ...(meta || {}),
      id: sessionId,
      bytes: info.size,
      active: false,
      finalizedAt,
    });
    return sendJson(res, 200, { ok: true, sessionId, bytes: info.size, finalizedAt });
  }

  async function listSessions(req, res, url) {
    if (!isViewer(req, url)) return sendJson(res, 401, { ok: false, error: 'unauthorized' });
    await ensureDirectory(storageRoot);
    const names = (await readdir(storageRoot)).filter((name) => name.endsWith('.json'));
    const sessions = [];
    for (const name of names) {
      const meta = await readMetadata(join(storageRoot, name));
      if (meta?.id && SESSION_RE.test(meta.id)) sessions.push(meta);
    }
    sessions.sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
    return sendJson(res, 200, { ok: true, sessions: sessions.slice(0, 200) });
  }
  async function live(req, res, url) {
    if (!isViewer(req, url)) return sendJson(res, 401, { ok: false, error: 'unauthorized' });
    const requested = clean(url.pathname.split('/').pop());
    let state = requested && requested !== 'current' ? active.get(requested) : null;
    if (!state) {
      state = [...active.values()]
        .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))[0];
    }
    if (!state) return sendJson(res, 404, { ok: false, error: 'no active recording' });
    const paths = pathsFor(state.id);
    await hydrateHeader(state, paths.part);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'audio/ogg; codecs=opus');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-3DVR-Session', state.id);
    res.flushHeaders?.();
    for (const chunk of state.header) res.write(chunk);
    state.listeners.add(res);
    req.on('close', () => state.listeners.delete(res));
  }
  async function status(req, res, url) {
    if (!isViewer(req, url)) return sendJson(res, 401, { ok: false, error: 'unauthorized' });
    const sessions = [...active.values()].map((state) => ({
      id: state.id,
      startedAt: state.startedAt,
      bytes: state.bytes,
      uploading: state.uploading,
      lastUploadAt: state.lastUploadAt,
      listeners: state.listeners.size,
    }));
    return sendJson(res, 200, { ok: true, active: sessions, configured: configured() });
  }

  async function claimPair(req, res) {
    if (!configured()) return sendJson(res, 503, { ok: false, error: 'presence audio not configured' });
    let body;
    try { body = await readSmallJson(req); }
    catch { return sendJson(res, 400, { ok: false, error: 'invalid request' }); }
    if (!safeEqual(body.token, pairToken)) return sendJson(res, 401, { ok: false, error: 'invalid pairing link' });
    await ensureDirectory(storageRoot);
    const marker = join(storageRoot, '.pair-claimed.json');
    let handle;
    try {
      handle = await open(marker, 'wx', 0o600);
      await handle.writeFile(JSON.stringify({ claimedAt: new Date().toISOString() }) + '\n');
      await handle.close();
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      if (error?.code === 'EEXIST') return sendJson(res, 409, { ok: false, error: 'pairing link already used' });
      throw error;
    }
    const origin = requestOrigin(req);
    const deepLink = 'threedvr://presence/pair?server=' + encodeURIComponent(origin)
      + '&upload=' + encodeURIComponent(uploadToken)
      + '&view=' + encodeURIComponent(viewToken);
    const viewUrl = origin + '/3dvr-connect/presence/#view=' + encodeURIComponent(viewToken);
    return sendJson(res, 200, { ok: true, deepLink, viewUrl });
  }

  async function pair(req, res, url) {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    const connectPrefix = '/3dvr-connect/presence/pair/';
    const legacyPrefix = '/presence-audio/pair/';
    const prefix = url.pathname.startsWith(connectPrefix) ? connectPrefix : legacyPrefix;
    const token = decodeURIComponent(url.pathname.slice(prefix.length));
    if (!safeEqual(token, pairToken)) return sendHtml(res, 404, '<h1>Pairing link not found</h1>');
    return sendHtml(res, 200, pairPage(token));
  }
  return async function handlePresenceAudio(req, res, url) {
    const pathname = url.pathname;
    if (pathname.startsWith('/3dvr-connect/presence/pair/') || pathname.startsWith('/presence-audio/pair/')) return pair(req, res, url);
    if (pathname === '/api/presence-audio/pair/claim') {
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
      return claimPair(req, res);
    }
    if (pathname === '/api/presence-audio/stream') {
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
      return uploadStream(req, res);
    }
    if (pathname === '/api/presence-audio/sessions') {
      if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
      return listSessions(req, res, url);
    }
    if (pathname === '/api/presence-audio/status') {
      if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
      return status(req, res, url);
    }
    if (pathname.startsWith('/api/presence-audio/live/')) {
      if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
      return live(req, res, url);
    }
    const offsetPrefix = '/api/presence-audio/offset/';
    if (pathname.startsWith(offsetPrefix)) {
      const sessionId = decodeURIComponent(pathname.slice(offsetPrefix.length));
      if (!SESSION_RE.test(sessionId)) return sendJson(res, 400, { ok: false, error: 'invalid session id' });
      if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
      return uploadOffset(req, res, sessionId);
    }

    const finalizePrefix = '/api/presence-audio/finalize/';
    if (pathname.startsWith(finalizePrefix)) {
      const sessionId = decodeURIComponent(pathname.slice(finalizePrefix.length));
      if (!SESSION_RE.test(sessionId)) return sendJson(res, 400, { ok: false, error: 'invalid session id' });
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
      return finalize(req, res, sessionId);
    }

    const recordingPrefix = '/api/presence-audio/recordings/';
    if (pathname.startsWith(recordingPrefix)) {
      if (!isViewer(req, url)) return sendJson(res, 401, { ok: false, error: 'unauthorized' });
      const sessionId = decodeURIComponent(pathname.slice(recordingPrefix.length));
      if (!SESSION_RE.test(sessionId)) return sendJson(res, 400, { ok: false, error: 'invalid session id' });
      return serveRecording(req, res, pathsFor(sessionId).final);
    }
    return sendJson(res, 404, { ok: false, error: 'not found' });
  };
}
