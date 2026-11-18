const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { acknowledgedDeliveryCount, createProspect, findProspectByContact, finishDeliveryAttempt, finishProjection, openLedger, pendingProjections, reserveDeliveryAttempt, startRun, finishRun, importProspectState, transitionProspect } = require('../thomas-agent/node/revenue-ledger');

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
  assert.equal(finishProjection(db, { id: queued[0].id, status: 'failed', error: 'timeout' }).attempts, 1);
  assert.equal(finishProjection(db, { id: queued[0].id, status: 'succeeded' }).attempts, 2);
  assert.equal(pendingProjections(db).length, 0);
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
  const input = { prospectId: alice.id, toState: 'verified', idempotencyKey: 'shared:verify' };
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
  const input = { prospectId: alice.id, toState: 'drafted', idempotencyKey: 'shared:import' };
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
    () => transitionProspect(db, { ...input }),
    /Idempotency key conflicts/,
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM revenue_events').get().n, 1);
  assert.equal(pendingProjections(db).length, 1);
  assert.equal(db.prepare('SELECT state FROM prospects WHERE id=?').get(bob.id).state, 'prospect');
}));
