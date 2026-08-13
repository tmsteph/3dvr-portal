const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createProspect, openLedger, startRun, finishRun, transitionProspect } = require('../thomas-agent/node/revenue-ledger');

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

test('ledger prevents invalid send transitions and records one run per trigger', () => withLedger((db) => {
  const prospect = createProspect(db, { name: 'Acme', contact: 'mailto:info@acme.test' }).prospect;
  assert.throws(() => transitionProspect(db, { prospectId: prospect.id, toState: 'sent', idempotencyKey: 'send:acme' }), /Invalid transition/);
  const run = startRun(db, { triggerId: 'cron:123', releaseSha: 'abc123' });
  assert.equal(startRun(db, { triggerId: 'cron:123', releaseSha: 'abc123' }).replayed, true);
  assert.equal(finishRun(db, { runId: run.run.id, status: 'succeeded', summary: { sends: 0 } }).status, 'succeeded');
}));
