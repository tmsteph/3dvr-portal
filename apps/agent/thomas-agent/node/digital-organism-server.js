const http = require('node:http');
const {
  buildContext,
  loadEvents,
  replayMemories,
} = require('./digital-organism');

const HOST = process.env.THREEDVR_ORGANISM_HOST || '127.0.0.1';
const PORT = Number.parseInt(process.env.THREEDVR_ORGANISM_PORT || '4311', 10);
const API_TOKEN = String(process.env.THREEDVR_ORGANISM_API_TOKEN || '').trim();
const startedAt = new Date().toISOString();

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end(body);
}

function authorized(req) {
  if (!API_TOKEN) return false;
  return req.headers.authorization === `Bearer ${API_TOKEN}`;
}

async function readJson(req, maxBytes = 64 * 1024) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error('Request body too large.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function health() {
  const events = await loadEvents();
  const memories = replayMemories(events);
  return {
    ok: true,
    service: '3dvr-digital-organism',
    milestone: 'v0.1 Remember Me',
    runtime: '3dvr-portal/apps/agent',
    storage: 'append-only local JSONL',
    activeMemories: memories.length,
    events: events.length,
    privateRecallEnabled: Boolean(API_TOKEN),
    startedAt,
    checkedAt: new Date().toISOString(),
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      });
      return res.end();
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return sendJson(res, 200, await health(), {
        'Access-Control-Allow-Origin': '*',
      });
    }

    if (req.method === 'POST' && url.pathname === '/recall') {
      if (!API_TOKEN) {
        return sendJson(res, 503, {
          ok: false,
          error: 'Private recall is disabled until an owner API token is configured.',
        });
      }
      if (!authorized(req)) {
        return sendJson(res, 401, { ok: false, error: 'Unauthorized.' });
      }
      const body = await readJson(req);
      const query = String(body.query || '').trim();
      if (!query) return sendJson(res, 400, { ok: false, error: 'query is required' });
      const limit = Math.min(20, Math.max(1, Number.parseInt(body.limit || '5', 10) || 5));
      const context = await buildContext(query, { limit });
      return sendJson(res, 200, { ok: true, context });
    }

    return sendJson(res, 404, { ok: false, error: 'Not found.' });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { ok: false, error: 'Internal server error.' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`3DVR Digital Organism listening on http://${HOST}:${PORT}`);
});

function shutdown(signal) {
  console.log(`${signal} received; shutting down.`);
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
