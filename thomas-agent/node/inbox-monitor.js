const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { ImapFlow } = require('imapflow');
const { getOAuthAccessToken } = require('./oauth-connection');
const { appendContactFooter, buildContactFooter } = require('./contact-footer');

const ROOT = path.join(__dirname, '..');
const STATE_DIR = process.env.THREEDVR_AUTOPILOT_STATE_DIR || path.join(ROOT, 'state');
const STATE_FILE = process.env.THREEDVR_INBOX_STATE_FILE || path.join(STATE_DIR, 'inbox-monitor-state.json');
const LEADS_FILE = process.env.THREEDVR_LEADS_FILE || path.join(ROOT, 'leads.csv');
const DEFAULT_TOKEN_FILE = process.env.THREEDVR_AUTOPILOT_EMAIL_TOKEN_FILE || path.join(os.homedir(), '.3dvr-agent-operator-email-token');
const DEFAULT_NOTIFY_EMAIL = normalizeEmail(
  process.env.THREEDVR_AUTOPILOT_NOTIFY_EMAIL
  || process.env.GMAIL_USER
  || '3dvr.tech@gmail.com'
);
const DEFAULT_PORTAL_EMAIL_ENDPOINT = normalizeText(
  process.env.THREEDVR_AUTOPILOT_EMAIL_ENDPOINT
  || process.env.THREEDVR_OUTREACH_EMAIL_ENDPOINT
  || 'https://portal.3dvr.tech/api/calendar/reminder-email'
);
const DEFAULT_PORTAL_EMAIL_TOKEN = normalizeText(
  process.env.THREEDVR_AUTOPILOT_EMAIL_TOKEN
  || process.env.THREEDVR_OUTREACH_EMAIL_TOKEN
  || process.env.AGENT_OPERATOR_EMAIL_TOKEN
  || readOptionalFile(DEFAULT_TOKEN_FILE)
);
const DEFAULT_IMAP_HOST = normalizeText(process.env.THREEDVR_INBOX_IMAP_HOST || 'imap.gmail.com');
const DEFAULT_IMAP_PORT = parseInteger(process.env.THREEDVR_INBOX_IMAP_PORT, 993);
const DEFAULT_IMAP_TLS = !/^(0|false|no|off)$/i.test(String(process.env.THREEDVR_INBOX_IMAP_TLS || 'true').trim());
const DEFAULT_MAILBOX = normalizeText(process.env.THREEDVR_INBOX_MAILBOX || 'INBOX');
const DEFAULT_POLL_LIMIT = parseInteger(process.env.THREEDVR_INBOX_LIMIT, 10);
const DEFAULT_AUTO_REPLY = /^(1|true|yes|on)$/i.test(String(process.env.THREEDVR_INBOX_AUTO_REPLY || '').trim());
const DEFAULT_AUTO_REPLY_LIMIT = parseInteger(process.env.THREEDVR_INBOX_AUTO_REPLY_LIMIT, 1);
const DEFAULT_AUTO_REPLY_MIN_DELAY_MINUTES = parseInteger(process.env.THREEDVR_INBOX_AUTO_REPLY_MIN_DELAY_MINUTES, 0);
const DEFAULT_AUTO_REPLY_MAX_DELAY_MINUTES = parseInteger(process.env.THREEDVR_INBOX_AUTO_REPLY_MAX_DELAY_MINUTES, 0);
const DEFAULT_AUTO_REPLY_MIN_GAP_MINUTES = parseInteger(process.env.THREEDVR_INBOX_AUTO_REPLY_MIN_GAP_MINUTES, 0);
const DEFAULT_AUTO_REPLY_DELAY_MODE = normalizeText(process.env.THREEDVR_INBOX_AUTO_REPLY_DELAY_MODE || 'adaptive').toLowerCase();
const DEFAULT_REPLY_SENDER_NAME = normalizeText(process.env.THREEDVR_INBOX_AUTO_REPLY_SENDER_NAME || 'Thomas @ 3DVR');
const DEFAULT_REPLY_SENDER_EMAIL = normalizeEmail(
  process.env.THREEDVR_INBOX_AUTO_REPLY_SENDER_EMAIL
  || process.env.GMAIL_USER
  || '3dvr.tech@gmail.com'
);
const DEFAULT_GMAIL_USER = normalizeEmail(process.env.GMAIL_USER) || '3dvr.tech@gmail.com';
const DEFAULT_REPLY_MODE = normalizeText(process.env.THREEDVR_INBOX_REPLY_MODE || 'local').toLowerCase();
const DEFAULT_LOCAL_MODEL = normalizeText(
  process.env.THREEDVR_INBOX_LOCAL_MODEL
  || path.join(os.homedir(), '.cache/huggingface/hub/models--Qwen--Qwen2.5-Coder-1.5B-Instruct-GGUF/snapshots/f86cb2c1fa58255f8052cc32aeede1b7482d4361/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf')
);
const DEFAULT_LLAMA_CLI = normalizeText(
  process.env.THREEDVR_INBOX_LLAMA_CLI
  || process.env.LLAMA_CLI
  || path.join(os.homedir(), 'llama.cpp/build/bin/llama-cli')
);
const DEFAULT_LLM_MODEL = normalizeText(process.env.THREEDVR_INBOX_LLM_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini');
const DEFAULT_LLM_TEMPERATURE = parseNumber(process.env.THREEDVR_INBOX_LLM_TEMPERATURE, 0.95);
const DEFAULT_LOCAL_LLM_TEMPERATURE = parseNumber(process.env.THREEDVR_INBOX_LOCAL_TEMPERATURE, 0.35);
const DEFAULT_LLM_MAX_TOKENS = parseInteger(process.env.THREEDVR_INBOX_LLM_MAX_TOKENS, 220);
const DEFAULT_LOCAL_LLM_TOKENS = parseInteger(process.env.THREEDVR_INBOX_LOCAL_TOKENS, 160);
const DEFAULT_LOCAL_LLM_CONTEXT = parseInteger(process.env.THREEDVR_INBOX_LOCAL_CONTEXT, 2048);
const DEFAULT_LOCAL_LLM_TIMEOUT_MS = parseInteger(process.env.THREEDVR_INBOX_LOCAL_TIMEOUT_MS, 120000);

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  const email = normalizeText(value).toLowerCase();
  if (!email) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseNumber(value, fallback) {
  const parsed = Number.parseFloat(String(value || ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readOptionalFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return '';
    return normalizeText(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return '';
  }
}

function ensureStateDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function loadState() {
  ensureStateDir();
  if (!fs.existsSync(STATE_FILE)) {
    return {
      version: 2,
      seen: {},
      messages: {},
      lastAlertAt: '',
      lastAutoReplyAt: '',
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return {
      version: 2,
      seen: parsed && typeof parsed.seen === 'object' ? parsed.seen : {},
      messages: parsed && typeof parsed.messages === 'object' ? parsed.messages : {},
      lastAlertAt: normalizeText(parsed?.lastAlertAt),
      lastAutoReplyAt: normalizeText(parsed?.lastAutoReplyAt),
    };
  } catch {
    return {
      version: 2,
      seen: {},
      messages: {},
      lastAlertAt: '',
      lastAutoReplyAt: '',
    };
  }
}

function saveState(state) {
  ensureStateDir();
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

function usage() {
  console.log(`Usage:
  ask-inbox [--dry-run] [--limit 10] [--reply-preview]

Environment:
  3dvr connect                                  recommended Gmail OAuth setup
  THREEDVR_GMAIL_AUTH                           oauth to force saved Google OAuth
  GMAIL_USER / GMAIL_APP_PASSWORD               legacy fallback for Gmail IMAP access
  THREEDVR_INBOX_IMAP_HOST                      default imap.gmail.com
  THREEDVR_INBOX_IMAP_PORT                      default 993
  THREEDVR_INBOX_IMAP_TLS                       default true
  THREEDVR_INBOX_MAILBOX                        default INBOX
  THREEDVR_INBOX_LIMIT                          default 10
  THREEDVR_AUTOPILOT_NOTIFY_EMAIL               operator alert recipient
  THREEDVR_AUTOPILOT_EMAIL_ENDPOINT             portal email relay endpoint
  THREEDVR_AUTOPILOT_EMAIL_TOKEN                portal email relay token
  THREEDVR_AUTOPILOT_EMAIL_TOKEN_FILE           optional token file path
  THREEDVR_INBOX_AUTO_REPLY                     true to auto-reply to matched contacted leads
  THREEDVR_INBOX_AUTO_REPLY_LIMIT               max automated replies per run
  THREEDVR_INBOX_AUTO_REPLY_MIN_DELAY_MINUTES   lower bound before auto-reply
  THREEDVR_INBOX_AUTO_REPLY_MAX_DELAY_MINUTES   upper bound before auto-reply
  THREEDVR_INBOX_AUTO_REPLY_MIN_GAP_MINUTES     minimum gap between automated replies
  THREEDVR_INBOX_AUTO_REPLY_DELAY_MODE          adaptive | random
  THREEDVR_INBOX_AUTO_REPLY_SENDER_NAME         default Thomas @ 3DVR
  THREEDVR_INBOX_AUTO_REPLY_SENDER_EMAIL        default 3dvr.tech@gmail.com
  THREEDVR_INBOX_REPLY_MODE                     local | openai | llm | template, default local
  THREEDVR_INBOX_LLAMA_CLI                      local llama-cli path
  THREEDVR_INBOX_LOCAL_MODEL                    local GGUF model path
  OPENAI_API_KEY                                used for OpenAI fallback
  THREEDVR_INBOX_LLM_MODEL                      default gpt-4o-mini
  THREEDVR_INBOX_LLM_TEMPERATURE                default 0.95
  THREEDVR_INBOX_LLM_MAX_TOKENS                 default 220`);
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    limit: DEFAULT_POLL_LIMIT,
    replyPreview: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--limit') {
      options.limit = parseInteger(argv[++index], DEFAULT_POLL_LIMIT);
    } else if (arg === '--reply-preview') {
      options.replyPreview = true;
    } else if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  options.limit = Math.max(1, options.limit || DEFAULT_POLL_LIMIT);
  return options;
}

function formatAddress(address) {
  if (!address) return '';
  const name = normalizeText(address.name);
  const email = normalizeEmail(address.address);
  if (name && email) return `${name} <${email}>`;
  return email || name;
}

function formatSubject(subject) {
  const value = normalizeText(subject);
  return value || '(no subject)';
}

function parseAddressEmail(value) {
  const normalized = normalizeText(value);
  const match = normalized.match(/<([^>]+)>$/);
  return normalizeEmail(match ? match[1] : normalized);
}

function parseSourceHeaders(source) {
  const headerBlock = String(source || '').split(/\r?\n\r?\n/, 1)[0] || '';
  const headers = {};
  let currentName = '';

  for (const line of headerBlock.split(/\r?\n/)) {
    if (!line) continue;
    if (/^\s/.test(line) && currentName) {
      headers[currentName] = `${headers[currentName]} ${normalizeText(line)}`.trim();
      continue;
    }

    const separator = line.indexOf(':');
    if (separator === -1) continue;
    currentName = line.slice(0, separator).trim().toLowerCase();
    headers[currentName] = line.slice(separator + 1).trim();
  }

  return headers;
}

function snippet(text) {
  const value = normalizeText(String(text || ''));
  if (!value) return '';
  if (
    /content-transfer-encoding:/i.test(value)
    || /content-type:/i.test(value)
    || /--[a-z0-9]{8,}/i.test(value)
  ) {
    return '';
  }
  return value.replace(/\s+/g, ' ').slice(0, 220);
}

function summarizeMessage(message) {
  const envelope = message.envelope || {};
  const from = Array.isArray(envelope.from) && envelope.from.length ? formatAddress(envelope.from[0]) : 'unknown sender';
  const replyTo = Array.isArray(envelope.replyTo) && envelope.replyTo.length ? formatAddress(envelope.replyTo[0]) : '';
  const subject = formatSubject(envelope.subject);
  const date = envelope.date instanceof Date && !Number.isNaN(envelope.date.getTime())
    ? envelope.date.toISOString()
    : '';
  const sourceHeaders = parseSourceHeaders(message.sourceText || '');
  const replyMessageId = normalizeText(sourceHeaders['message-id'] || envelope.messageId || `uid-${message.uid}`);
  const references = normalizeText(sourceHeaders.references);
  const preview = snippet(message.bodyText || '');

  return {
    uid: message.uid,
    messageId: replyMessageId,
    from,
    fromEmail: parseAddressEmail(from),
    replyTo,
    replyToEmail: parseAddressEmail(replyTo),
    subject,
    date,
    preview,
    inReplyTo: normalizeText(sourceHeaders['in-reply-to']),
    references,
  };
}

async function loadUnreadMessages(limit) {
  const authMode = normalizeText(process.env.THREEDVR_GMAIL_AUTH).toLowerCase();
  const configuredUser = DEFAULT_GMAIL_USER;
  const pass = normalizeText(process.env.GMAIL_APP_PASSWORD);
  let user = configuredUser;
  let auth;

  if (authMode === 'oauth' || !pass) {
    const connection = await getOAuthAccessToken('google');
    user = connection.email || configuredUser;
    if (!(user && connection.accessToken)) {
      throw new Error('Google OAuth connection is missing an email or access token.');
    }
    auth = {
      user,
      accessToken: connection.accessToken,
    };
  } else {
    if (!pass) {
      throw new Error('GMAIL_APP_PASSWORD or a Google OAuth connection are required for inbox monitoring.');
    }
    auth = {
      user,
      pass,
    };
  }

  const client = new ImapFlow({
    host: DEFAULT_IMAP_HOST,
    port: DEFAULT_IMAP_PORT,
    secure: DEFAULT_IMAP_TLS,
    auth,
    logger: false,
  });

  const rows = [];

  try {
    await client.connect();
    await client.mailboxOpen(DEFAULT_MAILBOX);

    const sequence = await client.search({ seen: false });
    const unreadUids = sequence.slice(-limit).reverse();
    if (!unreadUids.length) {
      return [];
    }

    for await (const message of client.fetch(unreadUids, {
      uid: true,
      envelope: true,
      source: true,
    })) {
      let sourceText = '';
      let bodyText = '';
      try {
        sourceText = message.source ? message.source.toString('utf8') : '';
        bodyText = sourceText.split(/\r?\n\r?\n/, 2)[1] || '';
      } catch {
        sourceText = '';
        bodyText = '';
      }

      rows.push({
        uid: message.uid,
        envelope: message.envelope,
        sourceText,
        bodyText,
      });
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return rows
    .map(summarizeMessage)
    .filter((row) => row.fromEmail && row.fromEmail !== user);
}

function parseCsvRow(line) {
  const [name = '', link = '', contact = '', status = '', date = '', variant = ''] = String(line || '').split(',');
  return { name, link, contact, status, date, variant };
}

function readLeads(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map(parseCsvRow);
}

function extractLeadEmail(row) {
  const contact = normalizeText(row?.contact);
  if (!contact) return '';
  if (/^mailto:/i.test(contact)) {
    return normalizeEmail(contact.replace(/^mailto:/i, '').split('?')[0]);
  }
  return normalizeEmail(contact);
}

function loadContactedLeadMap() {
  const rows = readLeads(LEADS_FILE);
  const map = new Map();
  rows.forEach((row) => {
    if (normalizeText(row.status).toLowerCase() !== 'contacted') return;
    const email = extractLeadEmail(row);
    if (!email) return;
    map.set(email, row);
  });
  return map;
}

function loadLeadMap() {
  const rows = readLeads(LEADS_FILE);
  const map = new Map();
  rows.forEach((row) => {
    const email = extractLeadEmail(row);
    if (!email) return;
    map.set(email, row);
  });
  return map;
}

function updateLeadStatusByEmail(filePath, email, status) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !fs.existsSync(filePath)) return false;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  if (lines.length < 2) return false;

  const updated = [lines[0]];
  let changed = false;

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    const [name = '', link = '', contact = '', currentStatus = '', date = '', variant = ''] = line.split(',');
    const rowEmail = extractLeadEmail({ contact });
    if (rowEmail && rowEmail === normalizedEmail) {
      updated.push([name, link, contact, status, date, variant].join(','));
      changed = true;
    } else {
      updated.push(line);
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, `${updated.join('\n')}\n`);
  }

  return changed;
}

function looksLikeBounce(message) {
  const from = normalizeText(message.from).toLowerCase();
  const subject = normalizeText(message.subject).toLowerCase();
  const preview = normalizeText(message.preview).toLowerCase();
  return (
    /mailer-daemon|postmaster|no-reply|noreply/.test(from)
    || /delivery status notification|undeliverable|mail delivery subsystem|returned mail|delivery failed|message blocked|recipient address rejected|address not found/.test(subject)
    || /delivery status notification|undeliverable|mail delivery subsystem|returned to sender|recipient address rejected|address not found|user unknown|mailbox unavailable/.test(preview)
  );
}

function extractBounceEmails(message) {
  const chunks = [
    message.subject,
    message.preview,
  ].filter(Boolean);
  const text = chunks.join('\n');
  const emails = new Set();

  for (const match of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    const email = normalizeEmail(match[0]);
    if (email) emails.add(email);
  }

  return [...emails];
}

function computeDelayBounds() {
  const minMinutes = Math.max(0, DEFAULT_AUTO_REPLY_MIN_DELAY_MINUTES);
  const maxMinutes = Math.max(minMinutes, DEFAULT_AUTO_REPLY_MAX_DELAY_MINUTES);
  return { minMinutes, maxMinutes };
}

function randomDelayMinutes() {
  const { minMinutes, maxMinutes } = computeDelayBounds();
  if (minMinutes === maxMinutes) return minMinutes;
  const spread = maxMinutes - minMinutes + 1;
  return minMinutes + Math.floor(Math.random() * spread);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function adaptiveDelayMinutes(message, lead) {
  const { minMinutes, maxMinutes } = computeDelayBounds();
  if (minMinutes === maxMinutes) return minMinutes;

  const text = `${normalizeText(message.subject)} ${normalizeText(message.preview)}`.toLowerCase();
  let score = 0.5;

  if (/\?/.test(message.subject) || /\b(can you|could you|when|what|how|interested|ready|available)\b/.test(text)) {
    score -= 0.22;
  }
  if (/\b(thanks|thank you|sounds good|great|awesome|perfect)\b/.test(text)) {
    score -= 0.08;
  }
  if (/\b(later|next week|sometime|not urgent|no rush)\b/.test(text)) {
    score += 0.2;
  }
  if (normalizeText(message.preview).length < 60) {
    score += 0.08;
  }
  if (lead?.variant && /email/i.test(lead.variant)) {
    score -= 0.05;
  }

  score = clamp(score, 0, 1);
  const exact = minMinutes + (maxMinutes - minMinutes) * score;
  return Math.round(exact);
}

function chooseDelayMinutes(message, lead) {
  if (DEFAULT_AUTO_REPLY_DELAY_MODE === 'random') {
    return randomDelayMinutes();
  }
  return adaptiveDelayMinutes(message, lead);
}

function upsertMessageState(state, message, lead) {
  const existing = state.messages[message.messageId] || {};
  if (!existing.firstSeenAt) {
    existing.firstSeenAt = new Date().toISOString();
  }
  if (!existing.dueAt && DEFAULT_AUTO_REPLY && lead) {
    const delayMinutes = chooseDelayMinutes(message, lead);
    const dueAt = new Date(Date.now() + delayMinutes * 60 * 1000);
    existing.dueAt = dueAt.toISOString();
    existing.delayMinutes = delayMinutes;
  }
  existing.subject = message.subject;
  existing.fromEmail = message.fromEmail;
  existing.leadName = lead?.name || existing.leadName || '';
  state.messages[message.messageId] = existing;
  return existing;
}

function backfillPendingAutoReplies(state, leadMap) {
  if (!DEFAULT_AUTO_REPLY) return;

  for (const meta of Object.values(state.messages || {})) {
    if (!meta || meta.autoRepliedAt || meta.dueAt) continue;
    const fromEmail = normalizeEmail(meta.fromEmail);
    if (!fromEmail) continue;
    const lead = leadMap.get(fromEmail);
    if (!lead) continue;

    const syntheticMessage = {
      subject: meta.subject || '',
      preview: '',
      fromEmail,
    };
    const delayMinutes = chooseDelayMinutes(syntheticMessage, lead);
    meta.dueAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
    meta.delayMinutes = delayMinutes;
    meta.leadName = lead.name || meta.leadName || '';
  }
}

function buildAlert(messages) {
  const newest = messages[0];
  const summary = messages.length === 1
    ? `Unread inbox reply from ${newest.from}: ${newest.subject}`
    : `${messages.length} unread inbox messages need review`;
  const actionItems = messages.slice(0, 5).map((message) => {
    const date = message.date ? ` (${message.date})` : '';
    return `${message.from}: ${message.subject}${date}`;
  });
  const lines = [
    summary,
    '',
    ...messages.map((message) => {
      const preview = message.preview ? `\nPreview: ${message.preview}` : '';
      const replyTo = message.replyTo ? `\nReply-To: ${message.replyTo}` : '';
      const date = message.date ? `\nDate: ${message.date}` : '';
      return `From: ${message.from}\nSubject: ${message.subject}${date}${replyTo}${preview}`;
    }),
    '',
    'Useful commands:',
    '- ask-inbox',
    '- ask-next',
  ];

  return {
    subject: `[3dvr-agent] inbox attention: ${summary}`,
    summary,
    actionItems,
    text: lines.join('\n'),
  };
}

function buildBounceAlert(message, matchedEmails) {
  const summary = matchedEmails.length === 1
    ? `Delivery failure for ${matchedEmails[0]}`
    : `Delivery failure for ${matchedEmails.length} addresses`;
  const lines = [
    summary,
    '',
    `From: ${message.from}`,
    `Subject: ${message.subject}`,
    message.replyTo ? `Reply-To: ${message.replyTo}` : '',
    message.preview ? `Preview: ${message.preview}` : '',
    '',
    'Matched lead addresses:',
    ...matchedEmails.map((email) => `- ${email}`),
    '',
    'Useful commands:',
    '- ask-inbox',
    '- ask-track view',
  ].filter(Boolean);

  return {
    subject: `[3dvr-agent] delivery failure: ${summary}`,
    summary,
    actionItems: matchedEmails.map((email) => `Failed lead address: ${email}`),
    text: lines.join('\n'),
  };
}

function buildReplySubject(subject) {
  const normalized = formatSubject(subject);
  return /^re:/i.test(normalized) ? normalized : `Re: ${normalized}`;
}

function firstName(name, email) {
  const raw = normalizeText(name || '').split(/\s+/)[0];
  if (raw) return raw;
  const fallback = normalizeText(email).split('@')[0];
  if (!fallback) return 'there';
  return fallback.replace(/[._-]+/g, ' ').split(/\s+/)[0];
}

function replyContactFooter() {
  return buildContactFooter({
    website: process.env.THREEDVR_INBOX_AUTO_REPLY_WEBSITE || process.env.THREEDVR_CONTACT_WEBSITE || 'https://3dvr.tech',
    email: process.env.GMAIL_USER || DEFAULT_REPLY_SENDER_EMAIL || '3dvr.tech@gmail.com',
    phone: process.env.THREEDVR_OUTREACH_PHONE || '',
  });
}

function ensureReplyContactFooter(text) {
  return appendContactFooter(text, {
    website: process.env.THREEDVR_INBOX_AUTO_REPLY_WEBSITE || process.env.THREEDVR_CONTACT_WEBSITE || 'https://3dvr.tech',
    email: process.env.GMAIL_USER || DEFAULT_REPLY_SENDER_EMAIL || '3dvr.tech@gmail.com',
    phone: process.env.THREEDVR_OUTREACH_PHONE || '',
  });
}

function normalizeThreadSubject(subject) {
  return formatSubject(subject).replace(/^(re|fwd?):\s*/i, '').toLowerCase();
}

function countThreadAutoReplies(state, message) {
  const subject = normalizeThreadSubject(message.subject);
  const fromEmail = normalizeEmail(message.fromEmail);
  if (!(subject && fromEmail)) return 0;

  return Object.values(state.messages || {}).filter((meta) => (
    meta
    && meta.autoRepliedAt
    && normalizeEmail(meta.fromEmail) === fromEmail
    && normalizeThreadSubject(meta.subject) === subject
  )).length;
}

function compactMessageText(message) {
  return `${normalizeText(message.subject)} ${normalizeText(message.preview)}`
    .replace(/\s+/g, ' ')
    .trim();
}

function stableVariantIndex(message, repeatCount, length) {
  if (length <= 1) return 0;
  const seed = `${message.messageId || ''}|${message.subject || ''}|${message.fromEmail || ''}|${repeatCount}`;
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash % length;
}

function detectReplyIntent(message) {
  const text = compactMessageText(message).toLowerCase();
  const preview = normalizeText(message.preview).replace(/\s+/g, ' ');

  if (/^test\b/i.test(preview) || /\b(automation test|inbox test|copy test)\b/i.test(message.subject)) {
    return 'test';
  }
  if (/\b(no thanks|not interested|unsubscribe|stop|remove me|don'?t contact)\b/.test(text)) {
    return 'decline';
  }
  if (/\b(price|pricing|cost|quote|estimate|budget|how much)\b/.test(text)) {
    return 'pricing';
  }
  if (/\b(call|meeting|meet|schedule|calendar|available|availability|tomorrow|next week)\b/.test(text)) {
    return 'schedule';
  }
  if (/\b(website|site|page|landing page|redesign|booking|seo|portfolio|store)\b/.test(text)) {
    return 'website';
  }
  if (/\b(yes|interested|sounds good|tell me more|send|sure|okay|ok|great|let'?s|lets)\b/.test(text)) {
    return 'interested';
  }
  if (/\?/.test(text) || /\b(what|how|when|where|why|can you|could you)\b/.test(text)) {
    return 'question';
  }
  return 'general';
}

function leadLabel(lead) {
  return normalizeText(lead?.name) || 'your business';
}

function pickReplyVariant(message, repeatCount, variants) {
  return variants[stableVariantIndex(message, repeatCount, variants.length)];
}

function chooseReplyLines(message, lead, repeatCount) {
  const intent = detectReplyIntent(message);
  const name = leadLabel(lead);

  if (intent === 'test') {
    const first = [
      ['Test received. The inbox monitor caught this reply and kept the thread intact.'],
      ['Got this test reply. Auto-reply routing is working on this thread.'],
      ['Received this test. The reply loop is live and using the portal email relay.'],
    ];
    const followups = [
      ['Got this follow-up test too. The thread matching is still working.'],
      ['Second test received. This reply stayed on the same conversation.'],
      ['This test came through as another reply, not a new lead.'],
    ];
    return pickReplyVariant(message, repeatCount, repeatCount > 0 ? followups : first);
  }

  if (intent === 'decline') {
    return [
      'Understood. I will not keep nudging this thread.',
      'If something changes later, send over the site or project you want to revisit.',
    ];
  }

  if (repeatCount > 0) {
    const followups = [
      ['Saw your follow-up too.', 'Send the main detail you want handled first and I will keep the next step simple.'],
      ['Got your follow-up.', 'The fastest path is to pick one target: website, booking flow, or lead follow-up.'],
      ['I am tracking this thread.', `For ${name}, the next useful detail is the page or offer you want improved first.`],
    ];
    return pickReplyVariant(message, repeatCount, followups);
  }

  if (intent === 'pricing') {
    return [
      'Quick answer: it depends on how much of the site or funnel you want handled.',
      'Send the page you care about most and the outcome you want from it. I can suggest the smallest useful scope from there.',
    ];
  }

  if (intent === 'schedule') {
    return [
      'A quick call can work.',
      'Send two times that are good for you and the best email to use. I will keep the agenda focused on the fastest next step.',
    ];
  }

  if (intent === 'website') {
    return [
      `For ${name}, I would start with the page that either gets traffic or should be converting better.`,
      'Send the URL you want looked at first and I will suggest the simplest improvement path.',
    ];
  }

  if (intent === 'interested') {
    return [
      'That works.',
      'Send me the site or page you want handled first, and I will map the simplest next step.',
    ];
  }

  if (intent === 'question') {
    return [
      'Good question.',
      'Send the site or offer you are thinking about and I will answer with the most practical next step.',
    ];
  }

  const general = [
    ['Got your note.', 'What is the main thing you want help with first?'],
    ['I saw your reply.', 'Send the site, page, or offer you want to improve and I will keep the next step practical.'],
    [`For ${name}, the cleanest next step is to pick one priority.`, 'Website, booking flow, or follow-up system are usually the best starting points.'],
  ];
  return pickReplyVariant(message, repeatCount, general);
}

function buildReplyHeadline(message, state) {
  const repeatCount = countThreadAutoReplies(state, message);
  const intent = detectReplyIntent(message);
  if (intent === 'test') {
    return repeatCount > 0 ? 'Test follow-up received.' : 'Test reply received.';
  }
  if (intent === 'decline') return 'Understood.';
  if (intent === 'pricing') return 'A simple scope is the best place to start.';
  if (intent === 'schedule') return 'A quick call can work.';
  if (intent === 'website') return 'Start with the highest-impact page.';
  if (intent === 'interested') return 'Good next step.';
  if (intent === 'question') return 'Good question.';
  return repeatCount > 0 ? 'Got your follow-up.' : 'Got your note.';
}

function buildReplyText(lead, message, state) {
  const greeting = firstName(message.from, message.fromEmail);
  const repeatCount = countThreadAutoReplies(state, message);
  return ensureReplyContactFooter([
    `Hi ${greeting},`,
    '',
    ...chooseReplyLines(message, lead, repeatCount),
  ].join('\n'));
}

function sanitizeLlmReplyText(value) {
  const lines = String(value || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trimEnd());
  const trimmed = lines.join('\n').trim();
  return trimmed
    .replace(/\b(api[_ -]?key|token|password|secret)\b\s*[:=]\s*\S+/gi, '[redacted]')
    .slice(0, 1200);
}

function parseLlmJson(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  try {
    return JSON.parse(candidate);
  } catch (_err) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch (_innerErr) {
      return null;
    }
  }
}

function buildReplyPrompt(lead, message, state) {
  const repeatCount = countThreadAutoReplies(state, message);
  const senderFirstName = firstName(message.from, message.fromEmail);
  const intent = detectReplyIntent(message);
  const leadName = leadLabel(lead);
  return {
    system: [
      'You write short, natural Gmail replies for Thomas at 3DVR.',
      'Use the voice of a real founder: direct, practical, warm, not corporate.',
      'The recipient already replied to outreach, so answer like a human continuing the thread.',
      'Be more adaptive than a template. Use the sender message and inferred intent.',
      '3DVR helps with practical website/product work: reviewing pages, clarifying offers, improving CTAs, building small fixes, and operating outreach. If more context is needed, ask for the URL, goal, or page that matters most.',
      'Do not mention AI, automation, prompts, systems, or internal tools unless the user is explicitly testing automation.',
      'Do not invent prices, guarantees, meetings already booked, integrations, or platform features not stated here.',
      'Do not include signatures; the portal adds sender identity separately.',
      'Return only JSON: {"headline":"...","text":"..."}',
    ].join('\n'),
    user: JSON.stringify({
      business: '3DVR',
      senderName: senderFirstName,
      senderEmail: message.fromEmail,
      leadName,
      leadContact: lead?.contact || '',
      leadSite: lead?.link || '',
      subject: message.subject,
      preview: message.preview,
      intent,
      repeatCount,
      threadHint: repeatCount > 0 ? 'This thread already received an automated reply. Do not repeat the earlier opener.' : 'First automated reply in this thread.',
      desiredShape: '2 to 5 short lines. Ask for one concrete next detail or answer the obvious question.',
    }),
  };
}

function buildLocalPrompt(lead, message, state) {
  const repeatCount = countThreadAutoReplies(state, message);
  const senderFirstName = firstName(message.from, message.fromEmail);
  const intent = detectReplyIntent(message);
  const leadName = leadLabel(lead);
  return [
    'Write one short Gmail reply for Thomas at 3DVR.',
    'Return only JSON: {"headline":"...","text":"..."}',
    'Voice: direct, practical, warm, not corporate.',
    'Facts: 3DVR helps with website/product work: review pages, clarify offers, improve CTAs, build small fixes, and run outreach.',
    'Do not invent prices, guarantees, integrations, platform features, or meetings.',
    'Do not include a signature.',
    `Sender: ${senderFirstName || message.fromEmail || 'there'}`,
    `Lead: ${leadName}`,
    `Lead site: ${lead?.link || ''}`,
    `Subject: ${message.subject || ''}`,
    `Message: ${message.preview || ''}`,
    `Intent: ${intent}`,
    `Previous auto replies in this thread: ${repeatCount}`,
    'Reply shape: 2 to 4 short lines. Ask for one concrete next detail if needed.',
  ].join('\n');
}

function commandExists(filePath) {
  try {
    return Boolean(filePath && fs.existsSync(filePath) && fs.statSync(filePath).mode & 0o111);
  } catch {
    return false;
  }
}

function runCommand(command, args, { input = '', timeoutMs = 45000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Local model timed out after ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);

    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Local model exited with code ${code}.`));
        return;
      }
      resolve(stdout);
    });

    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

async function callLocalLlama(prompt, {
  runCommandImpl = runCommand,
  commandExistsImpl = commandExists,
  fileExistsImpl = fs.existsSync,
} = {}) {
  if (!commandExistsImpl(DEFAULT_LLAMA_CLI)) {
    throw new Error(`llama-cli not found at ${DEFAULT_LLAMA_CLI}`);
  }
  if (!DEFAULT_LOCAL_MODEL || !fileExistsImpl(DEFAULT_LOCAL_MODEL)) {
    throw new Error(`local model not found at ${DEFAULT_LOCAL_MODEL}`);
  }

  return runCommandImpl(DEFAULT_LLAMA_CLI, [
    '-m', DEFAULT_LOCAL_MODEL,
    '-p', prompt,
    '-n', String(DEFAULT_LOCAL_LLM_TOKENS),
    '--ctx-size', String(DEFAULT_LOCAL_LLM_CONTEXT),
    '--temp', String(DEFAULT_LOCAL_LLM_TEMPERATURE),
    '--single-turn',
    '--simple-io',
    '--no-display-prompt',
    '--no-show-timings',
    '--no-warmup',
  ], { timeoutMs: DEFAULT_LOCAL_LLM_TIMEOUT_MS });
}

async function buildLocalReplyDraft(lead, message, state, options = {}) {
  const raw = await callLocalLlama(buildLocalPrompt(lead, message, state), options);
  const parsed = parseLlmJson(raw);
  if (!parsed) {
    throw new Error('Local model returned invalid JSON.');
  }
  const headline = normalizeText(parsed.headline) || buildReplyHeadline(message, state);
  const text = ensureReplyContactFooter(sanitizeLlmReplyText(parsed.text));
  if (!text) {
    throw new Error('Local model returned an empty reply.');
  }
  return { headline, text, source: 'local' };
}

async function callOpenAIChatCompletion(messages, { fetchImpl = fetch } = {}) {
  const apiKey = normalizeText(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set.');
  }
  const response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_LLM_MODEL,
      temperature: DEFAULT_LLM_TEMPERATURE,
      max_tokens: DEFAULT_LLM_MAX_TOKENS,
      response_format: { type: 'json_object' },
      messages,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI reply generation failed: ${response.status}`);
  }
  const content = normalizeText(payload?.choices?.[0]?.message?.content);
  if (!content) {
    throw new Error('OpenAI reply generation returned no content.');
  }
  return content;
}

async function buildLlmReplyDraft(lead, message, state, options = {}) {
  const prompt = buildReplyPrompt(lead, message, state);
  const raw = await callOpenAIChatCompletion([
    { role: 'system', content: prompt.system },
    { role: 'user', content: prompt.user },
  ], options);
  const parsed = parseLlmJson(raw);
  if (!parsed) {
    throw new Error('OpenAI reply generation returned invalid JSON.');
  }
  const headline = normalizeText(parsed.headline) || buildReplyHeadline(message, state);
  const text = ensureReplyContactFooter(sanitizeLlmReplyText(parsed.text));
  if (!text) {
    throw new Error('OpenAI reply generation returned an empty reply.');
  }
  return { headline, text, source: 'openai' };
}

async function buildReplyDraft(lead, message, state, options = {}) {
  const allowTemplateFallback = !DEFAULT_REPLY_MODE.endsWith('-strict');
  const normalizedMode = DEFAULT_REPLY_MODE.replace(/-strict$/, '');
  const attempts = normalizedMode === 'template'
    ? []
    : normalizedMode === 'openai' || normalizedMode === 'llm'
      ? [['openai', buildLlmReplyDraft]]
      : normalizedMode === 'local' && !DEFAULT_REPLY_MODE.endsWith('-strict')
        ? [['local', buildLocalReplyDraft], ['openai', buildLlmReplyDraft]]
        : normalizedMode === 'local'
          ? [['local', buildLocalReplyDraft]]
        : [['local', buildLocalReplyDraft], ['openai', buildLlmReplyDraft]];

  for (const [source, builder] of attempts) {
    try {
      return await builder(lead, message, state, options);
    } catch (error) {
      if (!allowTemplateFallback && source === attempts[attempts.length - 1]?.[0]) {
        throw error;
      }
      console.warn(`${source} reply fallback: ${error.message || error}`);
    }
  }

  return {
    headline: buildReplyHeadline(message, state),
    text: ensureReplyContactFooter(buildReplyText(lead, message, state)),
    source: 'template',
  };
}

function buildReferences(message) {
  const parts = [];
  if (message.references) {
    parts.push(message.references);
  }
  if (message.messageId && !parts.join(' ').includes(message.messageId)) {
    parts.push(message.messageId);
  }
  return normalizeText(parts.join(' '));
}

async function sendPortalAlert(alert) {
  if (!DEFAULT_PORTAL_EMAIL_ENDPOINT) {
    return { ok: false, reason: 'portal email endpoint not configured' };
  }
  if (!DEFAULT_PORTAL_EMAIL_TOKEN) {
    return { ok: false, reason: 'portal email token not configured' };
  }
  if (!DEFAULT_NOTIFY_EMAIL) {
    return { ok: false, reason: 'notify email not configured' };
  }

  const response = await fetch(DEFAULT_PORTAL_EMAIL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEFAULT_PORTAL_EMAIL_TOKEN}`,
    },
    body: JSON.stringify({
      mode: 'operator-alert',
      to: [DEFAULT_NOTIFY_EMAIL],
      subject: alert.subject,
      summary: alert.summary,
      text: alert.text,
      actionItems: alert.actionItems,
      commands: ['ask-inbox', 'ask-next'],
      metadata: {
        mailbox: DEFAULT_MAILBOX,
        unreadMessages: String(alert.actionItems.length),
      },
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      reason: payload?.error || `portal email request failed: ${response.status}`,
      status: response.status,
    };
  }

  return {
    ok: true,
    status: response.status,
    to: DEFAULT_NOTIFY_EMAIL,
  };
}

async function sendLeadReply(message, lead, state) {
  if (!DEFAULT_PORTAL_EMAIL_ENDPOINT) {
    return { ok: false, reason: 'portal email endpoint not configured' };
  }
  if (!DEFAULT_PORTAL_EMAIL_TOKEN) {
    return { ok: false, reason: 'portal email token not configured' };
  }
  const draft = await buildReplyDraft(lead, message, state);

  const response = await fetch(DEFAULT_PORTAL_EMAIL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEFAULT_PORTAL_EMAIL_TOKEN}`,
    },
    body: JSON.stringify({
      mode: 'lead-outreach',
      to: [message.replyToEmail || message.fromEmail],
      subject: buildReplySubject(message.subject),
      headline: draft.headline,
      text: draft.text,
      senderName: DEFAULT_REPLY_SENDER_NAME,
      senderEmail: DEFAULT_REPLY_SENDER_EMAIL,
      inReplyTo: message.messageId,
      references: buildReferences(message),
      metadata: {
        replySource: draft.source,
        replyMode: DEFAULT_REPLY_MODE,
      },
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      reason: payload?.error || `portal lead reply failed: ${response.status}`,
      status: response.status,
    };
  }

  return {
    ok: true,
    status: response.status,
    to: message.replyToEmail || message.fromEmail,
    subject: buildReplySubject(message.subject),
    replySource: draft.source,
  };
}

async function handleBounceMessages(messages, state) {
  const leadMap = loadLeadMap();
  const bounceMessages = messages.filter(looksLikeBounce);
  const failures = [];

  for (const message of bounceMessages) {
    const matchedEmails = extractBounceEmails(message)
      .map((email) => email.toLowerCase())
      .filter((email) => leadMap.has(email));
    if (!matchedEmails.length) continue;

    for (const email of matchedEmails) {
      if (updateLeadStatusByEmail(LEADS_FILE, email, 'failed')) {
        failures.push(email);
      }
    }
  }

  if (!failures.length) {
    return null;
  }

  const alert = buildBounceAlert(bounceMessages[0], failures);
  return sendPortalAlert(alert);
}

function canSendAutoReply(state) {
  const gapMs = Math.max(0, DEFAULT_AUTO_REPLY_MIN_GAP_MINUTES) * 60 * 1000;
  if (!gapMs) return true;
  const lastSent = normalizeText(state.lastAutoReplyAt);
  if (!lastSent) return true;
  const elapsed = Date.now() - new Date(lastSent).getTime();
  return Number.isFinite(elapsed) && elapsed >= gapMs;
}

function pickAutoReplyCandidates(messages, leadMap, state) {
  if (!DEFAULT_AUTO_REPLY) return [];

  return messages
    .map((message) => {
      const lead = leadMap.get(message.replyToEmail) || leadMap.get(message.fromEmail);
      if (!lead) return null;
      const meta = state.messages[message.messageId];
      if (!meta || !meta.dueAt || meta.autoRepliedAt) return null;
      const dueAt = new Date(meta.dueAt).getTime();
      if (!Number.isFinite(dueAt) || dueAt > Date.now()) return null;
      return { message, lead, meta };
    })
    .filter(Boolean)
    .slice(0, Math.max(0, DEFAULT_AUTO_REPLY_LIMIT));
}

function pickReplyPreviewCandidates(messages, leadMap) {
  return messages
    .map((message) => {
      const lead = leadMap.get(message.replyToEmail) || leadMap.get(message.fromEmail);
      if (!lead) return null;
      return { message, lead };
    })
    .filter(Boolean);
}

function classifyInboxMessages(messages, leadMap) {
  const replyCandidates = pickReplyPreviewCandidates(messages, leadMap);
  const replyIds = new Set(replyCandidates.map(({ message }) => message.messageId));
  const bounceCandidates = messages
    .filter((message) => looksLikeBounce(message))
    .filter((message) => !replyIds.has(message.messageId));
  const bounceIds = new Set(bounceCandidates.map((message) => message.messageId));
  const otherUnread = messages.filter((message) => !replyIds.has(message.messageId) && !bounceIds.has(message.messageId));

  return {
    replyCandidates,
    bounceCandidates,
    otherUnread,
  };
}

function buildInboxTriage(messages, leadMap) {
  const { replyCandidates, bounceCandidates, otherUnread } = classifyInboxMessages(messages, leadMap);
  return {
    summary: {
      total: messages.length,
      replies: replyCandidates.length,
      bounces: bounceCandidates.length,
      other: otherUnread.length,
    },
    replyCandidates,
    bounceCandidates,
    otherUnread,
  };
}

function printInboxTriage(messages, leadMap) {
  const triage = buildInboxTriage(messages, leadMap);
  console.log('\nInbox triage:');
  console.log(`- contacted replies: ${triage.summary.replies}`);
  console.log(`- delivery failures: ${triage.summary.bounces}`);
  console.log(`- other unread: ${triage.summary.other}`);

  if (triage.replyCandidates.length) {
    console.log('\nContacted-lead replies:');
    for (const { message, lead } of triage.replyCandidates.slice(0, 5)) {
      console.log(`- ${lead.name || message.from} | ${message.subject}`);
      if (message.preview) {
        console.log(`  ${message.preview}`);
      }
    }
  }

  if (triage.bounceCandidates.length) {
    console.log('\nDelivery noise:');
    for (const message of triage.bounceCandidates.slice(0, 5)) {
      console.log(`- ${message.from} | ${message.subject}`);
      if (message.preview) {
        console.log(`  ${message.preview}`);
      }
    }
  }

  if (triage.otherUnread.length) {
    console.log('\nOther unread:');
    for (const message of triage.otherUnread.slice(0, 5)) {
      console.log(`- ${message.from} | ${message.subject}`);
      if (message.preview) {
        console.log(`  ${message.preview}`);
      }
    }
  }

  return triage;
}

async function printReplyPreviews(messages, leadMap, state) {
  const candidates = pickReplyPreviewCandidates(messages, leadMap);
  if (!candidates.length) {
    console.log('No contacted-lead replies to preview.');
    return;
  }

  for (const { message, lead } of candidates) {
    const draft = await buildReplyDraft(lead, message, state);
    console.log('\nReply preview:\n');
    console.log(`Lead: ${lead.name || message.from}`);
    console.log(`To: ${message.replyToEmail || message.fromEmail}`);
    console.log(`Subject: ${buildReplySubject(message.subject)}`);
    console.log(`Reply source: ${draft.source}`);
    console.log(`Headline: ${draft.headline}`);
    console.log(draft.text);
  }
}

function pruneObjectEntries(value, limit = 300) {
  return Object.fromEntries(
    Object.entries(value || {})
      .sort((left, right) => String(right[1]?.firstSeenAt || right[1] || '').localeCompare(String(left[1]?.firstSeenAt || left[1] || '')))
      .slice(0, limit)
  );
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message || error);
    usage();
    process.exit(1);
  }

  if (options.help) {
    usage();
    return;
  }

  const state = loadState();
  const unread = await loadUnreadMessages(options.limit);
  const contactedLeadMap = loadContactedLeadMap();

  unread.forEach((message) => {
    const lead = contactedLeadMap.get(message.replyToEmail) || contactedLeadMap.get(message.fromEmail);
    upsertMessageState(state, message, lead);
  });
  backfillPendingAutoReplies(state, contactedLeadMap);

  if (!unread.length) {
    console.log('No unread inbox messages.');
    state.messages = pruneObjectEntries(state.messages, 500);
    saveState(state);
    return;
  }

  console.log(`Unread inbox messages: ${unread.length}`);
  unread.forEach((message) => {
    console.log(`- ${message.from} | ${message.subject}`);
  });

  printInboxTriage(unread, contactedLeadMap);

  const fresh = unread.filter((message) => !state.seen[message.messageId]);
  if (fresh.length) {
    const alert = buildAlert(fresh);
    if (options.dryRun) {
      console.log('\nDry run alert preview:\n');
      console.log(alert.text);
    } else {
      const alertResult = await sendPortalAlert(alert);
      if (!alertResult.ok) {
        throw new Error(alertResult.reason || 'Unable to send inbox alert.');
      }
      state.lastAlertAt = new Date().toISOString();
      console.log(`Alerted ${alertResult.to} about ${fresh.length} inbox message(s).`);
      fresh.forEach((message) => {
        state.seen[message.messageId] = message.date || new Date().toISOString();
      });
    }
  } else {
    console.log('No newly surfaced unread messages.');
  }

  if (options.replyPreview) {
    await printReplyPreviews(unread, contactedLeadMap, state);
  }

  const autoReplyCandidates = pickAutoReplyCandidates(unread, contactedLeadMap, state);
  if (DEFAULT_AUTO_REPLY && autoReplyCandidates.length) {
    if (!canSendAutoReply(state)) {
      console.log('Auto-reply waiting for the minimum gap window.');
    } else if (options.dryRun) {
      for (const { message, lead, meta } of autoReplyCandidates) {
        const draft = await buildReplyDraft(lead, message, state);
        console.log('\nDry run auto-reply preview:\n');
        console.log(`Lead: ${lead.name}`);
        console.log(`Due at: ${meta.dueAt}`);
        console.log(`To: ${message.replyToEmail || message.fromEmail}`);
        console.log(`Subject: ${buildReplySubject(message.subject)}`);
        console.log(`Reply source: ${draft.source}`);
        console.log(`Headline: ${draft.headline}`);
        console.log(draft.text);
      }
    } else {
      for (const { message, lead, meta } of autoReplyCandidates) {
        if (!canSendAutoReply(state)) break;
        const result = await sendLeadReply(message, lead, state);
        if (!result.ok) {
          console.warn(result.reason || `Unable to auto-reply to ${lead.name || message.from}`);
          continue;
        }
        meta.autoRepliedAt = new Date().toISOString();
        state.lastAutoReplyAt = meta.autoRepliedAt;
        console.log(`Auto-replied to ${lead.name || message.from} -> ${result.to} (${result.replySource})`);
      }
    }
  }

  const bounceResult = await handleBounceMessages(unread, state);
  if (bounceResult?.ok) {
    console.log(`Alerted ${bounceResult.to} about delivery failure(s).`);
  }

  state.seen = pruneObjectEntries(state.seen, 500);
  state.messages = pruneObjectEntries(state.messages, 500);
  saveState(state);
}

module.exports = {
  buildReplyHeadline,
  buildBounceAlert,
  buildReplySubject,
  buildReplyText,
  replyContactFooter,
  ensureReplyContactFooter,
  buildLocalReplyDraft,
  buildLlmReplyDraft,
  buildReplyDraft,
  chooseReplyLines,
  classifyInboxMessages,
  buildInboxTriage,
  printInboxTriage,
  detectReplyIntent,
  extractBounceEmails,
  looksLikeBounce,
  pickReplyPreviewCandidates,
  printReplyPreviews,
  updateLeadStatusByEmail,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
