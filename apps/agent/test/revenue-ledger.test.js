const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createProspect, finishProjection, openLedger, pendingProjections, startRun, finishRun, importProspectState, transitionProspect } = require('../thomas-agent/node/revenue-ledger');

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
    /Idempotency key conflicts/,
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM revenue_events').get().n, 1);
  assert.equal(pendingProjections(db).length, 1);
  assert.equal(db.prepare('SELECT state FROM prospects WHERE id=?').get(bob.id).state, 'prospect');
}));

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
