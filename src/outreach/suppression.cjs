const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PERSONAL_SENT_SOURCE = 'tmsteph-gmail-sent';
const DEFAULT_CHECK_MAX_AGE_HOURS = 24;

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  const email = normalizeText(value).replace(/^mailto:/i, '').toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function normalizeDomain(value) {
  return normalizeText(value).toLowerCase().replace(/^www\./, '');
}

const PERSONAL_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'yahoo.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com',
]);

function businessDomainForEmail(emailValue) {
  const email = normalizeEmail(emailValue);
  const domain = normalizeDomain(email.split('@')[1] || '');
  return domain && !PERSONAL_MAIL_DOMAINS.has(domain) ? domain : '';
}

function boolValue(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function operatorHome(config = process.env) {
  const configured = normalizeText(config.THREEDVR_OPERATOR_HOME);
  if (configured) return configured;
  if (fs.existsSync('/home/debian/.3dvr')) return '/home/debian';
  return os.homedir();
}
function resolveSuppressionDbPath(config = process.env) {
  const configured = normalizeText(config.THREEDVR_OUTREACH_SUPPRESSION_DB);
  if (configured) return path.resolve(configured);
  return path.join(operatorHome(config), '.3dvr', 'state', 'outreach-suppression.sqlite');
}

function ensureSharedParent(filePath, config = process.env) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o770 });
  try { fs.chmodSync(dir, 0o2770); } catch {}
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    const home = operatorHome(config);
    try {
      const owner = fs.statSync(home);
      fs.chownSync(dir, owner.uid, owner.gid);
    } catch {}
  }
}

function normalizeDbPermissions(filePath, config = process.env) {
  try { fs.chmodSync(filePath, 0o660); } catch {}
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    try {
      const owner = fs.statSync(operatorHome(config));
      fs.chownSync(filePath, owner.uid, owner.gid);
    } catch {}
  }
}

