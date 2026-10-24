const fs = require('node:fs');
const { createProspect, getProspect, openLedger, startRun, finishRun, transitionProspect } = require('./revenue-ledger');
const { consumeInboxState } = require('./revenue-inbox-consumer');
const { projectPendingCrm } = require('./revenue-crm-projection');

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

// Legacy autonomous revenue delivery has no independently authenticated,
// single-use human approval bound to the recipient and message body.
// It must not be re-enabled by an environment flag or injected sender.
async function sendCandidate() {
  throw new Error('Outbound delivery disabled until authenticated per-message approval and delivery verification exist');
}

async function deliverCandidate() {
  return {
    attempted: 0,
    sends: 0,
    disabled: true,
    reason: 'outbound delivery disabled pending authenticated per-message human approval'
  };
}

async function run(triggerId = process.env.THREEDVR_TRIGGER_ID || `manual:${Date.now()}`, options = {}) {
  const db = openLedger();
  try {
    const started = startRun(db, { triggerId, releaseSha: releaseSha() });
    if (started.replayed) return { ...started.run, replayed: true };
    try {
      const inbox = consumeInboxState(db, process.env.THREEDVR_INBOX_STATE_FILE);
      const delivery = await deliverCandidate(db, options);
      const crm = /^(1|true|yes|on)$/i.test(String(process.env.THREEDVR_CRM_PROJECTION_ENABLED || ''))
        ? await projectPendingCrm(db, options.crm || {})
        : { attempted: 0, succeeded: 0, failed: 0, disabled: true };
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
        },
      });
      return { ...finished, replayed: false };
    } catch (error) {
      // A malformed inbox file or failed CRM writer must not strand a run in
      // 'running' forever. Preserve the original error without storing its
      // potentially sensitive message in the durable run summary.
      try {
        finishRun(db, {
          runId: started.run.id,
          status: 'failed',
          summary: { mode: 'no-send-canary', sends: 0, failedPhase: 'revenue_run', errorType: String(error?.name || 'Error') },
        });
      } catch {
        // Do not mask the original failure if the run was already finalized.
      }
      throw error;
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

module.exports = { deliverCandidate, loadCandidate, prepareCandidate, run, sendCandidate };
