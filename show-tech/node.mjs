#!/usr/bin/env node
import http from 'node:http';
import dgram from 'node:dgram';
import os from 'node:os';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import { createNativeAvAdapter } from './native-av.mjs';
import { createPipewireAudioAdapter } from './pipewire-audio.mjs';

const HTTP_PORT = Number(process.env.SHOW_NODE_PORT || 47771);
const DISCOVERY_PORT = Number(process.env.SHOW_DISCOVERY_PORT || 47770);
const nodeId = process.env.SHOW_NODE_ID || `${os.hostname()}-${crypto.randomBytes(3).toString('hex')}`;
const nodeName = process.env.SHOW_NODE_NAME || os.hostname();
const token = process.env.SHOW_NODE_TOKEN || crypto.randomBytes(18).toString('base64url');
const startedAt = Date.now();
const clients = new Set();

function json(res, status, body) {
  const data = JSON.stringify(body, null, 2);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) });
  res.end(data);
}

function authorized(req) {
  return req.headers.authorization === `Bearer ${token}`;
}

function emit(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) client.write(payload);
}

const nativeAv = createNativeAvAdapter({ emit });
const pipewire = createPipewireAudioAdapter({ emit });
const state = {
  display: { background: '#000000', text: '3DVR Show Node', textColor: '#ffffff' },
  media: { src: null, playing: false, volume: 1, muted: false },
  native: nativeAv.state,
  audio: pipewire.state,
};

const nodeIdentity = { id: nodeId, name: nodeName, platform: process.platform, arch: process.arch };
function capabilityEnvelope() {
  return {
    protocol: '3dvr-show-node/0.1',
    node: nodeIdentity,
    endpoints: { httpPort: HTTP_PORT, outputPath: '/output' },
    capabilities: [
      { id: 'display.browser', kind: 'video.output', actions: ['display.color', 'display.text'] },
      { id: 'media.browser', kind: 'av.output', actions: ['media.load', 'media.play', 'media.pause', 'media.volume', 'media.mute'] },
      ...nativeAv.capabilities(),
      ...pipewire.capabilities(),
    ],
  };
}

function adapterAction(action) {
  const nativeResult = nativeAv.handle(action);
  if (nativeResult !== null) return nativeResult;
  const audioResult = pipewire.handle(action);
  if (audioResult !== null) return audioResult;
  return null;
}

function applyAction(action) {
  const { type, payload = {} } = action || {};
  const adapterResult = adapterAction(action);
  if (adapterResult !== null) {
    const event = {
      type: 'state',
      actionId: action.id || crypto.randomUUID(),
      appliedAt: Date.now(),
      adapterResult,
      state,
    };
    emit(event);
    return event;
  }

  switch (type) {
    case 'display.color':
      state.display.background = String(payload.color || '#000000');
      break;
    case 'display.text':
      state.display.text = String(payload.text ?? '');
      if (payload.color) state.display.textColor = String(payload.color);
      break;
    case 'media.load':
      state.media.src = String(payload.src || '');
      state.media.playing = Boolean(payload.autoplay);
      break;
    case 'media.play':
      state.media.playing = true;
      break;
    case 'media.pause':
      state.media.playing = false;
      break;
    case 'media.volume': {
      const value = Number(payload.value);
      if (!Number.isFinite(value)) throw new Error('media.volume requires numeric payload.value');
      state.media.volume = Math.max(0, Math.min(1, value));
      break;
    }
    case 'media.mute':
      state.media.muted = Boolean(payload.value);
      break;
    default:
      throw new Error(`Unsupported action type: ${type}`);
  }
  const event = { type: 'state', actionId: action.id || crypto.randomUUID(), appliedAt: Date.now(), state };
  emit(event);
  return event;
}

