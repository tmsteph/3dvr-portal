const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const { getOAuthAccessToken } = require('./oauth-connection');

const ROOT = path.join(__dirname, '..');
const STATE_DIR = process.env.THREEDVR_AUTOPILOT_STATE_DIR || path.join(ROOT, 'state');
const STATE_FILE = process.env.THREEDVR_FREE_SITE_STATE_FILE || path.join(STATE_DIR, 'free-site-worker-state.json');
const GMAIL_USER = normalizeEmail(process.env.GMAIL_USER) || '3dvr.tech@gmail.com';
const IMAP_HOST = String(process.env.THREEDVR_INBOX_IMAP_HOST || 'imap.gmail.com').trim();
const IMAP_PORT = parseInteger(process.env.THREEDVR_INBOX_IMAP_PORT, 993);
const IMAP_TLS = !/^(0|false|no|off)$/i.test(String(process.env.THREEDVR_INBOX_IMAP_TLS || 'true').trim());
const MAILBOX = String(process.env.THREEDVR_INBOX_MAILBOX || 'INBOX').trim() || 'INBOX';
const WEB_REPO = process.env.THREEDVR_FREE_SITE_REPO || 'tmsteph/3dvr-web';
const PUBLIC_BASE = String(process.env.THREEDVR_FREE_SITE_PUBLIC_BASE || 'https://3dvr.tech/free-sites').replace(/\/+$/, '');
const WEBSITE_UPGRADE_URL = String(process.env.THREEDVR_WEBSITE_UPGRADE_URL || 'https://buy.stripe.com/aFa6oH85M4lRfVtcMAc7u0j').trim();
const GENERATOR_URL = process.env.THREEDVR_FREE_SITE_GENERATOR_URL || 'https://portal.3dvr.tech/api/openai-site';
const LOOKBACK_HOURS = Math.max(1, parseInteger(process.env.THREEDVR_FREE_SITE_LOOKBACK_HOURS, 24));
const MAX_PER_RUN = Math.max(1, parseInteger(process.env.THREEDVR_FREE_SITE_MAX_PER_RUN, 3));
const VERIFY_ATTEMPTS = Math.max(1, parseInteger(process.env.THREEDVR_FREE_SITE_VERIFY_ATTEMPTS, 36));
const VERIFY_DELAY_MS = Math.max(1000, parseInteger(process.env.THREEDVR_FREE_SITE_VERIFY_DELAY_MS, 5000));

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeEmail(value) {
  const text = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : '';
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function shortHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 7);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanBody(source) {
  let body = String(source || '');
  const split = body.search(/\r?\n\r?\n/);
  if (split >= 0) body = body.slice(split).replace(/^\r?\n\r?\n/, '');
  return body
    .replace(/=\r?\n/g, '')
    .replace(/=20/g, ' ')
    .replace(/=3D/gi, '=')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^--[-A-Za-z0-9_=.]+.*$/gm, ' ')
    .replace(/^Content-(Type|Transfer-Encoding|Disposition):.*$/gim, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3000);
}

function looksLikeRequest(subject, body) {
  const text = `${subject}\n${body}`.toLowerCase();
  return /\b(website|web site|free site|free website)\b/.test(text)
    && !/\b(unsubscribe|newsletter|receipt|invoice|mailer-daemon)\b/.test(text);
}

function cleanTopic(value) {
  return String(value || '')
    .replace(/[.!?].*$/, '')
    .replace(/\s+(?:a|an|the)?\s*(?:free\s+)?(?:web\s*site|website)\b.*$/i, '')
    .trim()
    .slice(0, 80);
}

