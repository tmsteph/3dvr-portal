const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { acknowledgedDeliveryCount, createProspect, getProspect, openLedger, startRun, finishRun, transitionProspect } = require('./revenue-ledger');
const { deliverProspect } = require('./revenue-delivery');
const { consumeInboxState } = require('./revenue-inbox-consumer');
const { projectPendingCrm } = require('./revenue-crm-projection');

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
  if (!enabled(process.env.THREEDVR_REVENUE_DELIVERY_ENABLED)) {
    return { attempted: 0, sends: 0, disabled: true };
  }
  const candidate = loadCandidate();
  if (!candidate) return { attempted: 0, sends: 0, reason: 'no candidate' };
  const startOfUtcDay = new Date();
  startOfUtcDay.setUTCHours(0, 0, 0, 0);
  const dailyLimit = Number.parseInt(process.env.THREEDVR_REVENUE_DAILY_SEND_LIMIT || '1', 10);
  const campaignLimit = Number.parseInt(process.env.THREEDVR_REVENUE_CAMPAIGN_SEND_LIMIT || '10', 10);
  const dailySent = acknowledgedDeliveryCount(db, { since: startOfUtcDay.toISOString() });
  const campaignSent = acknowledgedDeliveryCount(db, { since: '1970-01-01T00:00:00.000Z', campaignId: candidate.campaignId || 'market-research' });
  if (dailySent >= dailyLimit || campaignSent >= campaignLimit) {
    return { attempted: 0, sends: 0, reason: 'quota exhausted', dailySent, dailyLimit, campaignSent, campaignLimit };
  }
  const prepared = prepareCandidate(db, candidate);
  if (!prepared.eligible) {
    return { attempted: 0, sends: 0, reason: prepared.reason || 'candidate not eligible', prospectId: prepared.prospect.id };
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

async function run(triggerId = process.env.THREEDVR_TRIGGER_ID || `manual:${Date.now()}`, options = {}) {
  const db = openLedger();
  try {
    const started = startRun(db, { triggerId, releaseSha: releaseSha() });
    if (started.replayed) return { ...started.run, replayed: true };
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
