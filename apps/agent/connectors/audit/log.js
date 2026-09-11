const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

function defaultAuditPath() {
  return process.env.THREEDVR_CONNECTOR_AUDIT_FILE
    || path.join(os.homedir(), '.3dvr', 'connectors', 'audit.ndjson');
}

function hashText(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

function appendAudit(event = {}, { filePath = defaultAuditPath() } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const record = {
    id: event.id || `audit_${crypto.randomUUID()}`,
    time: event.time || new Date().toISOString(),
    actor: event.actor || 'mcp',
    tool: event.tool || '',
    accountId: event.accountId || '',
    target: event.target || '',
    queryHash: event.query ? hashText(event.query) : (event.queryHash || ''),
    result: event.result || 'unknown',
    error: event.error ? String(event.error).slice(0, 500) : '',
  };
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Some filesystems ignore chmod.
  }
  return record;
}

module.exports = {
  appendAudit,
  defaultAuditPath,
  hashText,
};
