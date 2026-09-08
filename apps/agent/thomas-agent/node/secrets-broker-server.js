'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { DEFAULTS, SecretsBroker } = require('./secrets-broker');

const SOCKET_PATH = process.env.THREEDVR_SECRETS_BROKER_SOCKET || DEFAULTS.socketPath;
const broker = new SecretsBroker();

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store, max-age=0');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(JSON.stringify(body));
}

function bearer(req) {
  const value = String(req.headers.authorization || '');
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function body(req, maxBytes = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error('request-too-large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch {
    const error = new Error('invalid-json');
    error.statusCode = 400;
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://broker.local');
    if (url.pathname === '/health') {
      return json(res, 200, { ok: true, service: '3dvr-secrets-broker' });
    }

    const agent = broker.authenticate(bearer(req));
    if (!agent) return json(res, 401, { ok: false, reason: 'unauthenticated-agent' });

    if (req.method === 'GET' && url.pathname === '/v1/status') {
      const result = broker.status(agent);
      return json(res, result.status, result.body);
    }

    if (req.method === 'GET' && url.pathname === '/v1/approvals') {
      const result = broker.listApprovals(agent, { status: url.searchParams.get('status') || '' });
      return json(res, result.status, result.body);
    }

    if (req.method === 'POST' && url.pathname === '/v1/resolve') {
      const payload = await body(req);
      const result = broker.request(agent, payload);
      return json(res, result.status, result.body);
    }

    const approvalMatch = url.pathname.match(/^\/v1\/approvals\/([^/]+)\/(approve|deny)$/);
    if (req.method === 'POST' && approvalMatch) {
      const payload = await body(req);
      const result = broker.decideApproval(agent, decodeURIComponent(approvalMatch[1]), approvalMatch[2], payload);
      return json(res, result.status, result.body);
    }

    return json(res, 404, { ok: false, reason: 'not-found' });
  } catch (error) {
    return json(res, error?.statusCode || 500, { ok: false, reason: error?.message || 'broker-error' });
  }
});

function cleanupSocket() {
  try {
    if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH);
  } catch {}
}

cleanupSocket();
fs.mkdirSync(path.dirname(SOCKET_PATH), { recursive: true, mode: 0o750 });

server.listen(SOCKET_PATH, () => {
  fs.chmodSync(SOCKET_PATH, 0o660);
  process.stdout.write(`3DVR Secrets Broker listening on ${SOCKET_PATH}\n`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => {
    cleanupSocket();
    process.exit(0);
  }));
}