function acceptAction(action) {
  const now = Date.now();
  const executeAt = action.executeAt == null ? now : Number(action.executeAt);
  if (!Number.isFinite(executeAt)) throw new Error('executeAt must be epoch milliseconds');
  if (executeAt < now - 1000) throw new Error('executeAt is too far in the past');
  if (executeAt > now + 24 * 60 * 60 * 1000) throw new Error('executeAt is more than 24 hours ahead');

  const id = action.id || crypto.randomUUID();
  const normalized = { ...action, id, executeAt };
  const delay = Math.max(0, executeAt - now);
  if (delay === 0) return { accepted: true, scheduled: false, ...applyAction(normalized) };

  setTimeout(() => {
    try { applyAction(normalized); }
    catch (error) { emit({ type: 'action.error', actionId: id, at: Date.now(), error: error.message }); }
  }, delay);
  return { accepted: true, scheduled: true, actionId: id, executeAt };
}

const outputHtml = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>3DVR Show Node</title><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000;color:#fff;font-family:system-ui,sans-serif}
#stage{position:fixed;inset:0;display:grid;place-items:center;background:#000}
#label{position:absolute;z-index:2;font-size:clamp(2rem,8vw,8rem);text-align:center;padding:4vw;white-space:pre-wrap}
video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:transparent}
</style></head><body><div id="stage"><video id="media" playsinline></video><div id="label"></div></div>
<script>
const stage=document.querySelector('#stage'), label=document.querySelector('#label'), media=document.querySelector('#media');
function render(s){
  stage.style.background=s.display.background; label.textContent=s.display.text; label.style.color=s.display.textColor;
  if(s.media.src && media.src!==s.media.src) media.src=s.media.src;
  if(!s.media.src){ media.removeAttribute('src'); media.load(); }
  media.volume=Number.isFinite(s.media.volume)?s.media.volume:1; media.muted=!!s.media.muted;
  if(s.media.playing) media.play().catch(()=>{}); else media.pause();
}
fetch('/v1/state').then(r=>r.json()).then(render);
const events=new EventSource('/v1/events'); events.onmessage=e=>{const m=JSON.parse(e.data); if(m.state) render(m.state)};
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/v1/health') return json(res, 200, {
    ok: true,
    nodeId,
    uptimeMs: Date.now() - startedAt,
    nativeAv: nativeAv.state,
    pipewire: pipewire.state,
  });
  if (req.method === 'GET' && url.pathname === '/v1/capabilities') return json(res, 200, capabilityEnvelope());
  if (req.method === 'GET' && url.pathname === '/v1/state') return json(res, 200, state);
  if (req.method === 'GET' && url.pathname === '/v1/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify({ type: 'state', state })}\n\n`);
    clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  if (req.method === 'GET' && url.pathname === '/output') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(outputHtml); return;
  }
  if (req.method === 'POST' && url.pathname === '/v1/actions') {
    if (!authorized(req)) return json(res, 401, { accepted: false, error: 'unauthorized' });
    let body=''; req.on('data', chunk => { body += chunk; if (body.length > 1024 * 1024) req.destroy(); });
    req.on('end', () => {
      try { json(res, 202, acceptAction(JSON.parse(body || '{}'))); }
      catch (error) { json(res, 400, { accepted: false, error: error.message }); }
    }); return;
  }
  json(res, 404, { error: 'not_found' });
});

server.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`3DVR Show Node ${nodeId}`);
  console.log(`Output: http://0.0.0.0:${HTTP_PORT}/output`);
  console.log(`Native AV: ${nativeAv.state.available ? `${nativeAv.state.backend} (${nativeAv.state.outputMode})` : 'unavailable'}`);
  console.log(`PipeWire: ${pipewire.state.sessionAvailable ? `${pipewire.state.sinks.length} sinks / ${pipewire.state.sources.length} sources` : pipewire.state.lastError || 'unavailable'}`);
  console.log(`Control token: ${token}`);
});

const discovery = dgram.createSocket('udp4');
discovery.on('message', (msg, rinfo) => {
  if (msg.toString().trim() !== '3DVR_SHOW_DISCOVER_V1') return;
  const reply = Buffer.from(JSON.stringify({ ...nodeIdentity, protocol: '3dvr-show-node/0.1', httpPort: HTTP_PORT }));
  discovery.send(reply, rinfo.port, rinfo.address);
});
discovery.bind(DISCOVERY_PORT, '0.0.0.0', () => console.log(`Discovery UDP :${DISCOVERY_PORT}`));

function shutdown() {
  nativeAv.stop('shutdown');
  discovery.close();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
