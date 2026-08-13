// One-time, dry-run-first reconciliation of the legacy leads CSV and outreach NDJSON.
// This module never sends email, calls a CRM, or reads credentials.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { contactKey, createProspect, importProspectState, openLedger } = require('./revenue-ledger');

function text(value) { return String(value || '').trim(); }
function lower(value) { return text(value).toLowerCase(); }
function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function csvRows(content) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    if (quoted && char === '"' && content[i + 1] === '"') { field += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ',') { row.push(field); field = ''; }
    else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && content[i + 1] === '\n') i += 1;
      row.push(field); if (row.some(cell => text(cell))) rows.push(row); row = []; field = '';
    } else field += char;
  }
  row.push(field); if (row.some(cell => text(cell))) rows.push(row);
  return rows;
}

function readLeadsCsv(filePath) {
  const [header = [], ...rows] = csvRows(fs.readFileSync(filePath, 'utf8'));
  const columns = header.map(lower);
  const field = (row, name) => row[columns.indexOf(name)] || '';
  return rows.map((row, index) => ({ kind: 'lead', row: index + 2, name: text(field(row, 'name')), sourceUrl: text(field(row, 'link')), contact: text(field(row, 'contact')), status: lower(field(row, 'status')) || 'prospect', campaignId: text(field(row, 'variant')) }))
    .filter(item => item.name);
}

function readOutreachNdjson(filePath) {
  const invalid = []; const entries = [];
  fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).forEach((line, index) => {
    try {
      const item = JSON.parse(line);
      entries.push({ kind: 'outreach', row: index + 1, name: text(item.name), sourceUrl: text(item.site), contact: text(item.contact), status: lower(item.status), campaignId: text(item.campaignId || item.experiment) });
    } catch { invalid.push(index + 1); }
  });
  return { entries: entries.filter(item => item.name || item.contact || item.sourceUrl), invalid };
}

function stateForStatus(status) {
  const value = lower(status);
  if (['sent', 'submitted', 'contacted'].includes(value)) return 'sent';
  if (value === 'replied') return 'replied';
  if (['bounced', 'bounce'].includes(value)) return 'bounced';
  if (['suppressed', 'unsubscribed'].includes(value)) return 'suppressed';
  if (['failed', 'send_failed', 'probe_failed'].includes(value)) return 'failed';
  return 'prospect';
}

function stateRank(state) { return ['prospect', 'failed', 'sent', 'bounced', 'replied', 'suppressed'].indexOf(state); }

function reconcile({ leads = [], outreach = [], invalidLogLines = [] } = {}) {
  const grouped = new Map();
  for (const item of [...leads, ...outreach]) {
    const key = contactKey(item); const next = { ...item, key, state: stateForStatus(item.status) };
    if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(next);
  }
  const conflicts = []; const prospects = [];
  for (const [key, items] of grouped) {
    const states = [...new Set(items.map(item => item.state))];
    const terminal = states.filter(state => ['failed', 'bounced', 'replied', 'suppressed'].includes(state));
    if (terminal.length > 1 || (states.includes('sent') && states.includes('failed'))) conflicts.push({ key, states, rows: items.map(item => `${item.kind}:${item.row}`) });
    const chosen = items.slice().sort((a, b) => stateRank(a.state) - stateRank(b.state)).at(-1);
    prospects.push({ key, name: chosen.name || items[0].name || 'Unknown', sourceUrl: chosen.sourceUrl || items[0].sourceUrl, contact: chosen.contact || items[0].contact, campaignId: chosen.campaignId || items[0].campaignId, state: chosen.state, sources: items });
  }
  return { prospects, conflicts, invalidLogLines };
}

function importHistory(options = {}) {
  const leadsFile = path.resolve(options.leadsFile); const outreachLogFile = path.resolve(options.outreachLogFile);
  const leadsContent = fs.readFileSync(leadsFile, 'utf8'); const logContent = fs.readFileSync(outreachLogFile, 'utf8');
  const leadRows = readLeadsCsv(leadsFile); const log = readOutreachNdjson(outreachLogFile);
  const result = reconcile({ leads: leadRows, outreach: log.entries, invalidLogLines: log.invalid });
  const report = { mode: options.apply ? 'apply' : 'dry-run', sources: { leadsFile, outreachLogFile, leadsDigest: digest(leadsContent), outreachDigest: digest(logContent) }, totals: { leadRows: leadRows.length, outreachRows: log.entries.length, uniqueProspects: result.prospects.length, conflicts: result.conflicts.length, invalidLogLines: result.invalidLogLines.length }, conflicts: result.conflicts, invalidLogLines: result.invalidLogLines };
  if (!options.apply) return report;
  if (!text(options.ledgerFile)) throw new Error('A ledgerFile is required when applying legacy history');
  if (result.conflicts.length || result.invalidLogLines.length) throw new Error(`Legacy import blocked: ${result.conflicts.length} conflicts and ${result.invalidLogLines.length} invalid NDJSON lines`);
  const db = openLedger({ filePath: options.ledgerFile });
  try {
    let created = 0; let imported = 0;
    for (const prospect of result.prospects) {
      const createdResult = createProspect(db, prospect); if (createdResult.created) created += 1;
      if (prospect.state !== 'prospect') {
        const sourceKey = digest(`${report.sources.leadsDigest}:${report.sources.outreachDigest}:${prospect.key}:${prospect.state}`);
        const importedResult = importProspectState(db, { prospectId: createdResult.prospect.id, toState: prospect.state, idempotencyKey: `legacy-import:${sourceKey}`, payload: { source: 'legacy-csv-ndjson', sourceRows: prospect.sources.map(item => `${item.kind}:${item.row}`) } });
        if (!importedResult.replayed) imported += 1;
      }
    }
    return { ...report, applied: { created, imported } };
  } finally { db.close(); }
}

function cli(argv = process.argv.slice(2)) {
  const [leadsFile, outreachLogFile] = argv.filter(arg => !arg.startsWith('--'));
  if (!leadsFile || !outreachLogFile) throw new Error('Usage: revenue-history-import <leads.csv> <outreach-log.ndjson> [--apply] [--ledger <file>]');
  const ledgerIndex = argv.indexOf('--ledger');
  console.log(JSON.stringify(importHistory({ leadsFile, outreachLogFile, apply: argv.includes('--apply'), ledgerFile: ledgerIndex >= 0 ? argv[ledgerIndex + 1] : undefined }), null, 2));
}

if (require.main === module) cli();
module.exports = { csvRows, importHistory, readLeadsCsv, readOutreachNdjson, reconcile, stateForStatus };
