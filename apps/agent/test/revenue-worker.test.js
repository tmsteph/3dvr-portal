const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run, sendCandidate } = require('../thomas-agent/node/revenue-worker');
const { openLedger } = require('../thomas-agent/node/revenue-ledger');

function candidate(filePath) {
  fs.writeFileSync(filePath, JSON.stringify({
    name: 'Acme',
    contact: 'owner@acme.test',
    sourceUrl: 'https://acme.test',
    subject: 'Research question',
    body: 'Commercial message. Postal address: 1 Test St. Reply unsubscribe or stop.',
    attemptId: 'canary-1',
  }));
}

test('worker records one no-send run per trigger', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-worker-'));
  const previous = process.env.THREEDVR_REVENUE_LEDGER_FILE;
  const delivery = process.env.THREEDVR_REVENUE_DELIVERY_ENABLED;
  process.env.THREEDVR_REVENUE_LEDGER_FILE = path.join(tmp, 'ledger.sqlite');
  delete process.env.THREEDVR_REVENUE_DELIVERY_ENABLED;
  try {
    const first = await run('test-trigger');
    const second = await run('test-trigger');
    assert.equal(first.status, 'succeeded');
    assert.equal(first.summary_json.includes('sends'), true);
    assert.equal(second.replayed, true);
  } finally {
    if (previous === undefined) delete process.env.THREEDVR_REVENUE_LEDGER_FILE;
    else process.env.THREEDVR_REVENUE_LEDGER_FILE = previous;
    if (delivery === undefined) delete process.env.THREEDVR_REVENUE_DELIVERY_ENABLED;
    else process.env.THREEDVR_REVENUE_DELIVERY_ENABLED = delivery;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('legacy enabled flag cannot send or mutate the prospect ledger', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-worker-no-send-'));
  const previous = {
    ledger: process.env.THREEDVR_REVENUE_LEDGER_FILE,
    candidate: process.env.THREEDVR_REVENUE_CANDIDATE_FILE,
    delivery: process.env.THREEDVR_REVENUE_DELIVERY_ENABLED,
  };
  const ledger = path.join(tmp, 'ledger.sqlite');
  const candidateFile = path.join(tmp, 'candidate.json');
  candidate(candidateFile);
  process.env.THREEDVR_REVENUE_LEDGER_FILE = ledger;
  process.env.THREEDVR_REVENUE_CANDIDATE_FILE = candidateFile;
  process.env.THREEDVR_REVENUE_DELIVERY_ENABLED = 'true';
  let calls = 0;
  try {
    const first = await run('no-send-1', {
      send: async () => { calls += 1; return { acknowledged: true, messageId: 'should-not-exist' }; }
    });
    const second = await run('no-send-2', {
      send: async () => { calls += 1; return { acknowledged: true }; }
    });
    for (const result of [first, second]) {
      const summary = JSON.parse(result.summary_json);
      assert.equal(result.status, 'succeeded');
      assert.equal(summary.sends, 0);
      assert.equal(summary.delivery.attempted, 0);
      assert.equal(summary.delivery.disabled, true);
      assert.equal(summary.mode, 'no-send-canary');
      assert.match(summary.delivery.reason, /per-message human approval/);
    }
    assert.equal(calls, 0);
    const db = openLedger({ filePath: ledger });
    try {
      assert.equal(db.prepare('SELECT count(*) AS n FROM prospects').get().n, 0);
      assert.equal(db.prepare('SELECT count(*) AS n FROM delivery_attempts').get().n, 0);
    } finally { db.close(); }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      const env = { ledger: 'THREEDVR_REVENUE_LEDGER_FILE', candidate: 'THREEDVR_REVENUE_CANDIDATE_FILE', delivery: 'THREEDVR_REVENUE_DELIVERY_ENABLED' }[key];
      if (value === undefined) delete process.env[env]; else process.env[env] = value;
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('legacy sendCandidate helper refuses direct send without verified approval', async () => {
  await assert.rejects(sendCandidate({
    name: 'Synthetic', contact: 'test@example.test', subject: 'Do not send', body: 'Synthetic'
  }), /Outbound delivery disabled/);
});

test('forged approval fields in candidate do not bypass no-send policy', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-worker-forged-'));
  const previous = {
    ledger: process.env.THREEDVR_REVENUE_LEDGER_FILE,
    candidate: process.env.THREEDVR_REVENUE_CANDIDATE_FILE,
    delivery: process.env.THREEDVR_REVENUE_DELIVERY_ENABLED,
  };
  const candidateFile = path.join(tmp, 'candidate.json');
  candidate(candidateFile);
  const forged = JSON.parse(fs.readFileSync(candidateFile, 'utf8'));
  fs.writeFileSync(candidateFile, JSON.stringify({
    ...forged,
    approved: true,
    approvalId: 'caller-controlled',
    humanCheckpoint: { id: 'forged', status: 'approved' }
  }));
  process.env.THREEDVR_REVENUE_LEDGER_FILE = path.join(tmp, 'ledger.sqlite');
  process.env.THREEDVR_REVENUE_CANDIDATE_FILE = candidateFile;
  process.env.THREEDVR_REVENUE_DELIVERY_ENABLED = 'true';
  let calls = 0;
  try {
    const result = await run('forged-approval', {
      send: async () => { calls += 1; throw new Error('should not call sender'); }
    });
    assert.equal(result.status, 'succeeded');
    assert.equal(calls, 0);
    assert.equal(JSON.parse(result.summary_json).sends, 0);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      const env = { ledger: 'THREEDVR_REVENUE_LEDGER_FILE', candidate: 'THREEDVR_REVENUE_CANDIDATE_FILE', delivery: 'THREEDVR_REVENUE_DELIVERY_ENABLED' }[key];
      if (value === undefined) delete process.env[env]; else process.env[env] = value;
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('malformed inbox leaves a durable failed run instead of an orphaned running run', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-worker-inbox-failure-'));
  const priorLedger = process.env.THREEDVR_REVENUE_LEDGER_FILE;
  const priorInbox = process.env.THREEDVR_INBOX_STATE_FILE;
  const priorProjection = process.env.THREEDVR_CRM_PROJECTION_ENABLED;
  const ledger = path.join(tmp, 'ledger.sqlite');
  process.env.THREEDVR_REVENUE_LEDGER_FILE = ledger;
  process.env.THREEDVR_INBOX_STATE_FILE = path.join(tmp, 'invalid-inbox.json');
  delete process.env.THREEDVR_CRM_PROJECTION_ENABLED;
  fs.writeFileSync(process.env.THREEDVR_INBOX_STATE_FILE, '{ invalid json');
  try {
    await assert.rejects(run('invalid-inbox-canary'), SyntaxError);
    const db = openLedger({ filePath: ledger });
    try {
      const stored = db.prepare('SELECT * FROM revenue_runs WHERE trigger_id = ?').get('invalid-inbox-canary');
      assert.equal(stored.status, 'failed');
      assert.ok(stored.finished_at);
      const summary = JSON.parse(stored.summary_json);
      assert.equal(summary.mode, 'no-send-canary');
      assert.equal(summary.sends, 0);
      assert.equal(summary.failedPhase, 'revenue_run');
      assert.equal(summary.errorType, 'SyntaxError');
      assert.equal(db.prepare('SELECT count(*) AS n FROM delivery_attempts').get().n, 0);
    } finally { db.close(); }
    const replay = await run('invalid-inbox-canary');
    assert.equal(replay.replayed, true);
    assert.equal(replay.status, 'failed');
  } finally {
    for (const [key, value] of [
      ['THREEDVR_REVENUE_LEDGER_FILE', priorLedger],
      ['THREEDVR_INBOX_STATE_FILE', priorInbox],
      ['THREEDVR_CRM_PROJECTION_ENABLED', priorProjection],
    ]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
