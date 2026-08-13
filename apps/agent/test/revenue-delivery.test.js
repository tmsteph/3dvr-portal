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
  const prospect = createProspect(db, { name: 'Acme', contact: 'info@acme.test' }).prospect;
  transitionProspect(db, { prospectId: prospect.id, toState: 'verified', idempotencyKey: 'v' });
  transitionProspect(db, { prospectId: prospect.id, toState: 'eligible', idempotencyKey: 'e' });
  return { db, prospect, close: () => { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); } };
}

test('sender acknowledgement is required before sent state', async () => {
  const value = fixture();
  try {
    const result = await deliverProspect(value.db, { prospectId: value.prospect.id, attemptId: 'a1' }, async () => ({ acknowledged: true, messageId: 'm1', transport: 'test' }));
    assert.equal(result.prospect.state, 'sent');
  } finally { value.close(); }
});

test('sender timeout deterministically records failed without claiming sent', async () => {
  const value = fixture();
  try {
    const result = await deliverProspect(value.db, { prospectId: value.prospect.id, attemptId: 'a2' }, async () => { throw new Error('sender timeout'); });
    assert.equal(result.prospect.state, 'failed');
    assert.match(result.error, /timeout/);
  } finally { value.close(); }
});