function topicFromRequest(subject, body) {
  const trimmedSubject = String(subject || '').trim();
  const standard = trimmedSubject.match(/^free\s+3dvr\s+website\s+request\s*[—–:\-]\s*(.+)$/i);
  if (standard) return cleanTopic(standard[1]);

  const text = `${trimmedSubject}\n${body}`;
  const about = text.match(/\babout\s+([A-Za-z0-9][A-Za-z0-9 &'._-]{1,80})/i);
  if (about) return cleanTopic(about[1]);

  const named = String(body || '').match(/\b(?:name\/business|business|project)\s*:\s*([A-Za-z0-9][A-Za-z0-9 &'._-]{1,80})/i);
  if (named) return cleanTopic(named[1]);

  if (trimmedSubject && !/^(website|free website|make me a website|website request)$/i.test(trimmedSubject)) {
    return cleanTopic(trimmedSubject);
  }
  return '';
}

function ensureState() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  if (!fs.existsSync(STATE_FILE)) {
    const state = { version: 1, bootstrapAt: new Date().toISOString(), messages: {} };
    fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
    return state;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return {
      version: 1,
      bootstrapAt: parsed.bootstrapAt || new Date().toISOString(),
      messages: parsed.messages && typeof parsed.messages === 'object' ? parsed.messages : {},
    };
  } catch {
    return { version: 1, bootstrapAt: new Date().toISOString(), messages: {} };
  }
}

function saveState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tmp, STATE_FILE);
}

async function resolveMailAuth() {
  const mode = String(process.env.THREEDVR_GMAIL_AUTH || '').trim().toLowerCase();
  const pass = String(process.env.GMAIL_APP_PASSWORD || '').trim();
  if (mode === 'oauth' || !pass) {
    const connection = await getOAuthAccessToken('google');
    const user = normalizeEmail(connection.email) || GMAIL_USER;
    if (!(user && connection.accessToken)) throw new Error('Google OAuth connection is incomplete.');
    return {
      user,
      imap: { user, accessToken: connection.accessToken },
      smtp: { type: 'OAuth2', user, accessToken: connection.accessToken },
    };
  }
  return {
    user: GMAIL_USER,
    imap: { user: GMAIL_USER, pass },
    smtp: { user: GMAIL_USER, pass },
  };
}

async function loadRecentRequests(mailAuth) {
  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: IMAP_TLS,
    auth: mailAuth.imap,
    logger: false,
  });
  await client.connect();
  const lock = await client.getMailboxLock(MAILBOX);
  const requests = [];
  try {
    const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);
    const uids = await client.search({ since });
    for await (const message of client.fetch(uids.slice(-75), { uid: true, envelope: true, source: true, flags: true }, { uid: true })) {
      const from = normalizeEmail(message.envelope?.from?.[0]?.address);
      const subject = String(message.envelope?.subject || '').trim();
      if (!from || from === mailAuth.user || /(^|[._-])(no-?reply|mailer-daemon)@/i.test(from)) continue;
      const body = cleanBody(message.source ? message.source.toString('utf8') : '');
      if (!looksLikeRequest(subject, body)) continue;
      const date = message.envelope?.date instanceof Date ? message.envelope.date.toISOString() : new Date().toISOString();
      const messageId = String(message.envelope?.messageId || `uid-${message.uid}`).trim();
      requests.push({
        uid: message.uid,
        messageId,
        from,
        subject: subject || 'Website request',
        body,
        date,
        seen: Boolean(message.flags?.has('\\Seen')),
      });
    }
  } finally {
    lock.release();
    await client.logout();
  }
  return requests.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
  }
  return String(result.stdout || '').trim();
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function mergePullRequest(prUrl, cwd) {
  for (let attempt = 1; attempt <= 15; attempt += 1) {
    const raw = run('gh', ['pr', 'view', prUrl, '--repo', WEB_REPO, '--json', 'mergeable,state'], { cwd });
    const status = JSON.parse(raw || '{}');
    if (String(status.state || '').toUpperCase() === 'MERGED') return;
    if (String(status.state || '').toUpperCase() === 'CLOSED') throw new Error(`Free-site PR closed before merge: ${prUrl}`);
    if (String(status.mergeable || '').toUpperCase() === 'MERGEABLE') {
      run('gh', ['pr', 'merge', prUrl, '--repo', WEB_REPO, '--squash', '--delete-branch=false'], { cwd });
      return;
    }
    if (String(status.mergeable || '').toUpperCase() === 'CONFLICTING') {
      throw new Error(`Free-site PR has merge conflicts: ${prUrl}`);
    }
    sleepSync(2000);
  }
  throw new Error(`Free-site PR did not become mergeable: ${prUrl}`);
}

