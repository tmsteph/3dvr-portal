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
    { id: 'payment-event', type: 'payment_succeeded', created_at: '2026-08-13T20:00:00Z', payload_json: JSON.stringify({ payment: { amount_cents: 2000, currency: 'usd', paid_at: '2026-08-13T20:00:00Z', recurring_cents: 2000, plan: 'starter', payment_intent_id: 'pi_example', subscription_id: 'sub_example', status: 'succeeded' } }) },
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

test('CRM refuses paid status for ordinary transitions with payment-shaped metadata', () => {
  const prospect = { name: 'Example', contact: 'info@example.test', source_url: '', state: 'replied', campaign_id: '', created_at: '2026-01-01T00:00:00Z' };
  const payload = { payment: { amount_cents: 2000, currency: 'usd', plan: 'starter', payment_intent_id: 'pi_example' } };
  const record = recordFor(prospect, {
    id: 'ordinary-transition', type: 'state_transition', payload_json: JSON.stringify(payload)
  }, '2026-01-02T00:00:00Z');
  assert.equal(record.status, 'Warm - Discovery');
  assert.equal(record.lastPaymentAmountCents, undefined);
  assert.doesNotMatch(record.lastSignal, /Successful payment/);
});

test('CRM refuses payment success without a positive settled amount and provider receipt', () => {
  const prospect = { name: 'Example', contact: 'info@example.test', source_url: '', state: 'replied', campaign_id: '', created_at: '2026-01-01T00:00:00Z' };
  const scenarios = [
    { amount_cents: 2000, plan: 'starter' },
    { amount_cents: 2000, payment_intent_id: 'pi_example' }, // absent status must fail closed
    { amount_cents: 2000, payment_intent_id: 'pi_example', status: '' },
    { amount_cents: 2000, payment_intent_id: 'pi_example', status: 'processing' },
    { amount_cents: 2000, payment_intent_id: 'pi_example', status: 'refunded' },
    { amount_cents: 0, payment_intent_id: 'pi_example' },
    { amount_cents: -100, payment_intent_id: 'pi_example' },
    { amount_cents: 2000.5, payment_intent_id: 'pi_example' },
    { amount_cents: 2000, payment_intent_id: 'pi_example', status: 'pending' },
    { amount_cents: 2000, payment_intent_id: 'pi_example', status: 'failed' },
    { plan: 'starter', subscription_id: 'sub_example' }
  ];
  for (const [index, payment] of scenarios.entries()) {
    const record = recordFor(prospect, {
      id: `invalid-payment-${index}`, type: 'payment_succeeded', payload_json: JSON.stringify({ payment })
    }, '2026-01-02T00:00:00Z');
    assert.equal(record.status, 'Warm - Discovery', `scenario ${index}`);
    assert.equal(record.lastPaymentAmountCents, undefined, `scenario ${index}`);
  }
});

test('CRM accepts explicit paid payment status only with positive amount and provider reference', () => {
  const prospect = { name: 'Example', contact: 'info@example.test', source_url: '', state: 'replied', campaign_id: '', created_at: '2026-01-01T00:00:00Z' };
  for (const status of ['paid', 'succeeded', 'PAID']) {
    const record = recordFor(prospect, {
      id: 'valid-payment-' + status, type: 'payment_succeeded',
      payload_json: JSON.stringify({ payment: { amount_cents: 2000, payment_intent_id: 'pi_example', status } })
    }, '2026-01-02T00:00:00Z');
    assert.equal(record.status, 'Paid Customer', status);
  }
});

test('remote projection roots do not initialize a local radata store', () => {
  const source = fs.readFileSync(require.resolve('../thomas-agent/node/revenue-crm-projection'), 'utf8');
  assert.match(source, /axe:\s*false/);
  assert.match(source, /rad:\s*false/);
  assert.match(source, /radisk:\s*false/);
  assert.match(source, /stats:\s*false/);
});
