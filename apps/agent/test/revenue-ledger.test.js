const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { acknowledgedDeliveryCount, createProspect, findProspectByContact, finishDeliveryAttempt, claimProjection, finishProjection, openLedger, pendingProjections, reserveDeliveryAttempt, startRun, finishRun, importProspectState, transitionProspect } = require('../thomas-agent/node/revenue-ledger');

function withLedger(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-ledger-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try { fn(db); } finally { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
}

test('buyer discovery rejects identity-free records without poisoning the CRM ledger', () => withLedger((db) => {
  assert.throws(() => createProspect(db, { name: 'Shared Agency' }), /contact route or source URL/);
  assert.throws(() => createProspect(db, { name: 'Shared Agency', contact: '  ', sourceUrl: '' }), /contact route or source URL/);
  assert.throws(() => createProspect(db, {}), /contact route or source URL/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM prospects').get().n, 0);

  const sourced = createProspect(db, { name: 'Shared Agency', sourceUrl: 'https://agency-a.example' });
  const distinct = createProspect(db, { name: 'Shared Agency', sourceUrl: 'https://agency-b.example' });
  const contactOnly = createProspect(db, { name: 'Owner', contact: 'owner@other.example' });
  assert.equal(sourced.created, true);
  assert.equal(distinct.created, true);
  assert.notEqual(sourced.prospect.id, distinct.prospect.id);
  assert.equal(contactOnly.created, true);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM prospects').get().n, 3);
}));

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

test('email and mailto aliases dedupe one real prospect without changing non-email contacts', () => withLedger((db) => {
  const plain = createProspect(db, {
    name: 'Synthetic Buyer', contact: 'BUYER@EXAMPLE.TEST', sourceUrl: 'https://example.test'
  });
  const mailto = createProspect(db, {
    name: 'Same Buyer', contact: 'mailto:buyer@example.test', sourceUrl: 'https://other.example.test'
  });
  assert.equal(plain.created, true);
  assert.equal(mailto.created, false);
  assert.equal(mailto.prospect.id, plain.prospect.id);
  assert.equal(plain.prospect.contact_key, 'contact:buyer@example.test');
  assert.equal(findProspectByContact(db, 'mailto:BUYER@example.test').id, plain.prospect.id);
  assert.equal(findProspectByContact(db, 'buyer@example.test').id, plain.prospect.id);
  assert.equal(db.prepare('SELECT count(*) AS n FROM prospects').get().n, 1);

  const web = createProspect(db, { name: 'Web Only', contact: 'https://example.test/contact' });
  assert.equal(web.prospect.contact_key, 'contact:https://example.test/contact');
  assert.equal(web.created, true);
}));

test('legacy mailto contact keys remain discoverable and cannot be inserted twice', () => withLedger((db) => {
  const old = createProspect(db, { name: 'Legacy Buyer', contact: 'mailto:legacy@example.test' }).prospect;
  // Emulate a row already stored by the older ledger before normalization.
  db.prepare('UPDATE prospects SET contact_key=? WHERE id=?')
    .run('contact:mailto:legacy@example.test', old.id);
  const replay = createProspect(db, {
    name: 'Duplicate Buyer', contact: 'legacy@example.test', sourceUrl: 'https://new.example.test'
  });
  assert.equal(replay.created, false);
  assert.equal(replay.prospect.id, old.id);
  assert.equal(findProspectByContact(db, 'legacy@example.test').id, old.id);
  assert.equal(findProspectByContact(db, 'mailto:legacy@example.test').id, old.id);
  assert.equal(db.prepare('SELECT count(*) AS n FROM prospects').get().n, 1);
}));

test('state transitions atomically queue idempotent CRM projections', () => withLedger((db) => {
  const prospect = createProspect(db, { name: 'Acme', contact: 'info@acme.test' }).prospect;
  transitionProspect(db, { prospectId: prospect.id, toState: 'verified', idempotencyKey: 'verify:projection' });
  const queued = pendingProjections(db);
  assert.equal(queued.length, 1);
  assert.equal(JSON.parse(queued[0].payload_json).state, 'verified');
  const firstClaim = claimProjection(db, { id: queued[0].id });
  assert.ok(firstClaim);
  assert.equal(finishProjection(db, {
    id: queued[0].id, status: 'failed', error: 'timeout', claimToken: firstClaim
  }).attempts, 1);
  const retryClaim = claimProjection(db, { id: queued[0].id });
  assert.ok(retryClaim);
  assert.equal(finishProjection(db, {
    id: queued[0].id, status: 'succeeded', claimToken: retryClaim
  }).attempts, 2);
  assert.equal(pendingProjections(db).length, 0);
}));

test('successful CRM outbox projection is terminal even when a stale retry reports failure', () => withLedger((db) => {
  const prospect = createProspect(db, { name: 'Safe Buyer', contact: 'safe@example.test' }).prospect;
  transitionProspect(db, { prospectId: prospect.id, toState: 'verified', idempotencyKey: 'terminal:verified' });
  const row = pendingProjections(db)[0];
  const claimToken = claimProjection(db, { id: row.id });
  assert.ok(claimToken);
  const success = finishProjection(db, { id: row.id, status: 'succeeded', claimToken });
  assert.equal(success.status, 'succeeded');
  assert.equal(success.attempts, 1);

  // Simulate a second worker finishing after the winning CRM acknowledgement.
  assert.throws(() => finishProjection(db, {
    id: row.id, status: 'failed', error: 'late timeout from concurrent attempt', claimToken
  }), /stale or missing/, 'late failure cannot settle without its expired claim');
  assert.throws(() => finishProjection(db, {
    id: row.id, status: 'succeeded', claimToken
  }), /stale or missing/, 'replaying a completed claim cannot settle again');
  const after = db.prepare('SELECT status, attempts, last_error FROM projection_outbox WHERE id = ?').get(row.id);
  assert.equal(after.status, 'succeeded');
  assert.equal(after.attempts, 1, 'late receipts cannot inflate the retry count');
  assert.equal(after.last_error, '', 'late failure cannot overwrite durable success');
  assert.equal(pendingProjections(db).length, 0, 'completed work must not be queued for replay');
  assert.throws(() => finishProjection(db, { id: 'missing', status: 'failed' }), /does not exist/);
}));

test('CRM outbox cannot be settled without the worker claim, even after a failed retry', () => withLedger((db) => {
  const prospect = createProspect(db, {
    name: 'No Unclaimed Success', contact: 'unclaimed@example.test'
  }).prospect;
  transitionProspect(db, {
    prospectId: prospect.id, toState: 'verified', idempotencyKey: 'unclaimed:verified'
  });
  const row = pendingProjections(db)[0];
  assert.throws(() => finishProjection(db, {
    id: row.id, status: 'succeeded'
  }), /stale or missing/, 'a tokenless adapter cannot forge a CRM acknowledgement');
  const owner = claimProjection(db, { id: row.id });
  assert.ok(owner);
  assert.throws(() => finishProjection(db, {
    id: row.id, status: 'succeeded'
  }), /stale or missing/, 'a second worker cannot finish work owned by the first');
  assert.throws(() => finishProjection(db, {
    id: row.id, status: 'failed', claimToken: 'forged-worker-claim'
  }), /stale or missing/, 'a forged token cannot invalidate the current worker');
  assert.equal(db.prepare('SELECT status, attempts FROM projection_outbox WHERE id = ?').get(row.id).status, 'pending');
  assert.equal(finishProjection(db, {
    id: row.id, status: 'failed', claimToken: owner, error: 'retry required'
  }).attempts, 1);
  assert.throws(() => finishProjection(db, {
    id: row.id, status: 'succeeded'
  }), /stale or missing/, 'failed rows cannot be marked successful without a new claim');
  assert.equal(db.prepare('SELECT status, attempts FROM projection_outbox WHERE id = ?').get(row.id).status, 'failed');
  const retry = claimProjection(db, { id: row.id });
  assert.ok(retry);
  assert.equal(finishProjection(db, {
    id: row.id, status: 'succeeded', claimToken: retry
  }).attempts, 2);
  assert.equal(pendingProjections(db).length, 0);
}));

test('expired CRM claim can be recovered without accepting the stale worker receipt', () => withLedger((db) => {
  const prospect = createProspect(db, {
    name: 'Synthetic Lease Recovery', contact: 'lease@example.test'
  }).prospect;
  transitionProspect(db, {
    prospectId: prospect.id, toState: 'verified', idempotencyKey: 'lease:verified'
  });
  const row = pendingProjections(db)[0];
  const first = claimProjection(db, { id: row.id });
  assert.ok(first);
  assert.equal(claimProjection(db, { id: row.id }), null, 'claim is exclusive');
  assert.equal(pendingProjections(db).length, 0, 'live lease hides the row');
  // Model the crash/expired lease using the scratch SQLite ledger; no timeouts,
  // remote relay, real CRM or external writer are involved.
  db.prepare('UPDATE projection_claims SET expires_at = ? WHERE projection_id = ?')
    .run('2000-01-01T00:00:00.000Z', row.id);
  const recovered = claimProjection(db, { id: row.id });
  assert.ok(recovered);
  assert.notEqual(recovered, first);
  assert.throws(() => finishProjection(db, {
    id: row.id, status: 'failed', error: 'late timeout', claimToken: first
  }), /stale or missing/);
  const saved = finishProjection(db, {
    id: row.id, status: 'succeeded', claimToken: recovered
  });
  assert.equal(saved.status, 'succeeded');
  assert.equal(saved.attempts, 1);
  assert.equal(pendingProjections(db).length, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM projection_claims').get().n, 0);
}));

test('ledger refuses unattributed acknowledged deliveries at the persistence boundary', () => withLedger((db) => {
  const prospect = createProspect(db, { name: 'Synthetic no-send', contact: 'synthetic@example.test' }).prospect;
  const malformed = [
    ['', 'test'], ['message-123', ''], ['  ', 'test'],
    ['message-123', '  '], [123, 'test'], ['message-123', 123],
  ];
  for (const [index, [messageId, transport]] of malformed.entries()) {
    const attemptId = `invalid-receipt-${index}`;
    reserveDeliveryAttempt(db, { attemptId, prospectId: prospect.id });
    assert.throws(
      () => finishDeliveryAttempt(db, { attemptId, status: 'acknowledged', messageId, transport }),
      /Acknowledged delivery requires messageId and transport/,
    );
    assert.equal(db.prepare('SELECT status FROM delivery_attempts WHERE attempt_key=?')
      .get(attemptId).status, 'in_flight');
  }
  assert.equal(acknowledgedDeliveryCount(db), 0, 'no malformed acknowledgement is counted as sent');
  const attemptId = 'valid-attributed-receipt';
  reserveDeliveryAttempt(db, { attemptId, prospectId: prospect.id });
  const saved = finishDeliveryAttempt(db, {
    attemptId, status: 'acknowledged', messageId: 'message-123', transport: 'test-provider',
  });
  assert.equal(saved.status, 'acknowledged');
  assert.equal(saved.message_id, 'message-123');
  assert.equal(saved.transport, 'test-provider');
  assert.equal(acknowledgedDeliveryCount(db), 1);
  assert.throws(() => finishDeliveryAttempt(db, {
    attemptId, status: 'acknowledged', messageId: 'message-123', transport: 'test-provider',
  }), /not in flight/);
  assert.equal(acknowledgedDeliveryCount(db), 1, 'replay must not double count a send');
}));

test('ledger prevents invalid send transitions and records one run per trigger', () => withLedger((db) => {
  const prospect = createProspect(db, { name: 'Acme', contact: 'mailto:info@acme.test' }).prospect;
  assert.throws(() => transitionProspect(db, { prospectId: prospect.id, toState: 'sent', idempotencyKey: 'send:acme' }), /Invalid transition/);
  const run = startRun(db, { triggerId: 'cron:123', releaseSha: 'abc123' });
  assert.equal(startRun(db, { triggerId: 'cron:123', releaseSha: 'abc123' }).replayed, true);
  assert.equal(finishRun(db, { runId: run.run.id, status: 'succeeded', summary: { sends: 0 } }).status, 'succeeded');
}));

test('an idempotency key cannot silently lose another prospect\'s event or change its meaning', () => withLedger((db) => {
  const alice = createProspect(db, { name: 'Alice', contact: 'alice@example.test' }).prospect;
  const bob = createProspect(db, { name: 'Bob', contact: 'bob@example.test' }).prospect;
  const input = { prospectId: alice.id, toState: 'verified', idempotencyKey: 'shared:verify', payload: { sourceUrl: 'https://original.example.test' } };
  const first = transitionProspect(db, input);
  assert.equal(transitionProspect(db, input).event.id, first.event.id);
  assert.throws(
    () => transitionProspect(db, { ...input, prospectId: bob.id }),
    /Idempotency key conflicts/,
  );
  assert.throws(
    () => transitionProspect(db, { ...input, toState: 'drafted' }),
    /Idempotency key conflicts/,
  );
  assert.throws(
    () => transitionProspect(db, { ...input, payload: { sourceUrl: 'https://different.example.test' } }),
    /Idempotency key conflicts/,
    'same key and stage must not silently suppress conflicting provenance',
  );
  assert.throws(
    () => transitionProspect(db, { ...input, payload: {} }),
    /Idempotency key conflicts/,
    'omitting original evidence must not be treated as a valid replay',
  );
  assert.throws(
    () => transitionProspect(db, { ...input, type: 'payment_succeeded' }),
    /verified provider adapter/,
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM revenue_events').get().n, 1);
  assert.equal(pendingProjections(db).length, 1);
  assert.equal(db.prepare('SELECT state FROM prospects WHERE id=?').get(bob.id).state, 'prospect');
}));

test('generic ledger cannot forge a paid-customer event without a verified payment adapter', () => withLedger((db) => {
  const prospect = createProspect(db, { name: 'Synthetic Buyer', contact: 'buyer@example.test' }).prospect;
  assert.throws(() => transitionProspect(db, {
    prospectId: prospect.id, toState: 'verified', type: 'payment_succeeded',
    idempotencyKey: 'forged:payment-success',
    payload: { payment: { status: 'succeeded', amount_cents: 50000, currency: 'USD' } }
  }), /verified provider adapter/);
  assert.equal(getProspectState(db, prospect.id), 'prospect');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM revenue_events').get().n, 0);
  assert.equal(pendingProjections(db).length, 0);
  // Ordinary research / qualification transitions remain usable.
  const verified = transitionProspect(db, {
    prospectId: prospect.id, toState: 'verified', idempotencyKey: 'verified:synthetic'
  });
  assert.equal(verified.event.type, 'state_transition');
  assert.equal(verified.prospect.state, 'verified');
  assert.equal(pendingProjections(db).length, 1);
}));

function getProspectState(db, id) {
  return db.prepare('SELECT state FROM prospects WHERE id=?').get(id).state;
}

test('legacy imports cannot replay a different lead or a normal transition', () => withLedger((db) => {
  const alice = createProspect(db, { name: 'Alice import', contact: 'alice-import@example.test' }).prospect;
  const bob = createProspect(db, { name: 'Bob import', contact: 'bob-import@example.test' }).prospect;
  const input = { prospectId: alice.id, toState: 'drafted', idempotencyKey: 'shared:import', payload: { sourceFile: 'legacy-first.csv' } };
  const first = importProspectState(db, input);
  assert.equal(importProspectState(db, input).event.id, first.event.id);
  assert.throws(
    () => importProspectState(db, { ...input, prospectId: bob.id }),
    /Idempotency key conflicts/,
  );
  assert.throws(
    () => importProspectState(db, { ...input, toState: 'eligible' }),
    /Idempotency key conflicts/,
  );
  assert.throws(
    () => importProspectState(db, { ...input, payload: { sourceFile: 'different-import.csv' } }),
    /Idempotency key conflicts/,
    'legacy import retries must preserve immutable source evidence',
  );
  assert.throws(
    () => importProspectState(db, { ...input, payload: {} }),
    /Idempotency key conflicts/,
  );
  assert.throws(
    () => transitionProspect(db, { ...input }),
    /Idempotency key conflicts/,
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM revenue_events').get().n, 1);
  assert.equal(pendingProjections(db).length, 1);
  assert.equal(db.prepare('SELECT state FROM prospects WHERE id=?').get(bob.id).state, 'prospect');
}));
