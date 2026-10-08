import { createHash } from 'node:crypto';
import { verifySignedSeaPayload } from '../auth/sea.js';
import { resolveOperatorDeveloperPolicy } from '../operator/developer-access.js';
import { normalizeLead, draftReply } from './model.js';
import { openFunnelStore } from './store.js';
import { collectJobs } from './discovery.js';

export function createFunnelHandler({ config = process.env, verify = verifySignedSeaPayload, store: suppliedStore, collector = collectJobs } = {}) {
  let store = suppliedStore;
  const getStore = () => store ||= openFunnelStore(config.AUTOMATION_FUNNEL_DB);
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
    if (config.PORTAL_STANDBY === '1') return res.status(503).json({ error: 'Please try again when the primary service is available.' });
    const origin = String(req.headers?.origin || '');
    const expectedOrigin = config.PORTAL_ORIGIN || 'https://portal.3dvr.tech';
    if (origin && origin !== expectedOrigin) return res.status(403).json({ error: 'Use the 3DVR Portal to submit this request.' });
    const body = req.body || {};
    const action = body.action || 'submit';
    try {
      if (action === 'submit') {
        const db = getStore();
        // Use the immediate transport peer. Do not trust arbitrary client-supplied forwarding headers.
        const ip = req.socket?.remoteAddress || 'unknown';
        const key = createHash('sha256').update('funnel:' + ip).digest('hex');
        if (!db.rateLimit(key, { limit: 60 }) || !db.rateLimit(createHash('sha256').update('email:' + String(body.lead?.email || '').toLowerCase()).digest('hex'))) {
          return res.status(429).json({ error: 'Too many inquiries. Please try later or email 3dvr.tech@gmail.com.' });
        }
        if (body.lead?.websiteTrap) return res.status(400).json({ error: 'Unable to submit this inquiry.' });
        const lead = normalizeLead(body.lead || {}, { inbound: true });
        const saved = db.insert(lead);
        // Never reveal whether somebody else's contact record already exists.
        return res.status(201).json({ ok: true, receipt: saved.lead.id });
      }
      if (!['list', 'create', 'update', 'draft', 'discover'].includes(action)) return res.status(400).json({ error: 'Unknown action.' });
      const auth = await verify(body, { scope: 'automation-funnel', expectedOrigin, maxAgeMs: 120000, config });
      if (!auth.ok) return res.status(401).json({ error: auth.reason || 'Sign in to review leads.' });
      const policy = resolveOperatorDeveloperPolicy(config);
      if (!policy.ownerPubs.has(auth.identity.pub)) return res.status(403).json({ error: 'Only the 3DVR owner can review this pipeline.' });
      // Bind every action and its data to the signed proof; identity alone is insufficient.
      if (auth.identity.action !== action || auth.verified?.data !== JSON.stringify(body.data || {}) || auth.verified?.requestId !== body.requestId) {
        return res.status(403).json({ error: 'Request does not match its signed proof.' });
      }
      const db = getStore();
      if (!db.consumeAction(body.requestId)) return res.status(409).json({ error: 'Request already used. Try again.' });
      if (action === 'list') return res.status(200).json({ ok: true, leads: db.list() });
      if (action === 'create') return res.status(201).json({ ok: true, ...db.insert(normalizeLead(body.data)) });
      if (action === 'update') {
        const previous = db.get(body.data.id);
        if (!previous) return res.status(404).json({ error: 'Lead not found.' });
        const lead = normalizeLead({ ...previous, ...body.data.lead });
        return res.status(200).json({ ok: true, lead: db.update(previous.id, lead, body.data.version) });
      }
      if (action === 'draft') {
        const lead = db.get(body.data.id);
        if (!lead) return res.status(404).json({ error: 'Lead not found.' });
        if (lead.email && db.list().some(record => record.email === lead.email && record.stage === 'do-not-contact')) return res.status(403).json({ error: 'This contact is suppressed.' });
        return res.status(200).json({ ok: true, draft: draftReply(lead) });
      }
      if (!db.rateLimit('owner-discovery', { limit: 6 })) return res.status(429).json({ error: 'Discovery is cooling down. Try later.' });
      return res.status(200).json({ ok: true, ...await collector(db) });
    } catch (error) {
      const status = error.statusCode || (/required|valid|Confirm|Record|Complete|Choose|Source|Enter/.test(error.message) ? 400 : 503);
      return res.status(status).json({ error: status === 503 ? 'The funnel is temporarily unavailable. Please retry or email 3dvr.tech@gmail.com.' : error.message });
    }
  };
}
