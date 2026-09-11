const { ImapFlow } = require('imapflow');

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  const email = normalizeText(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function legacyGmailConfigured(config = process.env) {
  return Boolean(normalizeEmail(config.GMAIL_USER) && normalizeText(config.GMAIL_APP_PASSWORD));
}

function legacyAccount(config = process.env) {
  if (!legacyGmailConfigured(config)) return null;
  return {
    id: 'acct_google_legacy_3dvr',
    provider: 'google',
    alias: '3dvr',
    email: normalizeEmail(config.GMAIL_USER),
    scopes: ['gmail.readonly'],
    status: 'connected',
  };
}

function clientOptions(config = process.env) {
  if (!legacyGmailConfigured(config)) throw new Error('Legacy Gmail credentials are not configured.');
  return {
    host: normalizeText(config.THREEDVR_INBOX_IMAP_HOST) || 'imap.gmail.com',
    port: Number(config.THREEDVR_INBOX_IMAP_PORT || 993),
    secure: !/^(0|false|no|off)$/i.test(String(config.THREEDVR_INBOX_IMAP_TLS || 'true')),
    auth: {
      user: normalizeEmail(config.GMAIL_USER),
      pass: normalizeText(config.GMAIL_APP_PASSWORD),
    },
    logger: false,
  };
}

function formatAddress(address) {
  if (!address) return '';
  const name = normalizeText(address.name);
  const email = normalizeEmail(address.address);
  if (name && email) return `${name} <${email}>`;
  return email || name;
}

function summarize(message) {
  const envelope = message.envelope || {};
  return {
    id: String(message.uid),
    uid: message.uid,
    threadId: '',
    from: (envelope.from || []).map(formatAddress).filter(Boolean),
    to: (envelope.to || []).map(formatAddress).filter(Boolean),
    subject: normalizeText(envelope.subject) || '(no subject)',
    date: envelope.date instanceof Date ? envelope.date.toISOString() : '',
    flags: [...(message.flags || [])],
  };
}
async function withMailbox(action, { config = process.env, mailbox = 'INBOX' } = {}) {
  const client = new ImapFlow(clientOptions(config));
  try {
    await client.connect();
    await client.mailboxOpen(mailbox);
    return await action(client);
  } finally {
    await client.logout().catch(() => {});
  }
}

async function searchLegacyMessages({ query = '', maxResults = 25, config = process.env } = {}) {
  const account = legacyAccount(config);
  if (!account) throw new Error('Legacy Gmail account is not configured.');
  const limit = Math.max(1, Math.min(100, Number(maxResults) || 25));
  return withMailbox(async (client) => {
    const criteria = normalizeText(query) ? { gmailraw: normalizeText(query) } : { all: true };
    const matches = await client.search(criteria, { uid: true });
    const uids = (matches || []).slice(-limit).reverse();
    if (!uids.length) return { account, messages: [], resultSizeEstimate: 0 };
    const messages = [];
    for await (const message of client.fetch(uids, {
      uid: true, envelope: true, flags: true,
    }, { uid: true })) {
      messages.push(summarize(message));
    }
    messages.sort((a, b) => b.uid - a.uid);
    return { account, messages, resultSizeEstimate: matches.length };
  }, { config });
}
async function readLegacyMessage({ messageId, format = 'metadata', config = process.env } = {}) {
  const account = legacyAccount(config);
  if (!account) throw new Error('Legacy Gmail account is not configured.');
  const uid = Number.parseInt(String(messageId || ''), 10);
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('Legacy Gmail message id must be a positive IMAP UID.');

  return withMailbox(async (client) => {
    const rows = [];
    const wantSource = format === 'full';
    for await (const message of client.fetch([uid], {
      uid: true, envelope: true, flags: true, source: wantSource,
    }, { uid: true })) {
      rows.push(message);
    }
    if (!rows.length) throw new Error(`Legacy Gmail message ${uid} was not found.`);
    const summary = summarize(rows[0]);
    if (wantSource) {
      summary.raw = rows[0].source ? rows[0].source.toString('utf8').slice(0, 100000) : '';
    }
    return { account, message: summary };
  }, { config });
}

module.exports = {
  clientOptions,
  legacyAccount,
  legacyGmailConfigured,
  readLegacyMessage,
  searchLegacyMessages,
};