function buildFallbackHtml({ title, body, contactEmail }) {
  const safeTitle = escapeHtml(title || 'Your Website');
  const safeBody = escapeHtml(body || 'A simple website built by 3DVR.');
  const safeEmail = escapeHtml(contactEmail);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <meta name="description" content="${escapeHtml(String(body || title || '').slice(0, 150))}">
  <style>
    *{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:#0b1220;color:#f7f9fc;line-height:1.6}main,footer{width:min(100% - 2rem,820px);margin:auto}main{padding:5rem 0 3rem}h1{font-size:clamp(3rem,10vw,6rem);line-height:1;margin:0 0 1.5rem}p{font-size:1.15rem;color:#ccd5e2}.card{margin-top:2.5rem;padding:1.5rem;border:1px solid #354257;border-radius:20px;background:#131d2e}a{color:#8ee7d2}footer{padding:1rem 0 3rem;color:#9eabba}
  </style>
</head>
<body>
  <main>
    <h1>${safeTitle}</h1>
    <div class="card"><p>${safeBody}</p></div>
    <p><a href="mailto:${safeEmail}">Contact by email</a></p>
  </main>
  <footer>Free site hosted by <a href="https://3dvr.tech/">3DVR</a>.</footer>
</body>
</html>\n`;
}

async function generateSite(request) {
  const topic = topicFromRequest(request.subject, request.body);
  const prompt = [
    'Build a polished, simple, mobile-friendly one-page website for a genuine inbound free 3DVR website request.',
    'Use only facts supplied by the requester or safe general knowledge for a generic topic.',
    'Do not invent reviews, credentials, addresses, prices, guarantees, or personal claims.',
    'No external scripts, trackers, analytics, or forms.',
    'Include a small footer that says Free site hosted by 3DVR and links to https://3dvr.tech/.',
    request.from ? `Use ${request.from} as the contact email when a contact CTA makes sense.` : '',
    topic ? `Topic/title hint: ${topic}` : '',
    `Requester subject: ${request.subject}`,
    `Requester message: ${request.body}`,
  ].filter(Boolean).join('\n');

  try {
    const response = await fetch(GENERATOR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model: 'gpt-4.1-mini' }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.html) throw new Error(payload?.error || `generator returned ${response.status}`);
    return {
      title: String(payload.title || topic || 'Free Website').trim(),
      html: String(payload.html),
      generator: 'portal-openai-site',
    };
  } catch (error) {
    const title = topic || 'Free Website';
    console.error(`[free-site-worker] generator fallback: ${error.message || error}`);
    return {
      title,
      html: buildFallbackHtml({ title, body: request.body, contactEmail: request.from }),
      generator: 'deterministic-fallback',
    };
  }
}

function cloneWebRepo() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-free-site-'));
  const webDir = path.join(tempRoot, 'web');
  run('gh', ['repo', 'clone', WEB_REPO, webDir, '--', '--depth=1']);
  return { tempRoot, webDir };
}

function siteExists(webDir, slug) {
  return fs.existsSync(path.join(webDir, 'free-sites', slug, 'index.html'));
}

async function verifyLive(siteUrl) {
  for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(siteUrl, { redirect: 'follow' });
      const text = await response.text();
      if (response.ok && /<html/i.test(text)) return true;
    } catch {
      // Deployment may still be propagating.
    }
    await new Promise((resolve) => setTimeout(resolve, VERIFY_DELAY_MS));
  }
  return false;
}

async function sendLiveReply(mailAuth, request, siteUrl) {
  const transporter = nodemailer.createTransport({ service: 'gmail', auth: mailAuth.smtp });
  const text = [
    'Your free site is live:',
    siteUrl,
    '',
    'The simple site is free to keep on the 3DVR-hosted address. Reply with any factual corrections you want changed.',
    '',
    'Want us to turn this into your real business website? The 3DVR Website Upgrade is $99 one time:',
    WEBSITE_UPGRADE_URL,
    '',
    'It includes branding and layout polish, copy cleanup, a clear contact or booking action, and help connecting a domain you own.',
    '',
    'If you know someone else who needs a simple site, share https://3dvr.tech/free-sites/.'
  ].join('\n');
  await transporter.sendMail({
    from: `3DVR <${mailAuth.user}>`,
    to: request.from,
    subject: `Re: ${request.subject}`,
    text,
    inReplyTo: request.messageId || undefined,
    references: request.messageId ? [request.messageId] : undefined,
  });
}

async function markSeen(mailAuth, uid) {
  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: IMAP_TLS,
    auth: mailAuth.imap,
    logger: false,
  });
  await client.connect();
  const lock = await client.getMailboxLock(MAILBOX);
  try {
    await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
  } finally {
    lock.release();
    await client.logout();
  }
}

async function completeExisting({ state, key, mailAuth, request, siteUrl }) {
  if (!(await verifyLive(siteUrl))) return { pending: true, siteUrl };
  if (!request.seen) await sendLiveReply(mailAuth, request, siteUrl);
  await markSeen(mailAuth, request.uid);
  state.messages[key] = {
    ...(state.messages[key] || {}),
    status: 'processed',
    siteUrl,
    existingSite: true,
    completedAt: new Date().toISOString(),
  };
  saveState(state);
  return { processed: true, existing: true, siteUrl };
}

async function processRequest({ request, state, mailAuth }) {
  const key = request.messageId || `uid-${request.uid}`;
  const existingState = state.messages[key];
  if (existingState?.status === 'processed') return { skipped: true };
  if (existingState?.status === 'existing' && existingState.siteUrl) {
    return completeExisting({ state, key, mailAuth, request, siteUrl: existingState.siteUrl });
  }
  if (existingState?.status === 'publishing' && existingState.siteUrl) {
    if (!(await verifyLive(existingState.siteUrl))) {
      if (existingState.prUrl) {
        const { tempRoot, webDir } = cloneWebRepo();
        try {
          mergePullRequest(existingState.prUrl, webDir);
        } finally {
          fs.rmSync(tempRoot, { recursive: true, force: true });
        }
      }
      if (!(await verifyLive(existingState.siteUrl))) return { pending: true, siteUrl: existingState.siteUrl };
    }
    await sendLiveReply(mailAuth, request, existingState.siteUrl);
    await markSeen(mailAuth, request.uid);
    state.messages[key] = { ...existingState, status: 'processed', completedAt: new Date().toISOString() };
    saveState(state);
    return { processed: true, siteUrl: existingState.siteUrl, resumed: true };
  }

  const generated = await generateSite(request);
  let slug = slugify(topicFromRequest(request.subject, request.body) || generated.title || request.from.split('@')[0]) || `site-${shortHash(key)}`;
  const { tempRoot, webDir } = cloneWebRepo();
  try {
    const bootstrapAt = Date.parse(state.bootstrapAt || '');
    const requestAt = Date.parse(request.date || '');
    if (siteExists(webDir, slug)) {
      if (Number.isFinite(bootstrapAt) && Number.isFinite(requestAt) && requestAt <= bootstrapAt) {
        state.messages[key] = {
          status: 'existing',
          siteUrl: `${PUBLIC_BASE}/${slug}/`,
          handledAt: new Date().toISOString(),
        };
        saveState(state);
        return completeExisting({ state, key, mailAuth, request, siteUrl: `${PUBLIC_BASE}/${slug}/` });
      }
      slug = `${slug}-${shortHash(`${request.from}:${key}`)}`;
    }

    const relativePath = path.join('free-sites', slug, 'index.html');
    const target = path.join(webDir, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, generated.html.endsWith('\n') ? generated.html : `${generated.html}\n`);

    const branch = `free-site/${slug}-${Date.now()}`;
    run('git', ['checkout', '-b', branch], { cwd: webDir });
    run('git', ['config', 'user.name', '3DVR Free Site Worker'], { cwd: webDir });
    run('git', ['config', 'user.email', mailAuth.user], { cwd: webDir });
    run('git', ['add', '--', relativePath], { cwd: webDir });
    run('git', ['commit', '-m', `Add free ${slug} site`], { cwd: webDir });
    run('git', ['push', '-u', 'origin', branch], { cwd: webDir });
    const prUrl = run('gh', [
      'pr', 'create', '--repo', WEB_REPO, '--base', 'main', '--head', branch,
      '--title', `Add free ${slug} site`,
      '--body', `Automated fulfillment of a genuine inbound free-site request. Generator: ${generated.generator}. No invented business claims.`,
    ], { cwd: webDir });

    const siteUrl = `${PUBLIC_BASE}/${slug}/`;
    state.messages[key] = {
      status: 'publishing',
      siteUrl,
      prUrl,
      slug,
      generator: generated.generator,
      startedAt: new Date().toISOString(),
    };
    saveState(state);

    mergePullRequest(prUrl, webDir);

    if (!(await verifyLive(siteUrl))) {
      console.log(`[free-site-worker] published pending: ${siteUrl}`);
      return { pending: true, siteUrl, prUrl };
    }

    await sendLiveReply(mailAuth, request, siteUrl);
    await markSeen(mailAuth, request.uid);
    state.messages[key] = { ...state.messages[key], status: 'processed', completedAt: new Date().toISOString() };
    saveState(state);
    console.log(`[free-site-worker] fulfilled ${siteUrl}`);
    return { processed: true, siteUrl, prUrl };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function runOnce() {
  const state = ensureState();
  const mailAuth = await resolveMailAuth();
  const requests = await loadRecentRequests(mailAuth);
  let acted = 0;
  let failed = 0;
  for (const request of requests) {
    const key = request.messageId || `uid-${request.uid}`;
    if (state.messages[key]?.status === 'processed') continue;
    try {
      const result = await processRequest({ request, state, mailAuth });
      if (result?.processed || result?.pending || result?.existing) acted += 1;
    } catch (error) {
      failed += 1;
      console.error(`[free-site-worker] ${request.from}: ${error.message || error}`);
      const previous = state.messages[key] || {};
      state.messages[key] = {
        ...previous,
        status: previous.status === 'publishing' ? 'publishing' : 'failed',
        error: String(error.message || error).slice(0, 500),
        failedAt: new Date().toISOString(),
      };
      saveState(state);
    }
    if (acted >= MAX_PER_RUN) break;
  }
  console.log(`[free-site-worker] requests=${requests.length} acted=${acted} failed=${failed}`);
  return { requests: requests.length, acted, failed };
}

module.exports = {
  buildFallbackHtml,
  cleanBody,
  looksLikeRequest,
  runOnce,
  slugify,
  topicFromRequest,
};

if (require.main === module) {
  runOnce().then((result) => process.exit(result.failed > 0 ? 1 : 0)).catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
