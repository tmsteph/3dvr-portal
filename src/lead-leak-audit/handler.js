import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import { normalizeAuditRequest, auditNotification, notifyEmail } from './model.js';
import { openAuditStore } from './store.js';

// Public intake for the Lead Leak Audit page, following the automation
// funnel handler pattern (src/automation-funnel/handler.js): POST only,
// exact-origin check, IP and email rate limits, a honeypot field, and a
// durable SQLite record. The stored record is authoritative; the email
// notification to Thomas is best-effort and never loses a request.
function createMailTransport(config) {
  const user = String(config.GMAIL_USER || '').trim();
  const pass = String(config.GMAIL_APP_PASSWORD || '').trim();
  if (!user || !pass) return null;
  return nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
}

export function createLeadLeakAuditHandler({ config = process.env, store: suppliedStore, mailTransport } = {}) {
  let store = suppliedStore;
  const getStore = () => store ||= openAuditStore(config.LEAD_LEAK_AUDIT_DB);
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
    if (config.PORTAL_STANDBY === '1') return res.status(503).json({ error: 'Please try again when the primary service is available.' });
    const origin = String(req.headers?.origin || '');
    const expectedOrigin = config.PORTAL_ORIGIN || 'https://portal.3dvr.tech';
    if (origin && origin !== expectedOrigin) return res.status(403).json({ error: 'Use the 3DVR Portal to submit this request.' });
    const body = req.body || {};
    try {
      const db = getStore();
      // Use the immediate transport peer. Do not trust arbitrary client-supplied forwarding headers.
      const ip = req.socket?.remoteAddress || 'unknown';
      const ipKey = createHash('sha256').update('audit:' + ip).digest('hex');
      const emailKey = createHash('sha256').update('email:' + String(body.request?.email || '').toLowerCase()).digest('hex');
      if (!db.rateLimit(ipKey, { limit: 60 }) || !db.rateLimit(emailKey)) {
        return res.status(429).json({ error: 'Too many requests. Please try later or email 3dvrtech@gmail.com.' });
      }
      if (body.request?.websiteTrap) return res.status(400).json({ error: 'Unable to submit this request.' });
      const request = normalizeAuditRequest(body.request || {});
      const saved = db.insert(request);
      let notified = Boolean(saved.request.notified);
      if (!saved.duplicate && !notified) {
        try {
          const transport = mailTransport !== undefined ? mailTransport : createMailTransport(config);
          if (transport) {
            const note = auditNotification(saved.request);
            await transport.sendMail({
              from: '"3DVR Lead Leak Audit" <' + String(config.GMAIL_USER || '').trim() + '>',
              to: notifyEmail(config),
              replyTo: request.email,
              subject: note.subject,
              text: note.body + '\n\nReceipt: ' + saved.request.id
            });
            db.markNotified(saved.request.id);
            notified = true;
          }
        } catch {
          // The request is already stored; notification can be retried from the record.
          notified = false;
        }
      }
      // Never reveal whether somebody else's request already exists.
      return res.status(201).json({ ok: true, receipt: saved.request.id, notified });
    } catch (error) {
      const status = error.statusCode || (/required|valid|Complete|Enter/.test(error.message) ? 400 : 503);
      return res.status(status).json({ error: status === 503 ? 'The audit intake is temporarily unavailable. Please retry or email 3dvrtech@gmail.com.' : error.message });
    }
  };
}
