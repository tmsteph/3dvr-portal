const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { acknowledgedDeliveryCount, createProspect, getProspect, openLedger, resolveLedgerPath, startRun, finishRun, transitionProspect } = require('./revenue-ledger');
const { deliverProspect } = require('./revenue-delivery');
const { consumeInboxState } = require('./revenue-inbox-consumer');
const { projectPendingCrm } = require('./revenue-crm-projection');
const { recordOperatorCandidate } = require('./revenue-operator-candidate');
const { DatabaseSync } = require('node:sqlite');

const execFileAsync = promisify(execFile);

function releaseSha() {
  return String(process.env.THREEDVR_RELEASE_SHA || 'unknown').trim();
}

function enabled(value) {
  return /^(1|true|yes|on)$/i.test(String(value || ''));
}

function loadCandidate(filePath = process.env.THREEDVR_REVENUE_CANDIDATE_FILE) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const candidate = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  for (const field of ['name', 'contact', 'sourceUrl', 'subject', 'body', 'attemptId']) {
    if (!String(candidate[field] || '').trim()) throw new Error(`Revenue candidate is missing ${field}`);
  }
  return candidate;
}

function prepareCandidate(db, candidate) {
  const created = createProspect(db, {
    name: candidate.name,
    contact: candidate.contact,
    sourceUrl: candidate.sourceUrl,
    campaignId: candidate.campaignId || 'market-research',
  });
  let prospect = created.prospect;
  if (['sent', 'bounced', 'replied', 'suppressed'].includes(prospect.state)) {
    return { prospect, eligible: false, reason: `terminal state: ${prospect.state}` };
  }
  // A timeout or lost acknowledgement might mean the external message was
  // actually delivered. A new candidate/attempt ID must not silently retry it.
  // Require human reconciliation of any prior attempt before further outreach.
  const priorAttempt = db.prepare(
    'SELECT status FROM delivery_attempts WHERE prospect_id = ? LIMIT 1'
  ).get(prospect.id);
  if (priorAttempt) {
    return { prospect, eligible: false, requiresReview: true,
      reason: `prior delivery attempt (${priorAttempt.status}) requires manual reconciliation` };
  }
  if (['prospect', 'failed'].includes(prospect.state)) {
    prospect = transitionProspect(db, {
      prospectId: prospect.id,
      toState: 'verified',
      type: 'candidate_verified',
      idempotencyKey: `candidate:${candidate.attemptId}:verified`,
      payload: { sourceUrl: candidate.sourceUrl },
    }).prospect;
  }
  if (['verified', 'drafted'].includes(prospect.state)) {
    prospect = transitionProspect(db, {
      prospectId: prospect.id,
      toState: 'eligible',
      type: 'candidate_eligible',
      idempotencyKey: `candidate:${candidate.attemptId}:eligible`,
      payload: { subject: candidate.subject },
    }).prospect;
  }
  return { prospect: getProspect(db, prospect.id), eligible: prospect.state === 'eligible' };
}

async function sendCandidate(candidate) {
  const script = require.resolve('./send-outreach-email');
  const contact = String(candidate.contact).replace(/^mailto:/i, '');
  const result = await execFileAsync(process.execPath, [
    script, '--to', contact, '--subject', candidate.subject, '--text', candidate.body,
  ], { timeout: Number.parseInt(process.env.THREEDVR_REVENUE_SEND_TIMEOUT_MS || '30000', 10) });
  return { acknowledged: true, messageId: '', transport: 'portal', stdout: result.stdout };
}

