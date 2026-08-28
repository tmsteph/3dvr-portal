const { ImapFlow } = require('imapflow');
const { createGmailTransport } = require('./gmail-transport');
const { acquireEmailSend, markEmailSent, markEmailUncertain } = require('./email-idempotency');
const DRY_RUN = /^(1|true|yes|on)$/i.test(String(process.env.NEWSLETTER_DRY_RUN || '').trim());
const FROM = process.env.NEWSLETTER_FROM || process.env.GMAIL_USER || '3dvr.tech@gmail.com';
const REPLY_TO = process.env.NEWSLETTER_REPLY_TO || '3dvr.tech@gmail.com';
const STORE_URL = text(process.env.NEWSLETTER_STORE_URL).replace(/\/$/, '');
const STORE_TOKEN = text(process.env.NEWSLETTER_STORE_TOKEN);

function nowIso() { return new Date().toISOString(); }
function weekKey(date = new Date()) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  return `${copy.getUTCFullYear()}-W${String(Math.ceil((((copy - yearStart) / 86400000) + 1) / 7)).padStart(2, '0')}`;
}
function text(value) { return String(value || '').trim(); }
async function store(path, options = {}) {
  if (!STORE_URL || !STORE_TOKEN) throw new Error('NEWSLETTER_STORE_URL and NEWSLETTER_STORE_TOKEN are required.');
  const response = await fetch(`${STORE_URL}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${STORE_TOKEN}`, 'content-type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Newsletter store returned ${response.status}.`);
  return response.json();
}
async function saveSubscriber(record) {
  return store('/v1/subscribers', {
    method: 'POST',
    body: JSON.stringify({ email: record.email, source: record.source || 'mailbox-import', consentedAt: record.consentedAt || record.at || nowIso() })
  });
}
async function collectMailboxSubscribers() {
  const user = text(process.env.GMAIL_USER);
  const pass = text(process.env.GMAIL_APP_PASSWORD);
  if (!user || !pass) return [];
  const client = new ImapFlow({ host: process.env.THREEDVR_GMAIL_IMAP_HOST || 'imap.gmail.com', port: 993, secure: true, auth: { user, pass }, logger: false });
  const found = new Map();
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const ids = await client.search({ header: ['X-3DVR-Blog-Signup', 'record'] }, { uid: true });
      for await (const message of client.fetch(ids.slice(-500), { source: true }, { uid: true })) {
        const raw = Buffer.isBuffer(message.source) ? message.source.toString('utf8') : text(message.source);
        const match = raw.match(/\{\s*"type"\s*:\s*"blog-signup"[\s\S]*?\}/);
        if (!match) continue;
        try {
          const record = JSON.parse(match[0]);
          const email = text(record.email).toLowerCase();
          if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && record.consent === true) {
            found.set(email, { email, source: record.source || 'mailbox-import', consentedAt: text(record.at) || nowIso() });
          }
        } catch (_) {}
      }
    } finally { lock.release(); }
  } catch (error) {
    console.warn(`Mailbox subscriber import skipped: ${text(error.message)}`);
  } finally {
    await client.logout().catch(() => {});
  }
  return [...found.values()];
}
async function collectSubscribers() {
  const mailboxSubscribers = await collectMailboxSubscribers();
  for (const subscriber of mailboxSubscribers) await saveSubscriber(subscriber);
  const result = await store('/v1/subscribers');
  return (result.subscribers || []).map(record => ({ ...record, email: text(record.email).toLowerCase() }));
}
function issue() {
  return {
    subject: 'A field note: build one paid bridge',
    text: `Hi there,\n\nThis week’s note: if your day job is draining you, do not begin with a dramatic leap. Build one paid bridge.\n\nChoose a problem you already know how to solve, describe one useful outcome, put a price on it, and talk to ten plausible buyers. The goal is not to become a different person overnight. It is to create evidence and options while your current responsibilities still have to work.\n\nA good first bridge is small enough to deliver this month and specific enough that someone can say yes or no. Keep the promises honest, record what you learn, and improve the offer from real conversations.\n\nRead the field guide: https://portal.3dvr.tech/blog/\n\n— Thomas / 3DVR\n\nYou asked to receive these weekly notes. To unsubscribe, reply to this email with “unsubscribe”.`,
    html: '<p>Hi there,</p><p><strong>This week’s note:</strong> if your day job is draining you, do not begin with a dramatic leap. Build one paid bridge.</p><p>Choose a problem you already know how to solve, describe one useful outcome, put a price on it, and talk to ten plausible buyers. The goal is not to become a different person overnight. It is to create evidence and options while your current responsibilities still have to work.</p><p>A good first bridge is small enough to deliver this month and specific enough that someone can say yes or no. Keep the promises honest, record what you learn, and improve the offer from real conversations.</p><p><a href="https://portal.3dvr.tech/blog/">Read the field guide →</a></p><p>— Thomas / 3DVR</p><hr><p style="font-size:12px;color:#666">You asked to receive these weekly notes. To unsubscribe, reply to this email with “unsubscribe”.</p>',
  };
}
async function main() {
  const week = process.env.NEWSLETTER_WEEK || weekKey();
  const subscribers = await collectSubscribers();
  const mail = issue();
  const transport = DRY_RUN ? null : createGmailTransport();
  const result = { week, dryRun: DRY_RUN, subscribers: subscribers.length, sent: 0, skipped: 0, failed: [] };
  for (const subscriber of subscribers) {
    const path = `/v1/sends/${encodeURIComponent(week)}/${encodeURIComponent(subscriber.email)}`;
    const prior = await store(path);
    if (prior.send?.status === 'sent') { result.skipped += 1; continue; }
    let reservation = null;
    if (!DRY_RUN) {
      reservation = acquireEmailSend({ from: FROM, to: subscriber.email, subject: mail.subject, text: mail.text });
      if (!reservation.ok) {
        result.skipped += 1;
        await store(path, { method: 'PUT', body: JSON.stringify({ status: 'duplicate-blocked', idempotencyKey: reservation.key }) });
        continue;
      }
    }
    await store(path, { method: 'PUT', body: JSON.stringify({ status: DRY_RUN ? 'dry-run' : 'sending', idempotencyKey: reservation?.key || '' }) });
    try {
      if (!DRY_RUN) await transport.sendMail({
        from: FROM, to: subscriber.email, replyTo: REPLY_TO, subject: mail.subject,
        text: mail.text, html: mail.html,
        ...(reservation?.key ? { messageId: `<3dvr-${reservation.key}@3dvr.tech>` } : {}),
        headers: { 'List-Unsubscribe': `<mailto:${REPLY_TO}?subject=unsubscribe>`, 'Precedence': 'bulk' },
      });
      if (reservation) markEmailSent(reservation, { week, subscriber: subscriber.email });
      await store(path, { method: 'PUT', body: JSON.stringify({ status: DRY_RUN ? 'dry-run' : 'sent', subject: mail.subject, idempotencyKey: reservation?.key || '' }) });
      result.sent += 1;
    } catch (error) {
      if (reservation) markEmailUncertain(reservation, error);
      await store(path, { method: 'PUT', body: JSON.stringify({ status: 'uncertain', error: text(error.message).slice(0, 300), idempotencyKey: reservation?.key || '' }) });
      result.failed.push({ email: subscriber.email, error: text(error.message).slice(0, 300) });
    }
  }
  console.log(JSON.stringify(result, null, 2));
  // Gun keeps relay sockets open after the work is complete; explicitly end the
  // worker so scheduled CI runs do not hang after a successful send/dry-run.
  process.exit(result.failed.length ? 1 : 0);
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
