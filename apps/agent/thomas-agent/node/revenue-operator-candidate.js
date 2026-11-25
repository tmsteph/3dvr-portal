// Revenue authority only. Never call this with browser/model-authored receipt
// metadata: the caller must read the signed private queue row and obtain an
// independent public-source verification. This module has no transport,
// provider, outreach, or Gun side effects.
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
function recordOperatorCandidate(db, { row, expected, verifiedSource } = {}) {
  const record = row?.record;
  if (row?.source !== 'operator-http' || row?.status !== 'completed'
      || record?.status !== 'completed' || record?.backend !== 'codex'
      || record.unsafe !== false || record.error
      || record.resultTruncated !== false
      || !/^operator-http-[a-f0-9]{24}-[a-zA-Z0-9_-]{12,100}$/.test(record.id || '')
      || record.id !== expected?.taskId
      || !/^[a-f0-9]{64}$/.test(record.operatorRequestDigest || '')
      || record.operatorRequestDigest !== expected?.requestDigest
      || typeof record.workerDeviceId !== 'string' || !record.workerDeviceId.trim()) {
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
  const evidence = bounded(verifiedSource.evidence, 'source evidence', 2000);
  const idempotencyKey = 'operator-candidate:' + record.id;
  const payload = { taskId: record.id, requestDigest: record.operatorRequestDigest,
    sourceUrl: url, name, summary, evidence };
  const prior = db.prepare('SELECT prospect_id FROM revenue_events WHERE idempotency_key = ?').get(idempotencyKey);
  const transition = prospectId => transitionProspect(db, { prospectId,
    toState: 'verified', type: 'operator_candidate_verified', idempotencyKey, payload });
  // Check replay before creating any prospect so a conflicting result cannot
  // leave behind an orphan lead. The ledger validates the immutable payload.
  if (prior) return transition(prior.prospect_id);
  const { prospect } = createProspect(db, { name, sourceUrl: url, campaignId: 'operator-research' });
  if (prospect.state !== 'prospect') return { skipped: true, reason: 'existing prospect advanced', prospect };
  return transition(prospect.id);
}

module.exports = { recordOperatorCandidate };
