const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createProspect, openLedger, transitionProspect } = require('../thomas-agent/node/revenue-ledger');
const { deliverProspect } = require('../thomas-agent/node/revenue-delivery');

function fixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-delivery-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  const prospect = createProspect(db, { name: 'Synthetic Acme', contact: 'info@acme.test' }).prospect;
  transitionProspect(db, { prospectId: prospect.id, toState: 'verified', idempotencyKey: 'v' });
  transitionProspect(db, { prospectId: prospect.id, toState: 'eligible', idempotencyKey: 'e' });
  return { db, prospect, close: () => { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); } };
}

for (const [name, fields] of [
  ['direct helper call', {}],
  ['forged caller approval', { approved: true, approvalId: 'caller-controlled', humanCheckpoint: { status: 'approved' } }],
  ['reused attempt with forged receipt', { attemptId: 'repeat', receipt: { acknowledged: true, messageId: 'forged' } }],
]) {
  test(`legacy delivery rejects ${name} without invoking sender or mutating ledger`, async () => {
    const value = fixture();
    let sends = 0;
    try {
      const input = { prospectId: value.prospect.id, attemptId: 'repeat', ...fields };
      for (let i = 0; i < 2; i += 1) {
        await assert.rejects(deliverProspect(value.db, input, async () => {
          sends += 1;
          return { acknowledged: true, messageId: 'fake-provider-receipt', transport: 'test' };
        }), /Outbound delivery disabled.*authenticated per-message human approval/);
      }
      assert.equal(sends, 0);
      assert.equal(value.db.prepare('SELECT state FROM prospects WHERE id = ?').get(value.prospect.id).state, 'eligible');
      assert.equal(value.db.prepare('SELECT COUNT(*) AS n FROM delivery_attempts').get().n, 0);
      assert.equal(value.db.prepare('SELECT COUNT(*) AS n FROM revenue_events').get().n, 2);
    } finally { value.close(); }
  });
}
