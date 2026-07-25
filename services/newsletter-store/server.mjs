import crypto from 'node:crypto';
import http from 'node:http';
import { Pool } from 'pg';

const port = Number.parseInt(process.env.PORT || '8787', 10);
const token = String(process.env.NEWSLETTER_STORE_TOKEN || '');
const databaseUrl = String(process.env.DATABASE_URL || '');
if (!token || !databaseUrl) throw new Error('NEWSLETTER_STORE_TOKEN and DATABASE_URL are required.');

const pool = new Pool({ connectionString: databaseUrl, max: 4, idleTimeoutMillis: 10_000 });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 16_384) reject(new Error('Request is too large.'));
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (_) { reject(new Error('Invalid JSON.')); }
    });
    req.on('error', reject);
  });
}
function authorized(req) {
  const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return provided.length === token.length && crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(token));
}
function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }
async function upsertSubscriber(input) {
  const email = normalizeEmail(input.email);
  const source = String(input.source || 'blog').trim().slice(0, 120) || 'blog';
  const consentedAt = new Date(input.consentedAt || Date.now());
  if (!emailPattern.test(email) || Number.isNaN(consentedAt.getTime())) throw new Error('Enter a valid email.');
  await pool.query(`
    INSERT INTO newsletter_subscribers (email, source, consented_at, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (email) DO UPDATE SET
      source = EXCLUDED.source,
      consented_at = LEAST(newsletter_subscribers.consented_at, EXCLUDED.consented_at),
      unsubscribed_at = NULL,
      updated_at = NOW()
  `, [email, source, consentedAt.toISOString()]);
  return email;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/healthz' && req.method === 'GET') {
      await pool.query('SELECT 1'); return json(res, 200, { ok: true });
    }
    if (req.url === '/v1/subscribers' && req.method === 'POST') {
      if (!authorized(req)) return json(res, 401, { error: 'Unauthorized.' });
      const email = await upsertSubscriber(await readBody(req));
      return json(res, 201, { ok: true, email });
    }
    if (req.url === '/v1/subscribers' && req.method === 'GET') {
      if (!authorized(req)) return json(res, 401, { error: 'Unauthorized.' });
      const { rows } = await pool.query('SELECT email, source, consented_at FROM newsletter_subscribers WHERE unsubscribed_at IS NULL ORDER BY consented_at ASC');
      return json(res, 200, { subscribers: rows });
    }
    const sendMatch = req.url?.match(/^\/v1\/sends\/([\w-]+)\/([^/]+)$/);
    if (sendMatch && req.method === 'GET') {
      if (!authorized(req)) return json(res, 401, { error: 'Unauthorized.' });
      const { rows } = await pool.query('SELECT status FROM newsletter_sends WHERE week_key = $1 AND email = $2', [sendMatch[1], decodeURIComponent(sendMatch[2])]);
      return json(res, 200, { send: rows[0] || null });
    }
    if (sendMatch && req.method === 'PUT') {
      if (!authorized(req)) return json(res, 401, { error: 'Unauthorized.' });
      const input = await readBody(req); const email = normalizeEmail(decodeURIComponent(sendMatch[2]));
      const status = String(input.status || '');
      if (!emailPattern.test(email) || !['sending', 'sent', 'failed', 'dry-run'].includes(status)) return json(res, 400, { error: 'Invalid send record.' });
      await pool.query(`
        INSERT INTO newsletter_sends (week_key, email, status, subject, error, started_at, sent_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), CASE WHEN $3 = 'sent' THEN NOW() ELSE NULL END, NOW())
        ON CONFLICT (week_key, email) DO UPDATE SET
          status = EXCLUDED.status, subject = COALESCE(EXCLUDED.subject, newsletter_sends.subject),
          error = EXCLUDED.error, sent_at = CASE WHEN EXCLUDED.status = 'sent' THEN NOW() ELSE newsletter_sends.sent_at END,
          updated_at = NOW()
      `, [sendMatch[1], email, status, String(input.subject || '').slice(0, 300) || null, String(input.error || '').slice(0, 500) || null]);
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: 'Not found.' });
  } catch (error) {
    console.error(error); return json(res, 500, { error: 'Service error.' });
  }
});
server.listen(port, '127.0.0.1', () => console.log(`newsletter store listening on ${port}`));
