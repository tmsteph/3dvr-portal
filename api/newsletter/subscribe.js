const { portalCrmNode, portalCrmTouchLogNode } = require('../../apps/agent/thomas-agent/node/gun-db');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value, max = 160) {
  return String(value || '').trim().slice(0, max);
}

function slug(value) {
  return clean(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'subscriber';
}

function put(node, payload) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('CRM relay write timed out')), 10000);
    node.put(payload, ack => {
      if (ack?.err) finish(new Error(String(ack.err)));
      else finish(null, ack || {});
    });
  });
}

module.exports = async function subscribe(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://portal.3dvr.tech');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST required' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const email = clean(body.email, 240).toLowerCase();
  const source = clean(body.source, 120) || 'blog';
  if (!EMAIL_PATTERN.test(email)) return res.status(400).json({ ok: false, error: 'Valid email required' });
  if (body.consent !== true) return res.status(400).json({ ok: false, error: 'Explicit consent required' });

  const now = new Date().toISOString();
  const id = `subscriber-${slug(email)}`;
  const record = {
    id, recordType: 'person', name: email, email,
    tags: ['blog-subscriber', 'digital-nomad', 'inbound'], status: 'new', warmth: 'warm',
    source: `blog:${source}`,
    nextBestAction: 'Send the next practical transition note; honor unsubscribe requests.',
    created: now, updated: now,
    notes: `Opt-in signup from ${source}. Consent recorded ${now}.`,
  };
  const touch = {
    id: `touch-blog-${slug(email)}-${Date.now()}`, recordId: id,
    contactName: email, contactEmail: email, type: 'inbound', channel: 'blog',
    source: `blog:${source}`, summary: 'Opt-in email subscriber captured from article.',
    outcome: 'Subscribed; permission-based content only.',
    message: JSON.stringify({ email, source, consent: true }), created: now, updated: now,
  };

  try {
    await Promise.all([
      put(portalCrmNode().get(id), record),
      put(portalCrmTouchLogNode().get(touch.id), touch),
    ]);
    return res.status(200).json({ ok: true, id });
  } catch (error) {
    console.error('[newsletter/subscribe]', error);
    return res.status(503).json({ ok: false, error: 'CRM relay unavailable' });
  }
};
