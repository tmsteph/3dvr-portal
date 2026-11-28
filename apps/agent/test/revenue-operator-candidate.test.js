const assert = require('node:assert/strict');
const { test } = require('node:test');
const { openLedger, createProspect, transitionProspect } = require('../thomas-agent/node/revenue-ledger');
const { recordOperatorCandidate, recordLocalCanaryCandidate } = require('../thomas-agent/node/revenue-operator-candidate');

function fixture(suffix = 'abcdefghijkl') {
  const taskId = 'operator-http-' + 'a'.repeat(24) + '-' + suffix;
  const requestDigest = 'b'.repeat(64);
  const name = 'Synthetic buyer';
  const url = 'https://example.com/jobs/1';
  return {
    row: { source: 'operator-http', status: 'completed', record: {
      id: taskId, status: 'completed', backend: 'codex', unsafe: false,
      workerDeviceId: 'synthetic-worker', operatorRequestDigest: requestDigest,
      startedAt: '2026-01-01T00:01:00Z', completedAt: '2026-01-01T00:02:00Z',
      resultTruncated: false, resultText: JSON.stringify({ name, sourceUrl: url, summary: 'Synthetic workflow need' }),
    } },
    expected: { taskId, requestDigest, workerDeviceId: 'synthetic-worker', requestedAt: '2026-01-01T00:00:00Z' },
    verifiedSource: { name, url, evidence: 'Synthetic listing verified by fixture' },
  };
}
function counts(db) {
  return ['prospects', 'revenue_events', 'projection_outbox', 'delivery_attempts']
    .map(table => db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n);
}

test('verified candidate binds private task to one event and one pending outbox row', () => {
  const db = openLedger({ filePath: ':memory:' });
  try {
    const input = fixture();
    const first = recordOperatorCandidate(db, input);
    assert.equal(first.prospect.state, 'verified');
    assert.equal(JSON.parse(first.event.payload_json).taskId, input.expected.taskId);
    assert.equal(JSON.parse(first.event.payload_json).workerDeviceId, input.expected.workerDeviceId);
    assert.deepEqual(counts(db), [1, 1, 1, 0]);
    assert.equal(recordOperatorCandidate(db, input).replayed, true);
    assert.deepEqual(counts(db), [1, 1, 1, 0]);
    const outbox = db.prepare('SELECT * FROM projection_outbox').get();
    assert.equal(outbox.event_id, first.event.id);
    assert.equal(outbox.status, 'pending');
    assert.equal(outbox.payload_json.includes(input.expected.taskId), false);
  } finally { db.close(); }
});

test('rejects forged completion, changed task, invalid chronology and model lifecycle claims before writes', () => {
  const db = openLedger({ filePath: ':memory:' });
  try {
    const mutations = [
      x => { x.row.source = 'legacy'; },
      x => { x.row.record.workerDeviceId = ''; },
      x => { x.row.record.workerDeviceId = ' \t\n '; },
      x => { x.row.record.workerDeviceId = 42; },
      x => { x.row.record.workerDeviceId = 'other-worker'; },
      x => { delete x.expected.workerDeviceId; },
      x => { x.expected.workerDeviceId = ' '; },
      x => { x.expected.workerDeviceId = 'synthetic-worker '; x.row.record.workerDeviceId = 'synthetic-worker '; },
      x => { x.row.record.error = 'worker failed'; },
      x => { x.row.record.resultTruncated = true; },
      x => { x.row.record.operatorRequestDigest = 'c'.repeat(64); },
      x => { x.row.record.completedAt = '2025-01-01T00:00:00Z'; },
      x => { x.row.record.completedAt = '2099-01-01T00:00:00Z'; },
      x => { x.row.record.resultText = JSON.stringify({ ...JSON.parse(x.row.record.resultText), paid: true }); },
      x => { x.row.record.resultText = JSON.stringify({ ...JSON.parse(x.row.record.resultText), approved: true }); },
      x => { x.verifiedSource.url = 'https://example.com/jobs/other'; },
      x => { x.verifiedSource.evidence = ''; },
    ];
    for (const mutate of mutations) {
      const input = fixture();
      mutate(input);
      assert.throws(() => recordOperatorCandidate(db, input));
      assert.deepEqual(counts(db), [0, 0, 0, 0]);
    }
  } finally { db.close(); }
});

test('conflicting replay creates no orphan and later task never rewinds an advanced prospect', () => {
  const db = openLedger({ filePath: ':memory:' });
  try {
    const input = fixture();
    const first = recordOperatorCandidate(db, input);
    const conflicting = fixture();
    conflicting.verifiedSource.url = 'https://example.com/jobs/2';
    conflicting.row.record.resultText = JSON.stringify({ ...JSON.parse(input.row.record.resultText),
      sourceUrl: conflicting.verifiedSource.url });
    assert.throws(() => recordOperatorCandidate(db, conflicting), /conflicts/);
    assert.deepEqual(counts(db), [1, 1, 1, 0]);
    transitionProspect(db, { prospectId: first.prospect.id, toState: 'drafted', idempotencyKey: 'synthetic-draft' });
    const second = recordOperatorCandidate(db, fixture('mnopqrstuvwx'));
    assert.equal(second.skipped, true);
    assert.equal(second.prospect.state, 'drafted');
    assert.equal(recordOperatorCandidate(db, input).prospect.state, 'drafted');
    assert.deepEqual(counts(db), [1, 2, 2, 0]);
  } finally { db.close(); }
});