function openSuppressionDb(config = process.env) {
  const filePath = resolveSuppressionDbPath(config);
  ensureSharedParent(filePath, config);
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA journal_mode = DELETE; PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS outreach_suppressions (
      suppression_key TEXT PRIMARY KEY,
      scope TEXT NOT NULL CHECK (scope IN ('email','domain')),
      value TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      source_account TEXT NOT NULL DEFAULT '',
      evidence TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS outreach_suppressions_scope_value
      ON outreach_suppressions(scope, value);
    CREATE TABLE IF NOT EXISTS outreach_recipient_checks (
      email TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('clear','contacted','unknown')),
      evidence TEXT NOT NULL DEFAULT '',
      checked_at TEXT NOT NULL,
      PRIMARY KEY (email, source)
    );
  `);
  normalizeDbPermissions(filePath, config);
  bootstrapLegacyOutreach(db, config);
  return db;
}

function suppressionKey(scope, value) {
  return `${scope}:${value}`;
}

function legacyOutreachLogPath(config = process.env) {
  const explicit = normalizeText(config.THREEDVR_OUTREACH_LOG_FILE);
  if (explicit && fs.existsSync(explicit)) return explicit;
  const candidate = path.join(operatorHome(config), '3dvr-agent', 'thomas-agent', 'outreach-log.ndjson');
  return fs.existsSync(candidate) ? candidate : '';
}

function domainFromUrl(value) {
  try { return normalizeDomain(new URL(value).hostname); } catch { return ''; }
}

function bootstrapLegacyOutreach(db, config = process.env) {
  if (!boolValue(config.THREEDVR_OUTREACH_BOOTSTRAP_LEGACY_LOG, true)) {
    return { imported: 0, skipped: true };
  }
  const existing = db.prepare('SELECT COUNT(*) AS total FROM outreach_suppressions').get().total;
  if (existing > 0) return { imported: 0, skipped: true };
  const filePath = legacyOutreachLogPath(config);
  if (!filePath) return { imported: 0, skipped: true };
  let imported = 0;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean)) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const status = normalizeText(entry.status).toLowerCase();
    if (!['sent', 'submitted', 'replied'].includes(status)) continue;
    const email = normalizeEmail(entry.contact);
    const evidence = `outreach-log:${normalizeText(entry.timestamp)}:${normalizeText(entry.subject)}`;
    if (email) {
      recordOutboundContact(email, { db, config, source: 'legacy-outreach-log', evidence });
      imported += 1;
      continue;
    }
    const domain = domainFromUrl(entry.targetUrl || entry.site);
    if (domain) {
      recordSuppression(domain, {
        db, config, scope: 'domain', source: 'legacy-outreach-log',
        reason: 'Business was previously contacted by 3DVR.', evidence,
      });
      imported += 1;
    }
  }
  return { imported, skipped: false };
}

function recordSuppression(emailOrDomain, options = {}) {
  const config = options.config || process.env;
  const scope = options.scope === 'domain' ? 'domain' : 'email';
  const value = scope === 'domain'
    ? normalizeDomain(emailOrDomain)
    : normalizeEmail(emailOrDomain);
  if (!value) throw new Error(`Valid ${scope} is required for suppression.`);
  const db = options.db || openSuppressionDb(config);
  const close = !options.db;
  const now = options.now || new Date().toISOString();
  try {
    db.prepare(`INSERT INTO outreach_suppressions
      (suppression_key, scope, value, reason, source, source_account, evidence, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(suppression_key) DO UPDATE SET
        reason=excluded.reason,
        source=excluded.source,
        source_account=excluded.source_account,
        evidence=excluded.evidence,
        updated_at=excluded.updated_at`)
      .run(
        suppressionKey(scope, value),
        scope,
        value,
        normalizeText(options.reason),
        normalizeText(options.source),
        normalizeText(options.sourceAccount),
        normalizeText(options.evidence),
        now,
        now,
      );
    return db.prepare('SELECT * FROM outreach_suppressions WHERE suppression_key = ?')
      .get(suppressionKey(scope, value));
  } finally {
    if (close) db.close();
  }
}

function recordRecipientCheck(emailValue, options = {}) {
  const email = normalizeEmail(emailValue);
  if (!email) throw new Error('Valid recipient email is required.');
  const status = normalizeText(options.status || 'unknown').toLowerCase();
  if (!['clear', 'contacted', 'unknown'].includes(status)) {
    throw new Error('Recipient check status must be clear, contacted, or unknown.');
  }
  const config = options.config || process.env;
  const db = options.db || openSuppressionDb(config);
  const close = !options.db;
  const source = normalizeText(options.source) || PERSONAL_SENT_SOURCE;
  const now = options.now || new Date().toISOString();
  try {
    db.prepare(`INSERT INTO outreach_recipient_checks
      (email, source, status, evidence, checked_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(email, source) DO UPDATE SET
        status=excluded.status,
        evidence=excluded.evidence,
        checked_at=excluded.checked_at`)
      .run(email, source, status, normalizeText(options.evidence), now);
    if (status === 'contacted') {
      const suppressionOptions = {
        db,
        config,
        source,
        sourceAccount: options.sourceAccount || 'tmsteph1290@gmail.com',
        reason: options.reason || 'Previously contacted from personal Gmail.',
        evidence: options.evidence,
        now,
      };
      recordSuppression(email, suppressionOptions);
      const domain = businessDomainForEmail(email);
      if (domain) recordSuppression(domain, { ...suppressionOptions, scope: 'domain' });
    }
    return db.prepare('SELECT * FROM outreach_recipient_checks WHERE email = ? AND source = ?')
      .get(email, source);
  } finally {
    if (close) db.close();
  }
}

function getSuppression(db, email) {
  const domain = normalizeDomain(email.split('@')[1] || '');
  return db.prepare(`SELECT * FROM outreach_suppressions
    WHERE suppression_key IN (?, ?)
    ORDER BY CASE scope WHEN 'email' THEN 0 ELSE 1 END
    LIMIT 1`)
    .get(suppressionKey('email', email), suppressionKey('domain', domain)) || null;
}

function maxCheckAgeMs(config = process.env) {
  const hours = Number.parseFloat(
    normalizeText(config.THREEDVR_PERSONAL_SENT_CHECK_MAX_AGE_HOURS)
      || String(DEFAULT_CHECK_MAX_AGE_HOURS)
  );
  return (Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_CHECK_MAX_AGE_HOURS) * 60 * 60 * 1000;
}

function recipientDecision(emailValue, options = {}) {
  const email = normalizeEmail(emailValue);
  if (!email) return { allowed: false, code: 'invalid_recipient', reason: 'Recipient email is invalid.' };
  const config = options.config || process.env;
  const db = options.db || openSuppressionDb(config);
  const close = !options.db;
  const now = options.now ? new Date(options.now) : new Date();
  try {
    const suppression = getSuppression(db, email);
    if (suppression) {
      return {
        allowed: false,
        code: 'recipient_suppressed',
        reason: suppression.reason || `Recipient is suppressed by ${suppression.source || 'outreach history'}.`,
        suppression,
      };
    }

    const requirePersonalCheck = options.requirePersonalCheck !== undefined
      ? Boolean(options.requirePersonalCheck)
      : boolValue(config.THREEDVR_OUTREACH_REQUIRE_PERSONAL_SENT_CHECK, true);
    if (!requirePersonalCheck) return { allowed: true, code: 'allowed' };

    const check = db.prepare(`SELECT * FROM outreach_recipient_checks
      WHERE email = ? AND source = ? LIMIT 1`).get(email, PERSONAL_SENT_SOURCE);
    if (!check) {
      return {
        allowed: false,
        code: 'personal_sent_check_required',
        reason: 'Personal Gmail Sent history has not been checked for this recipient.',
      };
    }
    if (check.status !== 'clear') {
      return {
        allowed: false,
        code: 'personal_sent_check_not_clear',
        reason: `Personal Gmail Sent history check is ${check.status}.`,
        check,
      };
    }
    const checkedAt = Date.parse(check.checked_at);
    if (!Number.isFinite(checkedAt) || now.getTime() - checkedAt > maxCheckAgeMs(config)) {
      return {
        allowed: false,
        code: 'personal_sent_check_stale',
        reason: 'Personal Gmail Sent history clearance is stale and must be refreshed.',
        check,
      };
    }
    return { allowed: true, code: 'allowed', check };
  } finally {
    if (close) db.close();
  }
}
function domainDecision(domainValue, options = {}) {
  const domain = normalizeDomain(domainValue);
  if (!domain) return { allowed: false, code: 'invalid_domain', reason: 'Business domain is invalid.' };
  const config = options.config || process.env;
  const db = options.db || openSuppressionDb(config);
  const close = !options.db;
  try {
    const suppression = db.prepare('SELECT * FROM outreach_suppressions WHERE suppression_key = ? LIMIT 1')
      .get(suppressionKey('domain', domain));
    if (suppression) {
      return {
        allowed: false,
        code: 'domain_suppressed',
        reason: suppression.reason || `Business domain is suppressed by ${suppression.source || 'outreach history'}.`,
        suppression,
      };
    }
    return { allowed: true, code: 'allowed' };
  } finally {
    if (close) db.close();
  }
}

function recordOutboundContact(email, options = {}) {
  const suppressionOptions = {
    ...options,
    source: options.source || '3dvr-tech-outbound',
    sourceAccount: options.sourceAccount || '3dvr.tech@gmail.com',
    reason: options.reason || 'Recipient has already been contacted by 3DVR.',
  };
  const record = recordSuppression(email, suppressionOptions);
  const domain = businessDomainForEmail(email);
  if (domain) recordSuppression(domain, { ...suppressionOptions, scope: 'domain' });
  return record;
}

function enforcementEnabled(config = process.env, fallback = true) {
  return boolValue(config.THREEDVR_OUTREACH_SUPPRESSION_ENFORCED, fallback);
}

function cli(argv = process.argv.slice(2)) {
  const [command = 'decision', target = '', sourceArg = ''] = argv;
  if (!target) {
    throw new Error('Usage: suppression.cjs <decision|clear|contacted|suppress> <email> [source]');
  }
  if (command === 'decision') {
    console.log(JSON.stringify(recipientDecision(target), null, 2));
    return;
  }
  if (command === 'clear' || command === 'contacted') {
    const row = recordRecipientCheck(target, {
      status: command === 'clear' ? 'clear' : 'contacted',
      source: sourceArg || PERSONAL_SENT_SOURCE,
      evidence: process.env.THREEDVR_SUPPRESSION_EVIDENCE || '',
    });
    console.log(JSON.stringify(row, null, 2));
    return;
  }
  if (command === 'suppress') {
    console.log(JSON.stringify(recordSuppression(target, {
      source: sourceArg || 'manual',
      reason: process.env.THREEDVR_SUPPRESSION_REASON || 'Manually suppressed.',
      evidence: process.env.THREEDVR_SUPPRESSION_EVIDENCE || '',
    }), null, 2));
    return;
  }
  throw new Error(`Unknown suppression command: ${command}`);
}

module.exports = {
  DEFAULT_CHECK_MAX_AGE_HOURS,
  PERSONAL_SENT_SOURCE,
  bootstrapLegacyOutreach,
  businessDomainForEmail,
  domainDecision,
  enforcementEnabled,
  normalizeEmail,
  openSuppressionDb,
  recipientDecision,
  recordOutboundContact,
  recordRecipientCheck,
  recordSuppression,
  resolveSuppressionDbPath,
};

if (require.main === module) {
  try { cli(); } catch (error) { console.error(error.message || error); process.exit(1); }
}