async function deliverCandidate(db, options = {}) {
  // Isolated Operator→CRM acceptance must remain no-send even when a host has
  // delivery enabled. Refuse before reading candidate data, quotas or the DB.
  if (options.isolated === true || options.crm?.isolated === true) {
    return { attempted: 0, sends: 0, disabled: true,
      reason: 'isolated acceptance forbids outbound delivery' };
  }
  if (!enabled(process.env.THREEDVR_REVENUE_DELIVERY_ENABLED)) {
    return { attempted: 0, sends: 0, disabled: true };
  }
  const parseLimit = (raw, fallback) => {
    if (raw === undefined) return fallback;
    const value = String(raw).trim();
    if (!/^\d+$/.test(value)) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : null;
  };
  const dailyLimit = parseLimit(process.env.THREEDVR_REVENUE_DAILY_SEND_LIMIT, 1);
  const campaignLimit = parseLimit(process.env.THREEDVR_REVENUE_CAMPAIGN_SEND_LIMIT, 10);
  // NaN comparisons are false, and parseInt silently accepts partial strings.
  // Reject bad configuration before candidate parsing, ledger access or delivery.
  if (dailyLimit === null || campaignLimit === null) {
    return { attempted: 0, sends: 0, disabled: true,
      reason: 'invalid revenue delivery quota', error: 'Revenue delivery quotas must be nonnegative safe integers' };
  }
  const candidate = loadCandidate();
  if (!candidate) return { attempted: 0, sends: 0, reason: 'no candidate' };
  const startOfUtcDay = new Date();
  startOfUtcDay.setUTCHours(0, 0, 0, 0);
  const dailySent = acknowledgedDeliveryCount(db, { since: startOfUtcDay.toISOString() });
  const campaignSent = acknowledgedDeliveryCount(db, { since: '1970-01-01T00:00:00.000Z', campaignId: candidate.campaignId || 'market-research' });
  if (dailySent >= dailyLimit || campaignSent >= campaignLimit) {
    return { attempted: 0, sends: 0, reason: 'quota exhausted', dailySent, dailyLimit, campaignSent, campaignLimit };
  }
  const prepared = prepareCandidate(db, candidate);
  if (!prepared.eligible) {
    return { attempted: 0, sends: 0, reason: prepared.reason || 'candidate not eligible',
      prospectId: prepared.prospect.id, error: prepared.requiresReview ? prepared.reason : '' };
  }
  const result = await deliverProspect(
    db,
    { prospectId: prepared.prospect.id, attemptId: candidate.attemptId },
    () => (options.send || sendCandidate)(candidate),
  );
  return {
    attempted: 1,
    sends: result.prospect.state === 'sent' && !result.replayed ? 1 : 0,
    prospectId: prepared.prospect.id,
    state: result.prospect.state,
    error: result.error || '',
  };
}

