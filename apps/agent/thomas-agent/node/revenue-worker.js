// Single-process foundation for the revenue control plane.
// It intentionally does not send, crawl, or call the CRM until the migration is complete.
const { openLedger, startRun, finishRun } = require('./revenue-ledger');
const { consumeInboxState } = require('./revenue-inbox-consumer');
const { projectPendingCrm } = require('./revenue-crm-projection');

function releaseSha() {
  return String(process.env.THREEDVR_RELEASE_SHA || 'unknown').trim();
}

async function run(triggerId = process.env.THREEDVR_TRIGGER_ID || `manual:${Date.now()}`, options = {}) {
  const db = openLedger();
  try {
    const started = startRun(db, { triggerId, releaseSha: releaseSha() });
    if (started.replayed) return { ...started.run, replayed: true };
    const inbox = consumeInboxState(db, process.env.THREEDVR_INBOX_STATE_FILE);
    const crm = /^(1|true|yes|on)$/i.test(String(process.env.THREEDVR_CRM_PROJECTION_ENABLED || ''))
      ? await projectPendingCrm(db, options.crm || {})
      : { attempted: 0, succeeded: 0, failed: 0, disabled: true };
    const failed = inbox.errors.length || crm.failed;
    const finished = finishRun(db, {
      runId: started.run.id,
      status: failed ? 'failed' : 'succeeded',
      summary: { mode: 'no-send-canary', sends: 0, inbox, crm, note: 'Canonical ledger worker ran with delivery disabled.' },
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

module.exports = { run };
