import crypto from 'node:crypto';
import http from 'node:http';
import Gun from 'gun';
import { Pool } from 'pg';
import webpush from 'web-push';

const port = Number.parseInt(process.env.PORT || '8787', 10);
const token = String(process.env.NEWSLETTER_STORE_TOKEN || '');
const databaseUrl = String(process.env.DATABASE_URL || '');
if (!token || !databaseUrl) throw new Error('NEWSLETTER_STORE_TOKEN and DATABASE_URL are required.');
const vapidSubject = String(process.env.CHAT_PUSH_VAPID_SUBJECT || 'mailto:3dvr.tech@gmail.com');
const vapidPublicKey = String(process.env.CHAT_PUSH_VAPID_PUBLIC_KEY || '');
const vapidPrivateKey = String(process.env.CHAT_PUSH_VAPID_PRIVATE_KEY || '');
const gunPeers = String(process.env.CHAT_PUSH_GUN_PEERS || 'https://relay.3dvr.tech/gun,https://gun-relay-3dvr.fly.dev/gun')
  .split(',').map(value => value.trim()).filter(Boolean);
if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

const pool = new Pool({ connectionString: databaseUrl, max: 4, idleTimeoutMillis: 10_000 });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const chatRooms = new Set(['general', 'tech', 'random', 'ideas', 'support']);

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
function cleanText(value, maxLength) { return String(value || '').trim().slice(0, maxLength); }
function normalizeRooms(value) {
  const rooms = Array.isArray(value) ? value : [];
  return [...new Set(rooms.map(room => cleanText(room, 32)).filter(room => chatRooms.has(room)))];
}
function validSubscription(value) {
  return value && typeof value === 'object' &&
    /^https:\/\//.test(cleanText(value.endpoint, 2048)) &&
    typeof value.keys?.p256dh === 'string' &&
    typeof value.keys?.auth === 'string';
}

async function saveChatSubscription(input) {
  const subscription = input.subscription;
  const userId = cleanText(input.userId, 160);
  const rooms = normalizeRooms(input.rooms);
  if (!validSubscription(subscription) || !userId || rooms.length === 0) {
    throw new Error('Invalid chat push subscription.');
  }
  await pool.query(`
    INSERT INTO chat_push_subscriptions (endpoint, user_id, subscription, rooms, user_agent, updated_at)
    VALUES ($1, $2, $3::jsonb, $4::text[], $5, NOW())
    ON CONFLICT (endpoint) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      subscription = EXCLUDED.subscription,
      rooms = EXCLUDED.rooms,
      user_agent = EXCLUDED.user_agent,
      updated_at = NOW()
  `, [subscription.endpoint, userId, JSON.stringify(subscription), rooms, cleanText(input.userAgent, 500) || null]);
}

async function removeChatSubscription(input) {
  const endpoint = cleanText(input.endpoint || input.subscription?.endpoint, 2048);
  if (!endpoint) throw new Error('Missing chat push endpoint.');
  await pool.query('DELETE FROM chat_push_subscriptions WHERE endpoint = $1', [endpoint]);
}

async function sendChatNotifications(input) {
  if (!vapidPublicKey || !vapidPrivateKey) throw new Error('Chat push VAPID is not configured.');
  const room = cleanText(input.room, 32);
  const senderId = cleanText(input.senderId, 160);
  const messageId = cleanText(input.messageId, 220);
  if (!chatRooms.has(room) || !senderId || !messageId) throw new Error('Invalid chat notification.');

  const username = cleanText(input.username, 80) || 'Someone';
  const body = cleanText(input.text, 160) || 'New message';
  const payload = JSON.stringify({
    title: `${username} in #${room}`,
    body,
    room,
    messageId,
    tag: `${room}-${messageId}`
  });
  const { rows } = await pool.query(`
    SELECT endpoint, subscription
    FROM chat_push_subscriptions
    WHERE $1 = ANY(rooms) AND user_id <> $2
  `, [room, senderId]);

  let delivered = 0;
  let removed = 0;
  await Promise.all(rows.map(async row => {
    try {
      await webpush.sendNotification(row.subscription, payload, { TTL: 300, urgency: 'high' });
      delivered += 1;
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await pool.query('DELETE FROM chat_push_subscriptions WHERE endpoint = $1', [row.endpoint]);
        removed += 1;
        return;
      }
      console.error('Chat push delivery failed', error?.statusCode || error?.message || error);
    }
  }));
  return { delivered, removed };
}

async function claimChatMessage(room, messageId) {
  const { rowCount } = await pool.query(`
    INSERT INTO chat_push_deliveries (room, message_id)
    VALUES ($1, $2)
    ON CONFLICT (room, message_id) DO NOTHING
  `, [room, messageId]);
  return rowCount === 1;
}

function startChatPushWatcher() {
  if (!vapidPublicKey || !vapidPrivateKey || gunPeers.length === 0) {
    console.warn('chat push watcher disabled: VAPID or GUN peers are not configured');
    return;
  }

  const startedAt = Date.now();
  const gun = Gun({ peers: gunPeers, localStorage: false, radisk: false });
  const processMessage = (room, message, messageId) => {
    const createdAt = Number(message?.createdAt || 0);
    if (!message || !messageId || !createdAt || !message.sender || typeof message.text !== 'string' ||
        createdAt < startedAt - 30_000) return;

    claimChatMessage(room, cleanText(messageId, 220))
      .then(claimed => claimed ? sendChatNotifications({
        room,
        messageId,
        senderId: message.sender,
        username: message.username,
        text: message.text
      }) : null)
      .catch(error => console.error('Chat push watcher failed', error));
  };

  for (const room of chatRooms) {
    const roomNode = gun.get('3dvr-chat').get(room);
    roomNode.map().on((message, messageId) => processMessage(room, message, messageId));
    setInterval(() => {
      roomNode.map().once((message, messageId) => processMessage(room, message, messageId));
    }, 5_000).unref();
  }
  console.log(`chat push watcher listening on ${gunPeers.length} GUN peer(s)`);
}
async function upsertSubscriber(input) {
  const email = normalizeEmail(input.email);
  const source = String(input.source || 'blog').trim().slice(0, 120) || 'blog';
  const consentedAt = new Date(input.consentedAt || Date.now());
  const resubscribe = input.resubscribe === true;
  if (!emailPattern.test(email) || Number.isNaN(consentedAt.getTime())) throw new Error('Enter a valid email.');
  await pool.query(`
    INSERT INTO newsletter_subscribers (email, source, consented_at, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (email) DO UPDATE SET
      source = EXCLUDED.source,
      consented_at = LEAST(newsletter_subscribers.consented_at, EXCLUDED.consented_at),
      unsubscribed_at = CASE WHEN $4 THEN NULL ELSE newsletter_subscribers.unsubscribed_at END,
      updated_at = NOW()
  `, [email, source, consentedAt.toISOString(), resubscribe]);
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
    if (req.url === '/v1/chat/subscribe' && req.method === 'POST') {
      if (!authorized(req)) return json(res, 401, { error: 'Unauthorized.' });
      await saveChatSubscription(await readBody(req));
      return json(res, 201, { ok: true });
    }
    if (req.url === '/v1/chat/unsubscribe' && req.method === 'POST') {
      if (!authorized(req)) return json(res, 401, { error: 'Unauthorized.' });
      await removeChatSubscription(await readBody(req));
      return json(res, 200, { ok: true });
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
server.listen(port, '127.0.0.1', () => {
  console.log(`newsletter store listening on ${port}`);
  startChatPushWatcher();
});
