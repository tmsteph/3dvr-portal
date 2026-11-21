const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createProspect, openLedger, reserveDeliveryAttempt, transitionProspect } = require('../thomas-agent/node/revenue-ledger');
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

test('restart with an in-flight attempt quarantines ambiguity without resending', async () => {
  const value = fixture();
  try {
    reserveDeliveryAttempt(value.db, { prospectId: value.prospect.id, attemptId: 'a3' });
    let calls = 0;
    const result = await deliverProspect(value.db, { prospectId: value.prospect.id, attemptId: 'a3' }, async () => {
      calls += 1;
      return { acknowledged: true };
    });
    assert.equal(calls, 0);
    assert.equal(result.prospect.state, 'eligible');
    assert.match(result.error, /ambiguous/);
  } finally { value.close(); }
});

test('delivery attempt key cannot be reused for a different prospect', async () => {
  const value = fixture();
  try {
    const other = createProspect(value.db, { name: 'Second lead', contact: 'other@example.test' }).prospect;
    transitionProspect(value.db, { prospectId: other.id, toState: 'verified', idempotencyKey: 'other:v' });
    transitionProspect(value.db, { prospectId: other.id, toState: 'eligible', idempotencyKey: 'other:e' });

    const first = reserveDeliveryAttempt(value.db, { prospectId: value.prospect.id, attemptId: 'shared-attempt' });
    assert.equal(first.replayed, false);
    assert.equal(reserveDeliveryAttempt(value.db, { prospectId: value.prospect.id, attemptId: 'shared-attempt' }).replayed, true);

    let calls = 0;
    await assert.rejects(
      deliverProspect(value.db, { prospectId: other.id, attemptId: 'shared-attempt' }, async () => {
        calls++;
        return { acknowledged: true, messageId: 'wrong-recipient', transport: 'test' };
      }),
      /Delivery attempt key conflicts/,
    );
    assert.equal(calls, 0, 'the conflicting request must not invoke any sender');
    assert.equal(value.db.prepare('SELECT COUNT(*) AS n FROM delivery_attempts').get().n, 1);
    assert.equal(value.db.prepare('SELECT prospect_id FROM delivery_attempts WHERE attempt_key=?')
      .get('shared-attempt').prospect_id, value.prospect.id);
    assert.equal(value.db.prepare('SELECT state FROM prospects WHERE id=?').get(other.id).state, 'eligible');
  } finally { value.close(); }
});

test('direct delivery refuses suppressed or unqualified leads before reserving or invoking a sender', async () => {
  const value = fixture();
  try {
    const neverVerified = createProspect(value.db, { name: 'Unverified', contact: 'not-ready@example.test' }).prospect;
    transitionProspect(value.db, {
      prospectId: value.prospect.id, toState: 'suppressed', idempotencyKey: 'suppressed:do-not-send'
    });
    let calls = 0;
    for (const [prospectId, attemptId] of [
      [neverVerified.id, 'unverified-send'],
      [value.prospect.id, 'suppressed-send'],
      ['missing-prospect', 'missing-send'],
    ]) {
      await assert.rejects(
        deliverProspect(value.db, { prospectId, attemptId }, async () => { calls++; }),
        /must be eligible/,
      );
    }
    assert.equal(calls, 0, 'no sender may run for an ineligible prospect');
    assert.equal(value.db.prepare('SELECT COUNT(*) AS n FROM delivery_attempts').get().n, 0,
      'rejected requests must not reserve misleading attempts');
  } finally { value.close(); }
});

test('direct delivery requires reconciliation after another attempt but permits exact-key replay', async () => {
  const value = fixture();
  try {
    reserveDeliveryAttempt(value.db, { prospectId: value.prospect.id, attemptId: 'original-attempt' });
    let calls = 0;
    await assert.rejects(
      deliverProspect(value.db, { prospectId: value.prospect.id, attemptId: 'new-attempt' },
        async () => { calls++; }),
      /Prior delivery attempt requires manual reconciliation/,
    );
    assert.equal(calls, 0);
    assert.equal(value.db.prepare('SELECT COUNT(*) AS n FROM delivery_attempts').get().n, 1);
    const replay = await deliverProspect(value.db, {
      prospectId: value.prospect.id, attemptId: 'original-attempt'
    }, async () => { calls++; });
    assert.equal(replay.replayed, true);
    assert.match(replay.error, /ambiguous/);
    assert.equal(calls, 0, 'exact-key replay must not resend');
  } finally { value.close(); }
});

test('delivery receipts without an attributable provider message do not mark a prospect sent', async () => {
  const invalidReceipts = [
    { label: 'boolean-only acknowledgement', receipt: { acknowledged: true } },
    { label: 'missing message ID', receipt: { acknowledged: true, transport: 'test' } },
    { label: 'blank message ID', receipt: { acknowledged: true, messageId: '  ', transport: 'test' } },
    { label: 'missing transport', receipt: { acknowledged: true, messageId: 'provider-message-1' } },
    { label: 'blank transport', receipt: { acknowledged: true, messageId: 'provider-message-1', transport: '  ' } },
    { label: 'negative acknowledgement', receipt: { acknowledged: false, messageId: 'provider-message-1', transport: 'test' } },
  ];
  for (const { label, receipt } of invalidReceipts) {
    const value = fixture();
    try {
      let calls = 0;
      const first = await deliverProspect(
        value.db,
        { prospectId: value.prospect.id, attemptId: 'ambiguous-ack' },
        async () => { calls++; return receipt; }
      );
      assert.equal(first.prospect.state, 'failed', label);
      assert.match(first.error, /attributable delivery acknowledgement/, label);
      assert.equal(value.db.prepare("SELECT status FROM delivery_attempts WHERE attempt_key='ambiguous-ack'").get().status, 'failed', label);
      assert.equal(value.db.prepare("SELECT COUNT(*) AS n FROM revenue_events WHERE type='delivery_acknowledged'").get().n, 0, label);
      const retry = await deliverProspect(
        value.db,
        { prospectId: value.prospect.id, attemptId: 'ambiguous-ack' },
        async () => { calls++; throw Error('unexpected resend'); }
      );
      assert.equal(retry.replayed, true, label);
      assert.equal(calls, 1, label + ': retry must not invoke transport');
    } finally { value.close(); }
  }
});
