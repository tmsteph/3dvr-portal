const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createProspect, finishProjection, importProspectState, openLedger, pendingProjections, startRun, finishRun, transitionProspect } = require('../thomas-agent/node/revenue-ledger');

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
