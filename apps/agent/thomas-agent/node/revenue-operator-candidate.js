// Revenue authority only. Never call this with browser/model-authored receipt
// metadata: the caller must read the signed private queue row and obtain an
// independent public-source verification. This module has no transport,
// provider, outreach, or Gun side effects.
const { realpathSync } = require('node:fs');
const { join, dirname, basename } = require('node:path');
const { tmpdir } = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const { createProspect, transitionProspect } = require('./revenue-ledger');

function bounded(value, name, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new Error('Invalid ' + name);
  }
  return value.trim();
}

function sourceUrl(value) {
  const raw = bounded(value, 'source URL', 2048);
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('Invalid public source URL');
  }
  return url.href;
}

// This is a deliberately narrow import, not a general model-to-ledger command.
// Verification means the source listing exists, not that the buyer has paid,
// approved outreach, or been independently identified as a business.
function importCandidate(db, { row, expected, verifiedSource } = {}, local = false) {
  const record = row?.record;
  if (row?.source !== 'operator-http' || row?.status !== 'completed'
      || record?.status !== 'completed' || record?.backend !== (local ? 'local-canary' : 'codex')
      || record.unsafe !== false || record.error
      || record.resultTruncated !== false
      || !/^operator-http-[a-f0-9]{24}-[a-zA-Z0-9_-]{12,100}$/.test(record.id || '')
      || record.id !== expected?.taskId
      || !/^[a-f0-9]{64}$/.test(record.operatorRequestDigest || '')
      || record.operatorRequestDigest !== expected?.requestDigest
      || typeof expected?.workerDeviceId !== 'string' || !expected.workerDeviceId
      || expected.workerDeviceId.trim() !== expected.workerDeviceId
      || record.workerDeviceId !== expected.workerDeviceId) {
    throw new Error('Unverified private task completion');
  }
  const start = Date.parse(record.startedAt);
  const end = Date.parse(record.completedAt);
  const requested = Date.parse(expected.requestedAt);
  if (![start, end, requested].every(Number.isFinite)
      || start < requested || end < start || end > Date.now()) {
    throw new Error('Invalid completion chronology');
  }
  let candidate;
  try { candidate = JSON.parse(bounded(record.resultText, 'candidate result', 12000)); }
  catch { throw new Error('Invalid candidate JSON'); }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)
      || Object.keys(candidate).sort().join(',') !== 'name,sourceUrl,summary') {
    throw new Error('Unexpected candidate fields');
  }
  const name = bounded(candidate.name, 'candidate name', 200);
  const url = sourceUrl(candidate.sourceUrl);
  const summary = bounded(candidate.summary, 'candidate summary', 2000);
  // Trusted caller independently checks the listing, not just the model's URL.
  // No model-supplied approval, contact, sent, paid, or ledger fields accepted.
  if (verifiedSource?.name !== name || sourceUrl(verifiedSource?.url) !== url) {
    throw new Error('Independent source verification mismatch');
  }
  if (local && (new URL(url).hostname !== 'operator-canary.invalid' || !name.startsWith('Synthetic '))) {
    throw new Error('Local canary imports only synthetic source fixtures');
  }
  const evidence = bounded(verifiedSource.evidence, 'source evidence', 2000);
  const idempotencyKey = 'operator-candidate:' + record.id;
  const payload = { taskId: record.id, requestDigest: record.operatorRequestDigest,
    workerDeviceId: record.workerDeviceId,
    sourceUrl: url, name, summary, evidence, ...(local ? { backend: 'local-canary' } : {}) };
  const prior = db.prepare('SELECT prospect_id FROM revenue_events WHERE idempotency_key = ?').get(idempotencyKey);
  const transition = prospectId => transitionProspect(db, { prospectId,
    toState: 'verified', type: local ? 'operator_local_canary_verified' : 'operator_candidate_verified', idempotencyKey, payload });
  // Check replay before creating any prospect so a conflicting result cannot
  // leave behind an orphan lead. The ledger validates the immutable payload.
  if (prior) return transition(prior.prospect_id);
  const { prospect } = createProspect(db, { name, sourceUrl: url, campaignId: local ? 'operator-local-canary' : 'operator-research' });
  if (prospect.state !== 'prospect') return { skipped: true, reason: 'existing prospect advanced', prospect };
  return transition(prospect.id);
}

function recordOperatorCandidate(db, input) {
  return importCandidate(db, input);
}

// Separate, explicitly synthetic acceptance lane. Read the exact durable
// completion from the scratch queue, never accept a model-authored receipt.
// A normal importer still rejects local-canary results.
function recordLocalCanaryCandidate(db, { scratchDir, expected, verifiedSource, env = {} } = {}) {
  if (env.OPERATOR_RUNTIME_E2E_RUN_AUTHORIZED !== '1'
      || env.OPERATOR_RUNTIME_E2E_LOCAL_MODEL_ENABLED !== '1'
      || expected?.taskId !== env.OPERATOR_RUNTIME_E2E_EXPECTED_TASK_ID
      || !/^operator-http-[a-f0-9]{24}-operator-e2e-[A-Za-z0-9_-]{12,80}$/.test(expected?.taskId || '')
      || expected.requestDigest !== env.OPERATOR_RUNTIME_E2E_EXPECTED_REQUEST_DIGEST
      || expected.workerDeviceId !== env.OPERATOR_RUNTIME_E2E_EXPECTED_WORKER_DEVICE_ID
      || env.OPERATOR_RUNTIME_E2E_EXPECTED_OWNER_ALIAS !== 'operator-e2e-test') {
    throw new Error('Local canary import not authorized');
  }
  const dir = realpathSync(scratchDir);
  const queuePath = join(dir, 'queue.sqlite');
  const ledgerPath = join(dir, 'ledger.sqlite');
  const main = db.prepare('PRAGMA database_list').all().find(entry => entry.name === 'main');
  if (dirname(dir) !== realpathSync(tmpdir()) || !basename(dir).startsWith('operator-local-signed-')
      || queuePath !== env.OPERATOR_RUNTIME_E2E_EXPECTED_QUEUE_DB
      || realpathSync(queuePath) !== queuePath || realpathSync(ledgerPath) !== ledgerPath
      || main?.file !== ledgerPath) {
    throw new Error('Local canary requires dedicated scratch databases');
  }
  const queue = new DatabaseSync(queuePath, { readOnly: true });
  try {
    const saved = queue.prepare('SELECT source, status, record_json FROM tasks WHERE owner_alias=? AND id=?')
      .get('operator-e2e-test', expected.taskId);
    if (!saved) throw new Error('Missing durable local canary completion');
    const row = { source: saved.source, status: saved.status, record: JSON.parse(saved.record_json) };
    return importCandidate(db, { row, expected, verifiedSource }, true);
  } finally { queue.close(); }
}

module.exports = { recordOperatorCandidate, recordLocalCanaryCandidate };
