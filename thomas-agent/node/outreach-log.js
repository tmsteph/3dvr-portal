const fs = require('node:fs');
const path = require('node:path');

function normalizeText(value) {
  return String(value || '').trim();
}

function resolveLogFilePath(filePath = process.env.THREEDVR_OUTREACH_LOG_FILE) {
  return normalizeText(filePath) || path.join(__dirname, '..', 'outreach-log.ndjson');
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function normalizeEntry(entry = {}) {
  return {
    timestamp: normalizeText(entry.timestamp) || new Date().toISOString(),
    kind: normalizeText(entry.kind) || 'email',
    status: normalizeText(entry.status) || 'sent',
    source: normalizeText(entry.source) || 'unknown',
    name: normalizeText(entry.name),
    site: normalizeText(entry.site),
    contact: normalizeText(entry.contact),
    route: normalizeText(entry.route),
    subject: normalizeText(entry.subject),
    body: String(entry.body || ''),
    transport: normalizeText(entry.transport),
    mode: normalizeText(entry.mode),
    adapter: normalizeText(entry.adapter),
    targetUrl: normalizeText(entry.targetUrl),
    screenshotPath: normalizeText(entry.screenshotPath),
    submitted: Boolean(entry.submitted),
    note: normalizeText(entry.note),
  };
}

function appendOutreachLog(entry = {}, options = {}) {
  const filePath = resolveLogFilePath(options.filePath);
  const normalized = normalizeEntry(entry);
  ensureParentDir(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify(normalized)}\n`);
  return normalized;
}

function readOutreachLog(options = {}) {
  const filePath = resolveLogFilePath(options.filePath);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const rows = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
  return rows.flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

function formatOutreachLogEntry(entry = {}) {
  const pieces = [
    entry.timestamp || '',
    entry.kind || 'email',
    entry.status || 'sent',
    entry.name || '',
    entry.route ? `route=${entry.route}` : '',
    entry.source ? `source=${entry.source}` : '',
    entry.subject ? `subject=${entry.subject}` : '',
  ].filter(Boolean);

  return pieces.join(' | ');
}

function archiveGroupKey(entry = {}) {
  return [
    entry.kind || 'email',
    entry.route || 'unknown-route',
    entry.source || 'unknown-source',
  ].join('::');
}

function formatArchiveGroupHeading(entry = {}, count = 0) {
  const kind = entry.kind || 'email';
  const route = entry.route || 'unknown-route';
  const source = entry.source || 'unknown-source';
  return `${kind} | ${route} | ${source} (${count})`;
}

function printRecent(entries, limit = 20) {
  const recent = entries.slice(-Math.max(1, limit));
  for (const entry of recent) {
    console.log(formatOutreachLogEntry(entry));
    if (entry.body) {
      console.log(entry.body);
      console.log('');
    }
  }
}

function printArchive(entries, limit = 20) {
  const recent = entries.slice(-Math.max(1, limit));
  const groups = new Map();

  for (const entry of recent) {
    const key = archiveGroupKey(entry);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(entry);
  }

  for (const groupEntries of groups.values()) {
    const first = groupEntries[0] || {};
    console.log(formatArchiveGroupHeading(first, groupEntries.length));
    for (const entry of groupEntries) {
      console.log(`- ${formatOutreachLogEntry(entry)}`);
      if (entry.body) {
        console.log(entry.body);
      }
    }
    console.log('');
  }
}

function parseLimit(value, fallback = 20) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cli(argv = process.argv.slice(2)) {
  const command = argv[0] || 'list';
  const limit = parseLimit(argv[1], 20);
  if (command === 'append') {
    const entry = {
      kind: process.env.THREEDVR_OUTREACH_LOG_KIND,
      status: process.env.THREEDVR_OUTREACH_LOG_STATUS,
      source: process.env.THREEDVR_OUTREACH_LOG_SOURCE,
      name: process.env.THREEDVR_OUTREACH_LOG_NAME,
      site: process.env.THREEDVR_OUTREACH_LOG_SITE,
      contact: process.env.THREEDVR_OUTREACH_LOG_CONTACT,
      route: process.env.THREEDVR_OUTREACH_LOG_ROUTE,
      subject: process.env.THREEDVR_OUTREACH_LOG_SUBJECT,
      body: process.env.THREEDVR_OUTREACH_LOG_BODY,
      transport: process.env.THREEDVR_OUTREACH_LOG_TRANSPORT,
      mode: process.env.THREEDVR_OUTREACH_LOG_MODE,
      adapter: process.env.THREEDVR_OUTREACH_LOG_ADAPTER,
      targetUrl: process.env.THREEDVR_OUTREACH_LOG_TARGET_URL,
      screenshotPath: process.env.THREEDVR_OUTREACH_LOG_SCREENSHOT_PATH,
      submitted: process.env.THREEDVR_OUTREACH_LOG_SUBMITTED === 'true',
      note: process.env.THREEDVR_OUTREACH_LOG_NOTE,
    };
    const written = appendOutreachLog(entry);
    console.log(formatOutreachLogEntry(written));
    return;
  }

  const entries = readOutreachLog();
  if (command === 'grouped' || command === 'archive') {
    printArchive(entries, limit);
    return;
  }

  printRecent(entries, limit);
}

module.exports = {
  appendOutreachLog,
  archiveGroupKey,
  formatOutreachLogEntry,
  formatArchiveGroupHeading,
  printArchive,
  printRecent,
  parseLimit,
  readOutreachLog,
  resolveLogFilePath,
};

if (require.main === module) {
  cli();
}
