// Single-process foundation for the revenue control plane.
// It intentionally does not send, crawl, or call the CRM until the migration is complete.
const { openLedger, startRun, finishRun } = require('./revenue-ledger');

function releaseSha() {
  return String(process.env.THREEDVR_RELEASE_SHA || 'unknown').trim();
}

function run(triggerId = process.env.THREEDVR_TRIGGER_ID || `manual:${Date.now()}`) {
  const db = openLedger();
  try {
    const started = startRun(db, { triggerId, releaseSha: releaseSha() });
    if (started.replayed) return { ...started.run, replayed: true };
    const finished = finishRun(db, {
      runId: started.run.id,
      status: 'succeeded',
      summary: { mode: 'foundation', sends: 0, note: 'Ledger initialized; delivery remains disabled until migration acceptance.' },
    });
    return { ...finished, replayed: false };
  } finally {
    db.close();
  }
}

if (require.main === module) {
  console.log(JSON.stringify(run(process.argv[2]), null, 2));
}

module.exports = { run };
