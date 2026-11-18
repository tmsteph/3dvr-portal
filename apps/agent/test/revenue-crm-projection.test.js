const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createProspect, openLedger, pendingProjections, transitionProspect } = require('../thomas-agent/node/revenue-ledger');
const { projectPendingCrm, recordFor } = require('../thomas-agent/node/revenue-crm-projection');
test('CRM projection retries a timeout and completes idempotently', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-crm-projection-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const prospect = createProspect(db, { name: 'Acme', contact: 'info@acme.test' }).prospect;
    transitionProspect(db, { prospectId: prospect.id, toState: 'verified', idempotencyKey: 'crm-v' });
    const failed = await projectPendingCrm(db, { write: async () => ({ records: 0, touches: 0, errors: ['crm timeout'] }) });
    assert.equal(failed.failed, 1);
    assert.equal(pendingProjections(db)[0].attempts, 1);
    const succeeded = await projectPendingCrm(db, { write: async payload => ({ records: payload.records.length, touches: payload.touches.length, errors: [] }) });
    assert.equal(succeeded.succeeded, 1);
    assert.equal(pendingProjections(db).length, 0);
  } finally { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('CRM projection preserves the legacy stable record identity while waiting quietly after contact', () => {
  const record = recordFor({ id: 'uuid', name: 'Acme', contact: 'mailto:info@acme.test', source_url: 'https://acme.test', state: 'sent', campaign_id: '', created_at: '2026-01-01T00:00:00Z' }, { id: 'event' }, '2026-01-02T00:00:00Z');
  assert.equal(record.id, 'agent-lead-info-acme-test');
  assert.equal(record.status, 'Warm - Waiting');
  assert.equal(record.nextBestAction, 'Wait for reply or a genuinely new material reason to contact. Do not schedule an automatic sales follow-up.');
  assert.equal(record.canonicalState, 'sent');
});

test('CRM projection turns a successful payment receipt into a paid-customer activation record', () => {
  const record = recordFor(
    { id: 'esai', name: 'Esai', contact: 'mailto:gamboaesai@gmail.com', source_url: '', state: 'replied', campaign_id: '', created_at: '2026-08-01T00:00:00Z' },
    { id: 'payment-event', type: 'payment_succeeded', created_at: '2026-08-13T20:00:00Z', payload_json: JSON.stringify({ payment: { status: 'succeeded', amount_cents: 2000, currency: 'usd', paid_at: '2026-08-13T20:00:00Z', recurring_cents: 2000, plan: 'starter', payment_intent_id: 'pi_example', subscription_id: 'sub_example' } }) },
    '2026-08-15T00:00:00Z'
  );
  assert.equal(record.status, 'Paid Customer');
  assert.equal(record.lastPaymentAmountCents, 2000);
  assert.equal(record.lastPaymentAmount, 'USD 20.00');
  assert.equal(record.recurringPlanValueCents, 2000);
  assert.equal(record.billingPlan, 'starter');
  assert.equal(record.stripePaymentIntentId, 'pi_example');
  assert.match(record.nextBestAction, /Activate the customer/);
  assert.match(record.nextBestAction, /Do not schedule a sales follow-up because payment occurred\.$/i);
});

test('CRM refuses false paid-customer projections from quotes, pending or invalid payments', () => {
  const prospect = {
    id: 'synthetic-lead', name: 'Synthetic Prospect', contact: 'test@example.test',
    source_url: 'https://example.test', state: 'replied', campaign_id: '', created_at: '2026-11-17T00:00:00Z'
  };
  const payment = { status: 'succeeded', amount_cents: 25000, currency: 'usd', payment_intent_id: 'pi_unverified' };
  const event = (type, value) => ({
    id: 'synthetic-event', type, payload_json: JSON.stringify({ payment: value })
  });
  const projected = (type, value) => recordFor(prospect, event(type, value), '2026-11-17T01:00:00Z');
  const quote = projected('proposal_quoted', payment);
  assert.equal(quote.status, 'Warm - Discovery');
  assert.equal(quote.lastPaymentAmountCents, undefined);
  assert.equal(projected('payment_succeeded', { ...payment, status: 'pending' }).status, 'Warm - Discovery');
  assert.equal(projected('payment_succeeded', { ...payment, amount_cents: 0 }).status, 'Warm - Discovery');
  assert.equal(projected('payment_succeeded', { ...payment, amount_cents: -1 }).status, 'Warm - Discovery');
  assert.equal(projected('payment_succeeded', { ...payment, amount_cents: 5.5 }).status, 'Warm - Discovery');
  assert.equal(projected('payment_succeeded', { ...payment, currency: '' }).status, 'Warm - Discovery');
  assert.equal(projected('payment_succeeded', { status: 'succeeded', plan: 'starter', payment_intent_id: 'pi_unverified' }).status, 'Warm - Discovery');
});

test('remote projection roots do not initialize a local radata store', () => {
  const source = fs.readFileSync(require.resolve('../thomas-agent/node/revenue-crm-projection'), 'utf8');
  assert.match(source, /axe:\s*false/);
  assert.match(source, /rad:\s*false/);
  assert.match(source, /radisk:\s*false/);
  assert.match(source, /stats:\s*false/);
});

test('revenue outbox stays pending if the real CRM writer receives no positive Gun acknowledgement', async () => {
  const { writeCrmSync } = require('../thomas-agent/node/crm-sync');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-crm-unacked-projection-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  const rootWithAck = (ack) => ({
    get() { return { put(_record, callback) { callback(ack); } }; }
  });
  try {
    const prospect = createProspect(db, {
      name: 'Synthetic No-Send Prospect',
      contact: 'synthetic@example.test',
      sourceUrl: 'https://example.test'
    }).prospect;
    transitionProspect(db, { prospectId: prospect.id, toState: 'verified', idempotencyKey: 'synthetic-verify' });

    const unacknowledgedRoot = rootWithAck({});
    const writeWithoutReceipt = payload => writeCrmSync(payload, {
      crmRoot: unacknowledgedRoot, touchRoot: unacknowledgedRoot, timeoutMs: 25
    });
    const failed = await projectPendingCrm(db, { write: writeWithoutReceipt });
    assert.equal(failed.succeeded, 0);
    assert.equal(failed.failed, 1);
    assert.equal(pendingProjections(db).length, 1, 'an unacknowledged write must remain retryable');

    const acknowledgedRoot = rootWithAck({ ok: true });
    const accepted = await projectPendingCrm(db, {
      write: payload => writeCrmSync(payload, {
        crmRoot: acknowledgedRoot, touchRoot: acknowledgedRoot, timeoutMs: 25
      })
    });
    assert.equal(accepted.succeeded, 1);
    assert.equal(accepted.failed, 0);
    assert.equal(pendingProjections(db).length, 0);
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CRM projection keeps its outbox retryable when an adapter omits or partially acknowledges writes', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-crm-incomplete-receipt-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const prospect = createProspect(db, {
      name: 'Synthetic Prospect - No Send', contact: 'local-only@example.test',
      sourceUrl: 'https://example.test/local-only'
    }).prospect;
    transitionProspect(db, { prospectId: prospect.id, toState: 'verified', idempotencyKey: 'crm-incomplete' });
    const incomplete = [
      undefined, null, {}, { records: 1, touches: 1 },
      { records: 0, touches: 1, errors: [] },
      { records: 1, touches: 0, errors: [] },
      { records: 2, touches: 1, errors: [] },
      { records: '1', touches: 1, errors: [] },
      { records: 1, touches: 1, errors: 'not-an-array' }
    ];
    for (const [index, reply] of incomplete.entries()) {
      const result = await projectPendingCrm(db, { write: async payload => {
        assert.equal(payload.records.length, 1);
        assert.equal(payload.touches.length, 1);
        return reply;
      } });
      assert.equal(result.succeeded, 0, 'no incomplete receipt may close the outbox');
      assert.equal(result.failed, 1);
      const pending = pendingProjections(db);
      assert.equal(pending.length, 1);
      assert.equal(pending[0].attempts, index + 1);
      assert.equal(pending[0].status, 'failed');
      assert.match(pending[0].last_error, /CRM projection/i);
    }
    const accepted = await projectPendingCrm(db, {
      write: async payload => ({ records: payload.records.length, touches: payload.touches.length, errors: [] })
    });
    assert.equal(accepted.succeeded, 1);
    assert.equal(accepted.failed, 0);
    assert.equal(pendingProjections(db).length, 0);
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
