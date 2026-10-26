const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { acknowledgedDeliveryCount, createProspect, findProspectByContact, finishDeliveryAttempt, finishProjection, importProspectState, openLedger, pendingProjections, reserveDeliveryAttempt, startRun, finishRun, transitionProspect } = require('../thomas-agent/node/revenue-ledger');

function withLedger(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-ledger-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try { fn(db); } finally { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
}

test('ledger deduplicates prospects and idempotent transitions', () => withLedger((db) => {
  const first = createProspect(db, { name: 'Acme', contact: 'mailto:info@acme.test', sourceUrl: 'https://acme.test' });
  const second = createProspect(db, { name: 'Acme again', contact: 'mailto:info@acme.test' });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  const verified = transitionProspect(db, { prospectId: first.prospect.id, toState: 'verified', idempotencyKey: 'verify:acme' });
  const replay = transitionProspect(db, { prospectId: first.prospect.id, toState: 'verified', idempotencyKey: 'verify:acme' });
  assert.equal(verified.prospect.state, 'verified');
  assert.equal(replay.replayed, true);
}));

test('email identity deduplicates mailto, bare address, and case variants', () => withLedger((db) => {
  const first = createProspect(db, { name: 'Example', contact: 'mailto:HELLO@EXAMPLE.test' });
  const second = createProspect(db, { name: 'Example again', contact: 'hello@example.test' });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.prospect.id, first.prospect.id);
  assert.equal(findProspectByContact(db, 'mailto:hello@example.test').id, first.prospect.id);
  assert.equal(findProspectByContact(db, 'HELLO@EXAMPLE.TEST').id, first.prospect.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM prospects').get().total, 1);
}));

test('email identity reuses historical mailto keys without migrating records', () => withLedger((db) => {
  const old = createProspect(db, { name: 'Legacy', contact: 'mailto:legacy@example.test' }).prospect;
  db.prepare('UPDATE prospects SET contact_key = ? WHERE id = ?')
    .run('contact:mailto:legacy@example.test', old.id);
  const replay = createProspect(db, { name: 'Legacy again', contact: 'LEGACY@EXAMPLE.TEST' });
  assert.equal(replay.created, false);
  assert.equal(replay.prospect.id, old.id);
  assert.equal(findProspectByContact(db, 'mailto:legacy@example.test').id, old.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM prospects').get().total, 1);
}));

test('state transitions atomically queue idempotent CRM projections', () => withLedger((db) => {
  const prospect = createProspect(db, { name: 'Acme', contact: 'info@acme.test' }).prospect;
  transitionProspect(db, { prospectId: prospect.id, toState: 'verified', idempotencyKey: 'verify:projection' });
  const queued = pendingProjections(db);
  assert.equal(queued.length, 1);
  assert.equal(JSON.parse(queued[0].payload_json).state, 'verified');
  assert.equal(finishProjection(db, { id: queued[0].id, status: 'failed', error: 'timeout' }).attempts, 1);
  assert.equal(finishProjection(db, { id: queued[0].id, status: 'succeeded' }).attempts, 2);
  assert.equal(pendingProjections(db).length, 0);
}));

test('successful CRM projection is terminal even if a stale worker reports failure', () => withLedger((db) => {
  const prospect = createProspect(db, { name: 'Synthetic CRM', contact: 'crm-terminal@example.test' }).prospect;
  transitionProspect(db, { prospectId: prospect.id, toState: 'verified', idempotencyKey: 'crm-terminal:verified' });
  const [projection] = pendingProjections(db);
  const completed = finishProjection(db, { id: projection.id, status: 'succeeded' });
  assert.equal(completed.status, 'succeeded');
  assert.equal(completed.attempts, 1);
  for (const status of ['failed', 'succeeded']) {
    assert.throws(() => finishProjection(db, { id: projection.id, status, error: 'stale worker' }),
      /already succeeded/);
  }
  const after = db.prepare('SELECT status, attempts, last_error FROM projection_outbox WHERE id = ?').get(projection.id);
  assert.deepEqual({ ...after }, { status: 'succeeded', attempts: 1, last_error: '' });
  assert.equal(pendingProjections(db).length, 0, 'completed CRM writes must not be replayed');
}));

test('ledger prevents invalid send transitions and records one run per trigger', () => withLedger((db) => {
  const prospect = createProspect(db, { name: 'Acme', contact: 'mailto:info@acme.test' }).prospect;
  assert.throws(() => transitionProspect(db, { prospectId: prospect.id, toState: 'sent', idempotencyKey: 'send:acme' }), /Invalid transition/);
  const run = startRun(db, { triggerId: 'cron:123', releaseSha: 'abc123' });
  assert.equal(startRun(db, { triggerId: 'cron:123', releaseSha: 'abc123' }).replayed, true);
  assert.equal(finishRun(db, { runId: run.run.id, status: 'succeeded', summary: { sends: 0 } }).status, 'succeeded');
}));

test('two revenue schedulers racing on one trigger run the business loop only once', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-trigger-race-'));
  const filePath = path.join(tmp, 'ledger.sqlite');
  const dbA = openLedger({ filePath });
  const dbB = openLedger({ filePath });
  try {
    let competingRun;
    let interleaved = false;
    // Simulate the other scheduler winning between a stale SELECT and INSERT.
    // The old read-then-insert code threw SQLITE_CONSTRAINT_UNIQUE here.
    const racingDb = {
      prepare(sql) {
        if (!interleaved && /^INSERT(?: OR IGNORE)? INTO revenue_runs/.test(sql)) {
          interleaved = true;
          competingRun = startRun(dbB, { triggerId: 'cron:race', releaseSha: 'winner' });
        }
        return dbA.prepare(sql);
      },
    };
    const loser = startRun(racingDb, { triggerId: 'cron:race', releaseSha: 'loser' });
    assert.equal(interleaved, true);
    assert.equal(competingRun.replayed, false);
    assert.equal(loser.replayed, true);
    assert.equal(loser.run.id, competingRun.run.id);
    assert.equal(loser.run.status, 'running', 'duplicate trigger remains blocked pending original run');
    assert.equal(dbA.prepare('SELECT COUNT(*) AS total FROM revenue_runs').get().total, 1);
    assert.equal(dbA.prepare('SELECT release_sha FROM revenue_runs').get().release_sha, 'winner');
  } finally {
    dbA.close();
    dbB.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('ledger idempotency rejects cross-prospect, state, type and payload collisions', () => withLedger((db) => {
  const a = createProspect(db, { name: 'Synthetic A', contact: 'a@example.test' }).prospect;
  const b = createProspect(db, { name: 'Synthetic B', contact: 'b@example.test' }).prospect;
  const request = {
    prospectId: a.id, toState: 'verified', type: 'candidate_verified',
    idempotencyKey: 'synthetic:shared-key', payload: { source: 'public', count: 1 }
  };
  const original = transitionProspect(db, request);
  const replay = transitionProspect(db, { ...request, payload: { count: 1, source: 'public' } });
  assert.equal(replay.replayed, true, 'equivalent payload with reordered keys is a valid replay');
  assert.equal(replay.event.id, original.event.id);
  for (const altered of [
    { prospectId: b.id },
    { toState: 'eligible' },
    { type: 'payment_succeeded' },
    { payload: { source: 'public', count: 2 } },
  ]) {
    assert.throws(() => transitionProspect(db, { ...request, ...altered }), /Idempotency key collision/);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM revenue_events').get().total, 1);
  assert.equal(pendingProjections(db).length, 1);
  assert.equal(db.prepare('SELECT state FROM prospects WHERE id = ?').get(b.id).state, 'prospect');
}));

test('legacy import idempotency never returns a different prospect event', () => withLedger((db) => {
  const a = createProspect(db, { name: 'Import A', contact: 'import-a@example.test' }).prospect;
  const b = createProspect(db, { name: 'Import B', contact: 'import-b@example.test' }).prospect;
  const request = {
    prospectId: a.id, toState: 'verified',
    idempotencyKey: 'synthetic:import-key', payload: { source: 'legacy', row: 1 }
  };
  const imported = importProspectState(db, request);
  assert.equal(importProspectState(db, request).event.id, imported.event.id);
  assert.throws(() => importProspectState(db, { ...request, prospectId: b.id }), /Idempotency key collision/);
  assert.throws(() => importProspectState(db, { ...request, payload: { source: 'legacy', row: 2 } }), /Idempotency key collision/);
  assert.equal(db.prepare('SELECT state FROM prospects WHERE id = ?').get(b.id).state, 'prospect');
  assert.equal(pendingProjections(db).length, 1);
}));


test('delivery attempt idempotency cannot reuse another prospect\'s receipt', () => withLedger((db) => {
  const a = createProspect(db, { name: 'Delivery A', contact: 'delivery-a@example.test' }).prospect;
  const b = createProspect(db, { name: 'Delivery B', contact: 'delivery-b@example.test' }).prospect;
  const original = reserveDeliveryAttempt(db, { attemptId: 'synthetic:delivery-key', prospectId: a.id });
  assert.equal(original.replayed, false);
  const replay = reserveDeliveryAttempt(db, { attemptId: 'synthetic:delivery-key', prospectId: a.id });
  assert.equal(replay.replayed, true);
  assert.equal(replay.attempt.id, original.attempt.id);
  assert.throws(() => reserveDeliveryAttempt(db, {
    attemptId: 'synthetic:delivery-key', prospectId: b.id,
  }), /Delivery attempt key collision/);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM delivery_attempts').get().total, 1);
  assert.equal(db.prepare('SELECT prospect_id FROM delivery_attempts WHERE attempt_key = ?').get('synthetic:delivery-key').prospect_id, a.id);
}));

test('delivery ACKs require a nonempty transport receipt and empty historical ACKs do not count', () => withLedger((db) => {
  const prospect = createProspect(db, { name: 'Synthetic Receipt', contact: 'receipt@example.test' }).prospect;
  reserveDeliveryAttempt(db, { attemptId: 'synthetic:ack', prospectId: prospect.id });
  for (const input of [
    { messageId: '', transport: 'smtp' },
    { messageId: 'provider-123', transport: '' },
    { messageId: '  ', transport: 'smtp' },
    { messageId: 'provider-123', transport: '  ' },
  ]) {
    assert.throws(() => finishDeliveryAttempt(db, {
      attemptId: 'synthetic:ack', status: 'acknowledged', ...input,
    }), /requires messageId and transport/);
  }
  assert.equal(acknowledgedDeliveryCount(db), 0);
  assert.equal(db.prepare('SELECT status FROM delivery_attempts WHERE attempt_key = ?')
    .get('synthetic:ack').status, 'in_flight');
  finishDeliveryAttempt(db, {
    attemptId: 'synthetic:ack', status: 'acknowledged', messageId: 'provider-123', transport: 'smtp',
  });
  assert.equal(acknowledgedDeliveryCount(db), 1);
  // A legacy or corrupted ACK with no receipt must not inflate send counts.
  db.prepare('UPDATE delivery_attempts SET message_id = ? WHERE attempt_key = ?')
    .run('', 'synthetic:ack');
  assert.equal(acknowledgedDeliveryCount(db), 0);
  reserveDeliveryAttempt(db, { attemptId: 'synthetic:failed', prospectId: prospect.id });
  finishDeliveryAttempt(db, { attemptId: 'synthetic:failed', status: 'failed', error: 'synthetic timeout' });
  assert.equal(acknowledgedDeliveryCount(db), 0);
}));

test('provider receipt cannot acknowledge two attempts or inflate historical send counts', () => withLedger((db) => {
  const a = createProspect(db, { name: 'Receipt A', contact: 'receipt-a@example.test' }).prospect;
  const b = createProspect(db, { name: 'Receipt B', contact: 'receipt-b@example.test' }).prospect;
  reserveDeliveryAttempt(db, { attemptId: 'synthetic:provider-a', prospectId: a.id });
  reserveDeliveryAttempt(db, { attemptId: 'synthetic:provider-b', prospectId: b.id });
  finishDeliveryAttempt(db, { attemptId: 'synthetic:provider-a', status: 'acknowledged',
    messageId: 'same-provider-id', transport: 'smtp' });
  assert.throws(() => finishDeliveryAttempt(db, { attemptId: 'synthetic:provider-b',
    status: 'acknowledged', messageId: 'same-provider-id', transport: 'smtp' }),
    /provider receipt collision/);
  assert.equal(db.prepare('SELECT status FROM delivery_attempts WHERE attempt_key = ?')
    .get('synthetic:provider-b').status, 'in_flight');
  assert.equal(acknowledgedDeliveryCount(db), 1);
  // A historical duplicate ACK imported before this guard must not inflate
  // delivery metrics. This is a synthetic row, not a real send.
  db.prepare(`UPDATE delivery_attempts SET status = 'acknowledged',
    message_id = 'same-provider-id', transport = 'smtp'
    WHERE attempt_key = 'synthetic:provider-b'`).run();
  assert.equal(acknowledgedDeliveryCount(db), 1);
}));
