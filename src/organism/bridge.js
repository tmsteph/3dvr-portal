import {
  resolveOrganismAccess,
  resolveOrganismFeedbackAccess
} from './access.js';
import {
  approveRetrievalOnOvh,
  recallFromOvh
} from './remote.js';

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.setHeader?.('Cache-Control', 'no-store');
    return res.status(status).json(payload);
  }
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

async function readJson(req, maxBytes = 96 * 1024) {
  if (req.body && typeof req.body === 'object') return req.body;
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

export function createOrganismBridgeHandler(options = {}) {
  const accessImpl = options.accessImpl || resolveOrganismAccess;
  const feedbackAccessImpl = options.feedbackAccessImpl || resolveOrganismFeedbackAccess;
  const recallImpl = options.recallImpl || recallFromOvh;
  const approveImpl = options.approveImpl || approveRetrievalOnOvh;

  return async function organismBridgeHandler(req, res) {
    const method = String(req.method || 'GET').toUpperCase();
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;

    if (method === 'GET' && pathname === '/health') {
      return sendJson(res, 200, {
        ok: true,
        service: '3dvr-organism-owner-bridge',
        upstream: 'private-ovh-ssh',
        checkedAt: new Date().toISOString()
      });
    }

    if (method !== 'POST' || !['/recall', '/feedback'].includes(pathname)) {
      return sendJson(res, 404, { ok: false, error: 'Not found.' });
    }

    let payload;
    try {
      payload = await readJson(req);
    } catch {
      return sendJson(res, 400, { ok: false, error: 'Invalid JSON request.' });
    }

    const isFeedback = pathname === '/feedback' || payload.organismFeedback === true;
    if (isFeedback) {
      const access = await feedbackAccessImpl(payload, options);
      if (!access.ok) {
        return sendJson(res, access.status || 403, { ok: false, error: access.reason || 'Unauthorized.' });
      }
      try {
        await approveImpl(access.query, access.memoryId, {
          sshHost: options.sshHost,
          remoteScript: options.remoteScript,
          timeoutMs: options.timeoutMs
        });
        return sendJson(res, 200, {
          ok: true,
          requestId: access.requestId,
          memoryId: access.memoryId
        });
      } catch (error) {
        console.error('Digital Organism bridge approval failed:', error?.message || error);
        return sendJson(res, 502, {
          ok: false,
          error: 'The private Digital Organism could not record this approval.'
        });
      }
    }

    const access = await accessImpl(payload, options);
    if (!access.ok) {
      return sendJson(res, access.status || 403, { ok: false, error: access.reason || 'Unauthorized.' });
    }

    try {
      const context = await recallImpl(access.query, {
        limit: access.limit,
        sshHost: options.sshHost,
        remoteScript: options.remoteScript,
        timeoutMs: options.timeoutMs
      });
      return sendJson(res, 200, {
        ok: true,
        requestId: access.requestId,
        context
      });
    } catch (error) {
      console.error('Digital Organism bridge recall failed:', error?.message || error);
      return sendJson(res, 502, {
        ok: false,
        error: 'The private Digital Organism could not complete recall.'
      });
    }
  };
}