// An isolated acceptance must not create or modify the host revenue ledger.
function resolveIsolatedLedgerFile(options = {}) {
  const requested = options.ledgerFile;
  if (typeof requested !== 'string' || !path.isAbsolute(requested)) {
    throw new Error('Isolated revenue run requires an explicit absolute scratch ledgerFile');
  }
  const tmpRoot = fs.realpathSync(os.tmpdir());
  let directory;
  try { directory = fs.realpathSync(path.dirname(requested)); }
  catch { throw new Error('Isolated revenue scratch directory must already exist'); }
  if (directory === tmpRoot || !directory.startsWith(tmpRoot + path.sep)) {
    throw new Error('Isolated revenue ledger must be inside a dedicated temporary subdirectory');
  }
  const resolved = path.join(directory, path.basename(requested));
  const configured = resolveLedgerPath();
  let active = path.resolve(configured);
  try { active = fs.realpathSync(configured); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  let existing;
  try { existing = fs.lstatSync(requested); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (resolved === active || existing?.isSymbolicLink()) {
    throw new Error('Isolated revenue ledger cannot use the active ledger or a symlink');
  }
  // A hard link can point at a host ledger despite having a different path.
  // Reject shared inodes before SQLite can touch an existing scratch file.
  if (existing?.nlink > 1) {
    throw new Error('Isolated revenue ledger cannot use a hard-linked file');
  }
  return resolved;
}

// Trusted server-side acceptance only: take the exact private queue row from
// an explicitly selected scratch database, never a browser/model receipt.
// Open read-only; unlike the normal queue store this does not initialize a DB.
function importIsolatedOperatorCandidate(db, { queueDb, ownerAlias, expected, verifiedSource } = {}) {
  if (typeof ownerAlias !== 'string' || !ownerAlias.trim() || ownerAlias.trim() !== ownerAlias
      || typeof expected?.taskId !== 'string' || !expected.taskId) {
    throw new Error('Isolated Operator candidate requires an explicit owner and task ID');
  }
  const file = resolveIsolatedLedgerFile({ ledgerFile: queueDb });
  if (!fs.lstatSync(file).isFile()) throw new Error('Isolated Operator queue must be an existing regular file');
  const queue = new DatabaseSync(file, { readOnly: true });
  try {
    const row = queue.prepare('SELECT source, status, record_json FROM tasks WHERE owner_alias = ? AND id = ?')
      .get(ownerAlias, expected.taskId);
    if (!row) throw new Error('Private Operator candidate task not found');
    return recordOperatorCandidate(db, { row: {
      source: row.source, status: row.status, record: JSON.parse(row.record_json),
    }, expected, verifiedSource });
  } finally { queue.close(); }
}

async function run(triggerId = process.env.THREEDVR_TRIGGER_ID || `manual:${Date.now()}`, options = {}) {
  const isolated = options.isolated === true || options.crm?.isolated === true;
  if (options.operatorCandidate !== undefined && !isolated) {
    throw new Error('Operator candidate import is restricted to isolated acceptance');
  }
  const db = openLedger(isolated ? { filePath: resolveIsolatedLedgerFile(options) } : {});
  try {
    const started = startRun(db, { triggerId, releaseSha: releaseSha() });
    if (started.replayed) return { ...started.run, replayed: true };
    let inbox;
    let delivery;
    let crm;
    try {
      inbox = isolated
        ? { scanned: 0, matched: 0, unmatched: 0, errors: [], skipped: true }
        : consumeInboxState(db, process.env.THREEDVR_INBOX_STATE_FILE);
      if (options.operatorCandidate !== undefined) {
        // The caller must independently verify the source and pin the signed
        // request metadata. This path does not claim hosted execution/readback.
        importIsolatedOperatorCandidate(db, options.operatorCandidate);
      }
      delivery = await deliverCandidate(db, options);
      const projectionEnabled = enabled(process.env.THREEDVR_CRM_PROJECTION_ENABLED);
      crm = projectionEnabled
        ? await projectPendingCrm(db, isolated ? { ...(options.crm || {}), isolated: true } : (options.crm || {}))
        : { attempted: 0, succeeded: 0, failed: 0, disabled: true };
      // A scratch no-send canary must not report success as though it tested
      // CRM when projection was disabled or the scratch outbox was empty.
      // Acknowledged writes still do NOT prove independent CRM readback.
      if (isolated && !projectionEnabled) {
        throw new Error('Isolated acceptance incomplete: CRM projection is disabled');
      }
      if (isolated && crm.succeeded < 1) {
        throw new Error('Isolated acceptance incomplete: no acknowledged CRM projection');
      }
      if (isolated) {
        // A limited batch may acknowledge one event while leaving other
        // scratch events pending. Do not confuse a partial CRM sync with
        // acceptance of the complete test fixture.
        const outstanding = db.prepare("SELECT COUNT(*) AS n FROM projection_outbox WHERE status <> 'succeeded'").get().n;
        if (outstanding > 0) {
          throw new Error(`Isolated acceptance incomplete: ${outstanding} unresolved CRM projection(s)`);
        }
      }
      const failed = inbox.errors.length || crm.failed || delivery.error;
      const finished = finishRun(db, {
        runId: started.run.id,
        status: failed ? 'failed' : 'succeeded',
        summary: {
          mode: delivery.disabled ? 'no-send-canary' : 'bounded-delivery',
          sends: delivery.sends,
          delivery,
          inbox,
          crm,
          ...(isolated ? { verification: {
            crmWriteAcknowledged: crm.succeeded > 0,
            independentCrmReadbackVerified: false,
            hostedWorkerVerified: false,
          } } : {}),
        },
      });
      return { ...finished, replayed: false };
    } catch (error) {
      // A malformed candidate or invalid isolated relay must not strand a
      // trigger in "running": replays would then appear active forever.
      // Preserve what completed before the error; delivery may have been
      // attempted, so never invent a zero-send receipt when it is unknown.
      const summary = {
        mode: 'failed-before-completion',
        error: String(error?.message || error).slice(0, 500),
        ...(inbox ? { inbox } : {}),
        ...(delivery ? { delivery, sends: delivery.sends } : {}),
        ...(crm ? { crm } : {}),
      };
      return { ...finishRun(db, { runId: started.run.id, status: 'failed', summary }), replayed: false };
    }
  } finally {
    db.close();
  }
}

if (require.main === module) {
  run(process.argv[2])
    .then(result => { console.log(JSON.stringify(result, null, 2)); process.exit(result.status === 'succeeded' ? 0 : 1); })
    .catch(error => { console.error(error); process.exit(1); });
}

module.exports = { deliverCandidate, loadCandidate, prepareCandidate, resolveIsolatedLedgerFile, run, sendCandidate };