test('local canary rejects hard-linked queue or ledger without importing any rows', () => {
  const fs = require('node:fs');
  const { tmpdir } = require('node:os');
  const { join } = require('node:path');
  const { DatabaseSync } = require('node:sqlite');
  for (const linked of ['queue.sqlite', 'ledger.sqlite', null]) {
    const dir = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'operator-local-signed-'));
    let db;
    try {
      const queuePath = join(dir, 'queue.sqlite');
      const ledgerPath = join(dir, 'ledger.sqlite');
      const input = fixture('operator-e2e-abcdefghijkl');
      input.row.record.backend = 'local-canary';
      input.verifiedSource.url = 'https://operator-canary.invalid/listing';
      input.row.record.resultText = JSON.stringify({
        name: input.verifiedSource.name, sourceUrl: input.verifiedSource.url, summary: 'Synthetic fixture'
      });
      const queue = new DatabaseSync(queuePath);
      try {
        queue.exec('CREATE TABLE tasks (owner_alias TEXT, id TEXT, source TEXT, status TEXT, record_json TEXT)');
        queue.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?)').run(
          'operator-e2e-test', input.expected.taskId, input.row.source, input.row.status, JSON.stringify(input.row.record));
      } finally { queue.close(); }
      db = openLedger({ filePath: ledgerPath });
      if (linked) fs.linkSync(join(dir, linked), join(dir, 'external-alias.sqlite'));
      const args = { scratchDir: dir, expected: input.expected, verifiedSource: input.verifiedSource, env: {
        OPERATOR_RUNTIME_E2E_RUN_AUTHORIZED: '1',
        OPERATOR_RUNTIME_E2E_LOCAL_MODEL_ENABLED: '1',
        OPERATOR_RUNTIME_E2E_EXPECTED_TASK_ID: input.expected.taskId,
        OPERATOR_RUNTIME_E2E_EXPECTED_REQUEST_DIGEST: input.expected.requestDigest,
        OPERATOR_RUNTIME_E2E_EXPECTED_WORKER_DEVICE_ID: input.expected.workerDeviceId,
        OPERATOR_RUNTIME_E2E_EXPECTED_OWNER_ALIAS: 'operator-e2e-test',
        OPERATOR_RUNTIME_E2E_EXPECTED_QUEUE_DB: queuePath
      } };
      if (linked) {
        assert.throws(() => recordLocalCanaryCandidate(db, args), /unlinked regular scratch databases/);
        assert.deepEqual(counts(db), [0, 0, 0, 0]);
      } else {
        assert.equal(recordLocalCanaryCandidate(db, args).prospect.state, 'verified');
        assert.deepEqual(counts(db), [1, 1, 1, 0]);
        assert.equal(recordLocalCanaryCandidate(db, args).replayed, true);
        assert.deepEqual(counts(db), [1, 1, 1, 0]);
      }
    } finally {
      db?.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('verified exact listing survives changed model label without duplicate or send', () => {
  const db = openLedger({ filePath: ':memory:' });
  try {
    const first = recordOperatorCandidate(db, fixture());
    const second = fixture('mnopqrstuvwx');
    second.verifiedSource.name = 'Different model label';
    second.row.record.resultText = JSON.stringify({
      ...JSON.parse(second.row.record.resultText), name: second.verifiedSource.name
    });
    const found = recordOperatorCandidate(db, second);
    assert.equal(found.skipped, true);
    assert.equal(found.prospect.id, first.prospect.id);
    assert.equal(found.prospect.contact_key, first.prospect.contact_key);
    assert.deepEqual(counts(db), [1, 1, 1, 0]);
    const distinct = fixture('abcdefghijklmn');
    distinct.verifiedSource.url = 'https://example.com/jobs/2';
    distinct.row.record.resultText = JSON.stringify({
      ...JSON.parse(distinct.row.record.resultText), sourceUrl: distinct.verifiedSource.url
    });
    assert.notEqual(recordOperatorCandidate(db, distinct).prospect.id, first.prospect.id);
    assert.deepEqual(counts(db), [2, 2, 2, 0]);
  } finally { db.close(); }
});

test('verified exact listing refuses historical ambiguity and case-fold collision', () => {
  const db = openLedger({ filePath: ':memory:' });
  try {
    const input = fixture();
    const campaignId = 'operator-research';
    createProspect(db, { name: 'Historical A', sourceUrl: input.verifiedSource.url, campaignId });
    createProspect(db, { name: 'Historical B', sourceUrl: input.verifiedSource.url, campaignId });
    assert.throws(() => recordOperatorCandidate(db, input), /Ambiguous existing listing identity/);
    assert.deepEqual(counts(db), [2, 0, 0, 0]);
    const caseInput = fixture('mnopqrstuvwx');
    caseInput.verifiedSource.url = 'https://example.com/Jobs/3';
    caseInput.row.record.resultText = JSON.stringify({
      ...JSON.parse(caseInput.row.record.resultText), sourceUrl: caseInput.verifiedSource.url
    });
    createProspect(db, { name: caseInput.verifiedSource.name, sourceUrl: 'https://example.com/jobs/3', campaignId });
    assert.throws(() => recordOperatorCandidate(db, caseInput), /Conflicting existing listing identity/);
    assert.deepEqual(counts(db), [3, 0, 0, 0]);
  } finally { db.close(); }
});
