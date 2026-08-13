const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openLedger } = require('../thomas-agent/node/revenue-ledger');
const { importHistory } = require('../thomas-agent/node/revenue-history-import');
function fixture(files) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-history-')); for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content); return dir; }
test('history importer dry-runs, imports once, and preserves legacy provenance', () => {
  const dir = fixture({ 'leads.csv': 'name,link,contact,status,date,variant\nAcme,https://acme.test,mailto:info@acme.test,contacted,2026-08-01,campaign-a\nBeta,https://beta.test,https://beta.test,failed,2026-08-01,campaign-a\n', 'outreach.ndjson': '{"name":"Acme","site":"https://acme.test","contact":"mailto:info@acme.test","status":"sent"}\n' });
  const options = { leadsFile: path.join(dir, 'leads.csv'), outreachLogFile: path.join(dir, 'outreach.ndjson'), ledgerFile: path.join(dir, 'ledger.sqlite') };
  try {
    assert.deepEqual(importHistory(options).totals, { leadRows: 2, outreachRows: 1, uniqueProspects: 2, conflicts: 0, resolvedDiscrepancies: 0, invalidLogLines: 0 });
    assert.deepEqual(importHistory({ ...options, apply: true }).applied, { created: 2, imported: 2 });
    assert.deepEqual(importHistory({ ...options, apply: true }).applied, { created: 0, imported: 0 });
    const db = openLedger({ filePath: options.ledgerFile }); try { assert.equal(db.prepare("SELECT COUNT(*) AS total FROM revenue_events WHERE type = 'legacy_import'").get().total, 2); } finally { db.close(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('history importer treats the timestamped outreach log as authority over stale CSV status', () => {
  const dir = fixture({ 'leads.csv': 'name,link,contact,status,date,variant\nAcme,https://acme.test,mailto:info@acme.test,failed,2026-08-01,campaign-a\n', 'outreach.ndjson': '{"name":"Acme","site":"https://acme.test","contact":"mailto:info@acme.test","status":"sent"}\n' });
  const options = { leadsFile: path.join(dir, 'leads.csv'), outreachLogFile: path.join(dir, 'outreach.ndjson'), ledgerFile: path.join(dir, 'ledger.sqlite'), apply: true };
  try {
    const report = importHistory(options);
    assert.equal(report.totals.conflicts, 0);
    assert.equal(report.totals.resolvedDiscrepancies, 1);
    assert.equal(report.resolutions[0].resolvedState, 'sent');
    assert.deepEqual(report.applied, { created: 1, imported: 1 });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('history importer records a delivery failure notice as a bounce after send', () => {
  const dir = fixture({ 'leads.csv': 'name,link,contact,status,date,variant\nAcme,https://acme.test,mailto:info@acme.test,contacted,2026-08-01,campaign-a\n', 'outreach.ndjson': '{"timestamp":"2026-08-01T10:00:00Z","name":"Acme","contact":"mailto:info@acme.test","status":"sent"}\n{"timestamp":"2026-08-02T10:00:00Z","name":"Acme","contact":"mailto:info@acme.test","status":"failed","deliveryStatus":"bounced"}\n' });
  const options = { leadsFile: path.join(dir, 'leads.csv'), outreachLogFile: path.join(dir, 'outreach.ndjson'), ledgerFile: path.join(dir, 'ledger.sqlite'), apply: true };
  try {
    const report = importHistory(options);
    assert.equal(report.totals.conflicts, 0);
    assert.equal(report.resolutions[0].resolvedState, 'bounced');
    const db = openLedger({ filePath: options.ledgerFile });
    try { assert.equal(db.prepare('SELECT state FROM prospects').get().state, 'bounced'); } finally { db.close(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
