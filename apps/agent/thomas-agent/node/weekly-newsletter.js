const crypto = require('crypto');
const { ImapFlow } = require('imapflow');
const { createGmailTransport } = require('./gmail-transport');
const { portalCrmNode, gun } = require('./gun-db');

const NEWSLETTER_ROOT = gun.get('3dvr-portal').get('newsletter-weekly');
const RELAY_READ_MS = Number.parseInt(process.env.NEWSLETTER_RELAY_READ_MS || '4000', 10);
const DRY_RUN = /^(1|true|yes|on)$/i.test(String(process.env.NEWSLETTER_DRY_RUN || '').trim());
const FROM = process.env.NEWSLETTER_FROM || process.env.GMAIL_USER || '3dvr.tech@gmail.com';
const REPLY_TO = process.env.NEWSLETTER_REPLY_TO || '3dvr.tech@gmail.com';

function nowIso() { return new Date().toISOString(); }
function weekKey(date = new Date()) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  return `${copy.getUTCFullYear()}-W${String(Math.ceil((((copy - yearStart) / 86400000) + 1) / 7)).padStart(2, '0')}`;
}
function emailKey(email) { return crypto.createHash('sha256').update(email).digest('hex').slice(0, 24); }
function text(value) { return String(value || '').trim(); }
function isSubscriber(record) {
  const tags = Array.isArray(record?.tags) ? record.tags : text(record?.tags).split(',');
  const tagSet = new Set(tags.map((tag) => text(tag).toLowerCase()));
  const status = text(record?.status).toLowerCase();
  return Boolean(record?.email)
    && tagSet.has('blog-subscriber')
    && !tagSet.has('unsubscribed')
    && !tagSet.has('newsletter-unsubscribed')
    && !['unsubscribed', 'do-not-contact', 'bounced'].includes(status)
    && /consent recorded|permission-based|subscribed/i.test(text(record?.notes) + ' ' + text(record?.nextBestAction));
}
function once(node, timeout = RELAY_READ_MS) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, timeout);
    node.once((data) => { if (!done) { done = true; clearTimeout(timer); resolve(data || null); } });
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
            found.set(email, { id: `subscriber-${emailKey(email)}`, email, tags: ['blog-subscriber', 'digital-nomad', 'inbound'], status: 'new', notes: `Consent recorded ${text(record.at) || nowIso()}. Imported from signup mailbox.` });
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
function put(node, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Gun write timeout')), 5000);
    node.put(payload, (ack) => { clearTimeout(timer); if (ack?.err) reject(new Error(ack.err)); else resolve(ack || {}); });
  });
}
async function collectSubscribers() {
  const mailboxSubscribers = await collectMailboxSubscribers();
  return new Promise((resolve) => {
    const found = new Map();
    portalCrmNode().map().once((record) => {
      if (!isSubscriber(record)) return;
      const email = text(record.email).toLowerCase();
      found.set(email, { ...record, email });
    });
    setTimeout(() => {
      for (const subscriber of mailboxSubscribers) found.set(subscriber.email, subscriber);
      resolve([...found.values()].sort((a, b) => a.email.localeCompare(b.email)));
    }, RELAY_READ_MS);
  });
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
    const id = emailKey(subscriber.email);
    const node = NEWSLETTER_ROOT.get(week).get(id);
    const prior = await once(node, 1800);
    if (prior?.status === 'sent') { result.skipped += 1; continue; }
    const started = nowIso();
    await put(node, { id, week, email: subscriber.email, status: DRY_RUN ? 'dry-run' : 'sending', startedAt: started, updatedAt: started });
    try {
      if (!DRY_RUN) await transport.sendMail({
        from: FROM, to: subscriber.email, replyTo: REPLY_TO, subject: mail.subject,
        text: mail.text, html: mail.html,
        headers: { 'List-Unsubscribe': `<mailto:${REPLY_TO}?subject=unsubscribe>`, 'Precedence': 'bulk' },
      });
      await put(node, { id, week, email: subscriber.email, status: DRY_RUN ? 'dry-run' : 'sent', sentAt: nowIso(), updatedAt: nowIso(), subject: mail.subject });
      result.sent += 1;
    } catch (error) {
      await put(node, { id, week, email: subscriber.email, status: 'failed', error: text(error.message).slice(0, 300), updatedAt: nowIso() });
      result.failed.push({ email: subscriber.email, error: text(error.message).slice(0, 300) });
    }
  }
  console.log(JSON.stringify(result, null, 2));
  // Gun keeps relay sockets open after the work is complete; explicitly end the
  // worker so scheduled CI runs do not hang after a successful send/dry-run.
  process.exit(result.failed.length ? 1 : 0);
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
