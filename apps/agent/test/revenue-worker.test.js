const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run, deliverCandidate } = require('../thomas-agent/node/revenue-worker');
const { openLedger, createProspect, transitionProspect } = require('../thomas-agent/node/revenue-ledger');

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

test('isolated revenue run uses scratch ledger, not host inbox or live ledger', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-worker-active-'));
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-worker-scratch-'));
  const active = path.join(tmp, 'active-ledger.sqlite');
  const scratch = path.join(scratchDir, 'isolated-ledger.sqlite');
  const inboxFile = path.join(tmp, 'inbox.json');
  fs.writeFileSync(inboxFile, '{invalid-inbox-json');
  const names = [
    'THREEDVR_REVENUE_LEDGER_FILE', 'THREEDVR_INBOX_STATE_FILE',
    'THREEDVR_REVENUE_DELIVERY_ENABLED', 'THREEDVR_CRM_PROJECTION_ENABLED',
  ];
  const original = names.map(name => process.env[name]);
  process.env.THREEDVR_REVENUE_LEDGER_FILE = active;
  process.env.THREEDVR_INBOX_STATE_FILE = inboxFile;
  process.env.THREEDVR_REVENUE_DELIVERY_ENABLED = 'true';
  delete process.env.THREEDVR_CRM_PROJECTION_ENABLED;
  try {
    await assert.rejects(run('missing-scratch', { isolated: true }), /scratch ledgerFile/);
    await assert.rejects(run('same-ledger', { crm: { isolated: true }, ledgerFile: active }), /active ledger/);
    await assert.rejects(run('outside-scratch', { isolated: true, ledgerFile: path.join(process.cwd(), 'ledger.sqlite') }), /temporary subdirectory/);
    const symlink = path.join(scratchDir, 'alias.sqlite');
    fs.symlinkSync(active, symlink);
    await assert.rejects(run('symlink', { isolated: true, ledgerFile: symlink }), /symlink/);
    assert.equal(fs.existsSync(active), false, 'rejected isolated runs must not create the live ledger');
    const first = await run('scratch-canary', { crm: { isolated: true }, ledgerFile: scratch });
    assert.equal(first.status, 'failed', 'disabled CRM must not count as an isolated acceptance success');
    const summary = JSON.parse(first.summary_json);
    assert.match(summary.error, /CRM projection is disabled/);
    assert.equal(summary.inbox.skipped, true, 'isolated acceptance must not parse the host inbox');
    assert.equal(summary.delivery.disabled, true);
    assert.equal(summary.delivery.sends, 0);
    assert.equal(fs.existsSync(active), false, 'isolated canary must not create the host ledger');
    assert.equal(fs.existsSync(scratch), true, 'test state must be stored separately');
    const replay = await run('scratch-canary', { crm: { isolated: true }, ledgerFile: scratch });
    assert.equal(replay.replayed, true);
    assert.equal(replay.status, 'failed');
  } finally {
    names.forEach((name, index) => {
      if (original[index] === undefined) delete process.env[name];
      else process.env[name] = original[index];
    });
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(scratchDir, { recursive: true, force: true });
  }
});

test('isolated CRM acceptance needs a real scratch event and labels acknowledgement as not readback', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-worker-acceptance-'));
  const scratch = path.join(tmp, 'isolated.sqlite');
  const empty = path.join(tmp, 'empty.sqlite');
  const previous = process.env.THREEDVR_CRM_PROJECTION_ENABLED;
  process.env.THREEDVR_CRM_PROJECTION_ENABLED = 'true';
  let writeCalls = 0;
  const fakeWriter = async payload => {
    writeCalls += 1;
    return { records: payload.records.length, touches: payload.touches.length, errors: [] };
  };
  try {
    const emptyRun = await run('empty-acceptance', {
      isolated: true, ledgerFile: empty, crm: { isolated: true, write: fakeWriter }
    });
    assert.equal(emptyRun.status, 'failed');
    assert.match(JSON.parse(emptyRun.summary_json).error, /no acknowledged CRM projection/);
    assert.equal(writeCalls, 0, 'a scratch ledger with no queued CRM event cannot prove work');

    const db = openLedger({ filePath: scratch });
    try {
      const buyer = createProspect(db, {
        name: 'Synthetic Acceptance Buyer', contact: 'canary@example.test'
      }).prospect;
      transitionProspect(db, {
        prospectId: buyer.id, toState: 'verified', idempotencyKey: 'isolated-acceptance-verified'
      });
    } finally { db.close(); }

    const tested = await run('project-one-synthetic-event', {
      isolated: true, ledgerFile: scratch, crm: { isolated: true, write: fakeWriter }
    });
    assert.equal(tested.status, 'succeeded');
    const summary = JSON.parse(tested.summary_json);
    assert.equal(summary.crm.succeeded, 1);
    assert.equal(summary.crm.failed, 0);
    assert.equal(summary.delivery.sends, 0);
    assert.equal(summary.verification.crmWriteAcknowledged, true);
    assert.equal(summary.verification.independentCrmReadbackVerified, false);
    assert.equal(summary.verification.hostedWorkerVerified, false);
    assert.equal(writeCalls, 1, 'synthetic writer was invoked once; no real CRM was contacted');
    const replay = await run('project-one-synthetic-event', {
      isolated: true, ledgerFile: scratch, crm: { isolated: true, write: fakeWriter }
    });
    assert.equal(replay.replayed, true);
    assert.equal(writeCalls, 1);
  } finally {
    if (previous === undefined) delete process.env.THREEDVR_CRM_PROJECTION_ENABLED;
    else process.env.THREEDVR_CRM_PROJECTION_ENABLED = previous;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('isolated CRM acceptance rejects a partially projected scratch batch', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-worker-partial-crm-'));
  const ledgerFile = path.join(tmp, 'partial.sqlite');
  const original = process.env.THREEDVR_CRM_PROJECTION_ENABLED;
  process.env.THREEDVR_CRM_PROJECTION_ENABLED = 'true';
  let acknowledged = 0;
  const fakeWriter = async payload => {
    acknowledged += 1;
    return { records: payload.records.length, touches: payload.touches.length, errors: [] };
  };
  try {
    const db = openLedger({ filePath: ledgerFile });
    try {
      for (const suffix of ['alpha', 'beta']) {
        const prospect = createProspect(db, {
          name: `Synthetic ${suffix}`, contact: `${suffix}@example.test`
        }).prospect;
        transitionProspect(db, {
          prospectId: prospect.id, toState: 'verified',
          idempotencyKey: `partial-acceptance-${suffix}`
        });
      }
    } finally { db.close(); }

    const partial = await run('partial-scratch-batch', {
      isolated: true, ledgerFile, crm: { isolated: true, write: fakeWriter, limit: 1 }
    });
    assert.equal(partial.status, 'failed', 'one acknowledged write is not a complete acceptance');
    const report = JSON.parse(partial.summary_json);
    assert.equal(report.crm.succeeded, 1);
    assert.equal(report.crm.failed, 0);
    assert.equal(report.delivery.sends, 0);
    assert.match(report.error, /1 unresolved CRM projection/);
    const inspection = openLedger({ filePath: ledgerFile });
    try {
      assert.equal(inspection.prepare("SELECT COUNT(*) AS n FROM projection_outbox WHERE status <> 'succeeded'").get().n, 1);
    } finally { inspection.close(); }
    assert.equal(acknowledged, 1, 'only a synthetic writer was invoked');

    const resumed = await run('remaining-scratch-batch', {
      isolated: true, ledgerFile, crm: { isolated: true, write: fakeWriter, limit: 1 }
    });
    assert.equal(resumed.status, 'succeeded', 'a later test may pass after all scratch rows are acknowledged');
    const complete = JSON.parse(resumed.summary_json);
    assert.equal(complete.verification.independentCrmReadbackVerified, false);
    assert.equal(complete.verification.hostedWorkerVerified, false);
    assert.equal(complete.delivery.sends, 0);
    assert.equal(acknowledged, 2);
  } finally {
    if (original === undefined) delete process.env.THREEDVR_CRM_PROJECTION_ENABLED;
    else process.env.THREEDVR_CRM_PROJECTION_ENABLED = original;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('isolated scratch ledger rejects hard links to host data', async () => {
  const hostDir = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-worker-host-hardlink-'));
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-worker-scratch-hardlink-'));
  const hostLedger = path.join(hostDir, 'revenue-ledger.sqlite');
  const linkedScratch = path.join(scratchDir, 'scratch-ledger.sqlite');
  const previous = process.env.THREEDVR_REVENUE_LEDGER_FILE;
  try {
    fs.writeFileSync(hostLedger, 'host-ledger-sentinel');
    fs.linkSync(hostLedger, linkedScratch);
    process.env.THREEDVR_REVENUE_LEDGER_FILE = hostLedger;
    await assert.rejects(
      run('isolated-hardlink-rejected', { isolated: true, ledgerFile: linkedScratch }),
      /hard.link/i,
      'an alternate filename for the live ledger must not enter SQLite'
    );
    assert.equal(fs.readFileSync(hostLedger, 'utf8'), 'host-ledger-sentinel');
    assert.equal(fs.readFileSync(linkedScratch, 'utf8'), 'host-ledger-sentinel');
  } finally {
    if (previous === undefined) delete process.env.THREEDVR_REVENUE_LEDGER_FILE;
    else process.env.THREEDVR_REVENUE_LEDGER_FILE = previous;
    fs.rmSync(hostDir, { recursive: true, force: true });
    fs.rmSync(scratchDir, { recursive: true, force: true });
  }
});

test('isolated revenue acceptance refuses delivery even if host delivery is enabled', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-worker-isolated-'));
  const candidateFile = path.join(tmp, 'candidate.json');
  candidate(candidateFile);
  const previous = {
    candidate: process.env.THREEDVR_REVENUE_CANDIDATE_FILE,
    delivery: process.env.THREEDVR_REVENUE_DELIVERY_ENABLED,
  };
  process.env.THREEDVR_REVENUE_CANDIDATE_FILE = candidateFile;
  process.env.THREEDVR_REVENUE_DELIVERY_ENABLED = 'true';
  let calls = 0;
  const neverReadDb = { prepare() { throw new Error('DB touched before isolated no-send guard'); } };
  try {
    for (const flags of [{ isolated: true }, { crm: { isolated: true } }]) {
      const result = await deliverCandidate(neverReadDb, {
        ...flags,
        send: async () => {
          calls += 1;
          throw new Error('sender invoked in isolated mode');
        },
      });
      assert.equal(result.attempted, 0);
      assert.equal(result.sends, 0);
      assert.equal(result.disabled, true);
      assert.match(result.reason, /isolated acceptance forbids outbound/);
    }
    assert.equal(calls, 0, 'isolated acceptance must never call a real sender');
  } finally {
    for (const [name, value] of [
      ['THREEDVR_REVENUE_CANDIDATE_FILE', previous.candidate],
      ['THREEDVR_REVENUE_DELIVERY_ENABLED', previous.delivery],
    ]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('worker sends one canonical candidate and does not resend it', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-worker-send-'));
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
    const first = await run('send-1', { send: async () => { calls += 1; return { acknowledged: true, messageId: 'm1', transport: 'test' }; } });
    const second = await run('send-2', { send: async () => { calls += 1; return { acknowledged: true, messageId: 'm2', transport: 'test' }; } });
    assert.equal(JSON.parse(first.summary_json).sends, 1);
    assert.equal(JSON.parse(second.summary_json).sends, 0);
    assert.equal(calls, 1);
    const db = openLedger({ filePath: ledger });
    try { assert.equal(db.prepare("SELECT state FROM prospects").get().state, 'sent'); } finally { db.close(); }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      const env = { ledger: 'THREEDVR_REVENUE_LEDGER_FILE', candidate: 'THREEDVR_REVENUE_CANDIDATE_FILE', delivery: 'THREEDVR_REVENUE_DELIVERY_ENABLED' }[key];
      if (value === undefined) delete process.env[env]; else process.env[env] = value;
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('worker records sender failure without claiming a send', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-worker-fail-'));
  const previous = {
    ledger: process.env.THREEDVR_REVENUE_LEDGER_FILE,
    candidate: process.env.THREEDVR_REVENUE_CANDIDATE_FILE,
    delivery: process.env.THREEDVR_REVENUE_DELIVERY_ENABLED,
  };
  const candidateFile = path.join(tmp, 'candidate.json');
  candidate(candidateFile);
  process.env.THREEDVR_REVENUE_LEDGER_FILE = path.join(tmp, 'ledger.sqlite');
  process.env.THREEDVR_REVENUE_CANDIDATE_FILE = candidateFile;
  process.env.THREEDVR_REVENUE_DELIVERY_ENABLED = 'true';
  try {
    const result = await run('fail-1', { send: async () => { throw new Error('sender timeout'); } });
    const summary = JSON.parse(result.summary_json);
    assert.equal(result.status, 'failed');
    assert.equal(summary.sends, 0);
    assert.match(summary.delivery.error, /timeout/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      const env = { ledger: 'THREEDVR_REVENUE_LEDGER_FILE', candidate: 'THREEDVR_REVENUE_CANDIDATE_FILE', delivery: 'THREEDVR_REVENUE_DELIVERY_ENABLED' }[key];
      if (value === undefined) delete process.env[env]; else process.env[env] = value;
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('worker enforces the default one-send daily quota', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-worker-quota-'));
  const previous = {
    ledger: process.env.THREEDVR_REVENUE_LEDGER_FILE,
    candidate: process.env.THREEDVR_REVENUE_CANDIDATE_FILE,
    delivery: process.env.THREEDVR_REVENUE_DELIVERY_ENABLED,
  };
  const candidateFile = path.join(tmp, 'candidate.json');
  candidate(candidateFile);
  process.env.THREEDVR_REVENUE_LEDGER_FILE = path.join(tmp, 'ledger.sqlite');
  process.env.THREEDVR_REVENUE_CANDIDATE_FILE = candidateFile;
  process.env.THREEDVR_REVENUE_DELIVERY_ENABLED = 'true';
  let calls = 0;
  try {
    await run('quota-1', { send: async () => { calls += 1; return { acknowledged: true, messageId: 'quota-msg-1', transport: 'test' }; } });
    const data = JSON.parse(fs.readFileSync(candidateFile, 'utf8'));
    fs.writeFileSync(candidateFile, JSON.stringify({ ...data, name: 'Beta', contact: 'owner@beta.test', sourceUrl: 'https://beta.test', attemptId: 'canary-2' }));
    const second = await run('quota-2', { send: async () => { calls += 1; return { acknowledged: true, messageId: 'quota-msg-2', transport: 'test' }; } });
    assert.equal(calls, 1);
    assert.equal(JSON.parse(second.summary_json).delivery.reason, 'quota exhausted');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      const env = { ledger: 'THREEDVR_REVENUE_LEDGER_FILE', candidate: 'THREEDVR_REVENUE_CANDIDATE_FILE', delivery: 'THREEDVR_REVENUE_DELIVERY_ENABLED' }[key];
      if (value === undefined) delete process.env[env]; else process.env[env] = value;
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});


test('worker quarantines timeout when candidate uses a new attempt ID', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-worker-quarantine-'));
  const names = ['THREEDVR_REVENUE_LEDGER_FILE', 'THREEDVR_REVENUE_CANDIDATE_FILE', 'THREEDVR_REVENUE_DELIVERY_ENABLED'];
  const original = names.map(name => process.env[name]);
  const ledger = path.join(tmp, 'ledger.sqlite');
  const candidateFile = path.join(tmp, 'candidate.json');
  candidate(candidateFile);
  process.env.THREEDVR_REVENUE_LEDGER_FILE = ledger;
  process.env.THREEDVR_REVENUE_CANDIDATE_FILE = candidateFile;
  process.env.THREEDVR_REVENUE_DELIVERY_ENABLED = 'true';
  let sends = 0;
  try {
    const first = await run('quarantine-1', { send: async () => {
      sends += 1;
      throw new Error('timeout after uncertain transport acceptance');
    } });
    assert.equal(first.status, 'failed');
    const data = JSON.parse(fs.readFileSync(candidateFile, 'utf8'));
    fs.writeFileSync(candidateFile, JSON.stringify({ ...data, attemptId: 'new-attempt-id' }));
    const second = await run('quarantine-2', { send: async () => {
      sends += 1;
      return { acknowledged: true, messageId: 'must-not-send', transport: 'test' };
    } });
    const summary = JSON.parse(second.summary_json);
    assert.equal(second.status, 'failed', 'quarantine must be surfaced as a blocker');
    assert.equal(sends, 1, 'new attempt ID must not re-contact an uncertain delivery');
    assert.equal(summary.delivery.attempted, 0);
    assert.match(summary.delivery.reason, /prior delivery attempt.*manual reconciliation/);
    const db = openLedger({ filePath: ledger });
    try {
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM delivery_attempts').get().n, 1);
      assert.equal(db.prepare('SELECT state FROM prospects').get().state, 'failed');
    } finally { db.close(); }
  } finally {
    names.forEach((name, i) => {
      if (original[i] === undefined) delete process.env[name]; else process.env[name] = original[i];
    });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});


test('worker persists preflight failures instead of stranding running triggers', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-worker-preflight-'));
  const names = [
    'THREEDVR_REVENUE_LEDGER_FILE', 'THREEDVR_REVENUE_CANDIDATE_FILE',
    'THREEDVR_REVENUE_DELIVERY_ENABLED', 'THREEDVR_CRM_PROJECTION_ENABLED',
  ];
  const original = names.map(name => process.env[name]);
  const ledger = path.join(tmp, 'ledger.sqlite');
  const candidateFile = path.join(tmp, 'candidate.json');
  process.env.THREEDVR_REVENUE_LEDGER_FILE = ledger;
  process.env.THREEDVR_REVENUE_CANDIDATE_FILE = candidateFile;
  process.env.THREEDVR_REVENUE_DELIVERY_ENABLED = 'true';
  delete process.env.THREEDVR_CRM_PROJECTION_ENABLED;
  fs.writeFileSync(candidateFile, '{not-valid-json');
  let sends = 0;
  try {
    const first = await run('invalid-candidate', { send: async () => {
      sends += 1;
      throw new Error('unexpected send');
    } });
    const summary = JSON.parse(first.summary_json);
    assert.equal(first.status, 'failed');
    assert.match(summary.error, /JSON|position|property|token/i);
    assert.equal(summary.sends, undefined, 'unknown send totals must not be fabricated');
    assert.equal(sends, 0);
    const replay = await run('invalid-candidate');
    assert.equal(replay.replayed, true);
    assert.equal(replay.status, 'failed');
    assert.equal(replay.finished_at !== '', true);

    // Invalid isolated CRM configuration must also yield a durable failed
    // no-send result; validation happens before any Gun connection.
    delete process.env.THREEDVR_REVENUE_DELIVERY_ENABLED;
    process.env.THREEDVR_CRM_PROJECTION_ENABLED = 'true';
    const isolatedLedger = path.join(tmp, 'isolated-ledger.sqlite');
    const isolated = await run('invalid-isolated-relay', { crm: { isolated: true }, ledgerFile: isolatedLedger });
    assert.equal(isolated.status, 'failed');
    const isolatedSummary = JSON.parse(isolated.summary_json);
    assert.match(isolatedSummary.error, /isolated CRM relay/i);
    assert.equal(isolatedSummary.sends, 0);
    assert.equal(isolatedSummary.delivery.disabled, true);
    const isolatedDb = openLedger({ filePath: isolatedLedger });
    try { assert.equal(isolatedDb.prepare("SELECT COUNT(*) AS n FROM revenue_runs WHERE status = 'failed'").get().n, 1); }
    finally { isolatedDb.close(); }

    const db = openLedger({ filePath: ledger });
    try {
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM revenue_runs WHERE status = 'running'").get().count, 0);
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM revenue_runs WHERE status = 'failed'").get().count, 1);
    } finally { db.close(); }
  } finally {
    names.forEach((name, i) => {
      if (original[i] === undefined) delete process.env[name]; else process.env[name] = original[i];
    });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('worker rejects malformed delivery quotas before reading candidate or ledger', async () => {
  const names = ['THREEDVR_REVENUE_DELIVERY_ENABLED', 'THREEDVR_REVENUE_DAILY_SEND_LIMIT',
    'THREEDVR_REVENUE_CAMPAIGN_SEND_LIMIT', 'THREEDVR_REVENUE_CANDIDATE_FILE'];
  const original = names.map(name => process.env[name]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-worker-invalid-quota-'));
  const candidateFile = path.join(tmp, 'invalid.json');
  fs.writeFileSync(candidateFile, '{invalid-json');
  process.env.THREEDVR_REVENUE_DELIVERY_ENABLED = 'true';
  process.env.THREEDVR_REVENUE_CANDIDATE_FILE = candidateFile;
  const neverReadDb = { prepare() { throw new Error('ledger read before quota guard'); } };
  try {
    for (const key of names.slice(1, 3)) {
      for (const value of ['bogus', '2oops', '', ' ', '-1', '1.5', '1e3', '9007199254740992']) {
        process.env.THREEDVR_REVENUE_DAILY_SEND_LIMIT = '1';
        process.env.THREEDVR_REVENUE_CAMPAIGN_SEND_LIMIT = '10';
        process.env[key] = value;
        const result = await deliverCandidate(neverReadDb, {
          send: async () => { throw new Error('sender called before quota guard'); },
        });
        assert.equal(result.attempted, 0);
        assert.equal(result.sends, 0);
        assert.equal(result.disabled, true);
        assert.match(result.error, /nonnegative safe integers/);
      }
    }
  } finally {
    names.forEach((name, i) => {
      if (original[i] === undefined) delete process.env[name]; else process.env[name] = original[i];
    });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});


test('isolated worker imports exact private Operator queue row before no-send CRM projection', async () => {
  const { writeTask } = require('../thomas-agent/node/task-queue-sqlite-store');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-operator-import-'));
  const queueDb = path.join(tmp, 'queue.sqlite');
  const ledgerFile = path.join(tmp, 'ledger.sqlite');
  const ownerAlias = 'synthetic-owner';
  const taskId = 'operator-http-' + 'a'.repeat(24) + '-abcdefghijkl';
  const requestDigest = 'b'.repeat(64);
  const workerDeviceId = 'synthetic-worker';
  const sourceUrl = 'https://example.com/jobs/1';
  const name = 'Synthetic buyer';
  const env = ['THREEDVR_CRM_PROJECTION_ENABLED', 'THREEDVR_REVENUE_DELIVERY_ENABLED'];
  const old = env.map(key => process.env[key]);
  env.forEach(key => { process.env[key] = 'true'; });
  let writes = 0;
  let sends = 0;
  try {
    writeTask({ id: taskId, status: 'completed', backend: 'codex', unsafe: false,
      operatorRequestDigest: requestDigest, workerDeviceId, resultTruncated: false,
      startedAt: '2026-01-01T00:01:00Z', completedAt: '2026-01-01T00:02:00Z',
      updatedAt: '2026-01-01T00:02:00Z',
      resultText: JSON.stringify({ name, sourceUrl, summary: 'Synthetic workflow need' }),
    }, { queueDb, ownerAlias, queueSource: 'operator-http' });
    const queueBefore = fs.readFileSync(queueDb);
    const options = {
      isolated: true, ledgerFile,
      operatorCandidate: { queueDb, ownerAlias,
        expected: { taskId, requestDigest, workerDeviceId, requestedAt: '2026-01-01T00:00:00Z' },
        verifiedSource: { name, url: sourceUrl, evidence: 'Independent synthetic fixture' },
      },
      send: async () => { sends++; throw new Error('unexpected send'); },
      crm: { isolated: true, write: async payload => {
        writes++;
        assert.equal(payload.records[0].sourceUrl, sourceUrl);
        assert.equal(payload.records[0].canonicalState, 'verified');
        assert.equal(payload.records[0].status, 'Lead');
        assert.equal(payload.touches[0].touchType, 'operator_candidate_verified');
        assert.equal(JSON.stringify(payload).includes(taskId), false);
        assert.equal(JSON.stringify(payload).includes(workerDeviceId), false);
        return { records: 1, touches: 1, errors: [] };
      } },
    };
    await assert.rejects(run('not-isolated', {
      operatorCandidate: options.operatorCandidate,
    }), /restricted to isolated/);
    const wrong = await run('wrong-owner', { ...options, operatorCandidate: {
      ...options.operatorCandidate, ownerAlias: 'wrong-owner',
    } });
    assert.equal(wrong.status, 'failed');
    assert.match(JSON.parse(wrong.summary_json).error, /task not found/);
    const forged = await run('wrong-digest', { ...options, operatorCandidate: {
      ...options.operatorCandidate, expected: {
        ...options.operatorCandidate.expected, requestDigest: 'c'.repeat(64),
      },
    } });
    assert.equal(forged.status, 'failed');
    assert.match(JSON.parse(forged.summary_json).error, /Unverified private task completion/);
    assert.equal(writes, 0);
    const result = await run('import-real-scratch-row', options);
    assert.equal(result.status, 'succeeded');
    const summary = JSON.parse(result.summary_json);
    assert.equal(summary.delivery.sends, 0);
    assert.equal(summary.crm.succeeded, 1);
    assert.equal(summary.verification.hostedWorkerVerified, false);
    assert.equal(summary.verification.independentCrmReadbackVerified, false);
    assert.equal((await run('import-real-scratch-row', options)).replayed, true);
    // A different trigger with the same signed task must not generate a new
    // event or CRM write; no new acknowledgement means this run is incomplete.
    const duplicate = await run('import-duplicate-task', options);
    assert.equal(duplicate.status, 'failed');
    assert.match(JSON.parse(duplicate.summary_json).error, /no acknowledged CRM projection/);
    assert.equal(writes, 1);
    assert.equal(sends, 0);
    assert.deepEqual(fs.readFileSync(queueDb), queueBefore);
    const db = openLedger({ filePath: ledgerFile });
    try {
      assert.deepEqual(['prospects', 'revenue_events', 'projection_outbox', 'delivery_attempts']
        .map(table => db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n), [1, 1, 1, 0]);
      assert.equal(JSON.parse(db.prepare('SELECT payload_json FROM revenue_events').get().payload_json).taskId, taskId);
    } finally { db.close(); }
  } finally {
    env.forEach((key, i) => { if (old[i] === undefined) delete process.env[key]; else process.env[key] = old[i]; });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('default worker preserves unsent candidates while message approval adapter is unavailable', async () => {
  const names = ['THREEDVR_REVENUE_DELIVERY_ENABLED', 'THREEDVR_REVENUE_CANDIDATE_FILE',
    'THREEDVR_REVENUE_DAILY_SEND_LIMIT', 'THREEDVR_REVENUE_CAMPAIGN_SEND_LIMIT'];
  const previous = names.map(name => process.env[name]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-worker-approval-'));
  const candidateFile = path.join(tmp, 'candidate.json');
  process.env.THREEDVR_REVENUE_DELIVERY_ENABLED = 'true';
  process.env.THREEDVR_REVENUE_CANDIDATE_FILE = candidateFile;
  process.env.THREEDVR_REVENUE_DAILY_SEND_LIMIT = '1';
  process.env.THREEDVR_REVENUE_CAMPAIGN_SEND_LIMIT = '10';
  const db = openLedger({ filePath: ':memory:' });
  try {
    candidate(candidateFile);
    const first = await deliverCandidate(db);
    assert.equal(first.disabled, true);
    assert.equal(first.attempted, 0);
    assert.equal(first.sends, 0);
    assert.match(first.reason, /message-specific approval/);
    for (const table of ['prospects', 'revenue_events', 'delivery_attempts', 'projection_outbox']) {
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n, 0);
    }
    // A blocked transport should return before even reading candidate or ledger.
    fs.writeFileSync(candidateFile, '{invalid-json');
    const neverReadDb = { prepare() { throw new Error('unexpected ledger access'); } };
    assert.deepEqual(await deliverCandidate(neverReadDb), first);
  } finally {
    db.close();
    names.forEach((name, i) => {
      if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i];
    });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
