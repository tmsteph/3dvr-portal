const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createProspect, openLedger, pendingProjections, transitionProspect } = require('../thomas-agent/node/revenue-ledger');
const { projectPendingCrm, recordFor } = require('../thomas-agent/node/revenue-crm-projection');
test('CRM projection quarantines an uncertain timeout rather than replaying a remote write', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-crm-projection-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const prospect = createProspect(db, { name: 'Acme', contact: 'info@acme.test' }).prospect;
    transitionProspect(db, { prospectId: prospect.id, toState: 'verified', idempotencyKey: 'crm-v' });
    const failed = await projectPendingCrm(db, { write: async () => ({ records: 0, touches: 0, errors: ['crm timeout'] }) });
    assert.equal(failed.failed, 1);
    const row = db.prepare('SELECT * FROM projection_outbox').get();
    assert.equal(row.status, 'failed');
    assert.equal(row.attempts, 1);
    assert.equal(db.prepare('SELECT status FROM projection_claims').get().status, 'needs_review');
    let replayed = false;
    const next = await projectPendingCrm(db, { write: async () => { replayed = true; throw Error('unexpected replay'); } });
    assert.equal(next.attempted, 0);
    assert.equal(replayed, false);
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

test('public forum prospects project without inventing an email address', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-public-prospect-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const prospect = createProspect(db, {
      name: 'Forum Builder',
      contact: '@forum-builder',
      sourceUrl: 'https://community.example/thread/123',
    }).prospect;
    transitionProspect(db, {
      prospectId: prospect.id, toState: 'verified',
      idempotencyKey: 'public-forum:verified',
      type: 'candidate_verified',
      payload: { sourceUrl: 'https://community.example/thread/123' },
    });
    const written = [];
    const projected = await projectPendingCrm(db, {
      write: async payload => {
        written.push(...payload.records);
        return { records: payload.records.length, touches: payload.touches.length, errors: [] };
      },
    });
    assert.equal(projected.succeeded, 1);
    assert.equal(written.length, 1);
    assert.equal(written[0].email, '', 'social handle is not a deliverable email');
    assert.equal(written[0].status, 'Lead');
    assert.equal(written[0].canonicalState, 'verified');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM delivery_attempts').get().n, 0);
  } finally { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('CRM email projection accepts actual addresses but rejects URL userinfo and handles', () => {
  const base = {
    name: 'Synthetic Buyer', source_url: 'https://community.example/thread',
    state: 'verified', campaign_id: '', created_at: '2026-01-01T00:00:00Z',
  };
  const event = { id: 'public-source-event', to_state: 'verified' };
  const project = contact => recordFor({ ...base, contact }, event, '2026-01-02T00:00:00Z');
  for (const contact of ['@forum-builder', 'u/forum-builder', 'https://user@community.example/thread', '']) {
    assert.equal(project(contact).email, '', contact || '(empty)');
  }
  assert.equal(project('mailto:owner@example.test').email, 'owner@example.test');
  assert.equal(project('OWNER@example.test').email, 'OWNER@example.test');
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

test('CRM retains an earlier valid payment through later nonpayment events without future leakage', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-paid-history-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const prospect = createProspect(db, { name: 'Synthetic buyer', contact: 'buyer@example.test' }).prospect;
    const before = transitionProspect(db, {
      prospectId: prospect.id, toState: 'verified', idempotencyKey: 'history-before'
    }).event;
    const paid = transitionProspect(db, {
      prospectId: prospect.id, toState: 'drafted', idempotencyKey: 'history-paid',
      type: 'payment_succeeded', payload: { payment: {
        amount_cents: 3500, currency: 'usd', payment_intent_id: 'pi_synthetic',
        status: 'succeeded'
      } }
    }).event;
    const after = transitionProspect(db, {
      prospectId: prospect.id, toState: 'eligible', idempotencyKey: 'history-after'
    }).event;
    const invalidLater = transitionProspect(db, {
      prospectId: prospect.id, toState: 'sent', idempotencyKey: 'history-invalid',
      type: 'payment_succeeded', payload: { payment: {
        amount_cents: 10000, payment_intent_id: 'pi_unsettled', status: 'pending'
      } }
    }).event;
    const records = [];
    const result = await projectPendingCrm(db, {
      write: async payload => { records.push(...payload.records); return { records: payload.records.length, touches: payload.touches.length, errors: [] }; }
    });
    assert.equal(result.succeeded, 4);
    assert.equal(result.failed, 0);
    const byEvent = new Map(records.map(record => [record.canonicalEventId, record]));
    assert.notEqual(byEvent.get(before.id).status, 'Paid Customer');
    for (const event of [paid, after, invalidLater]) {
      assert.equal(byEvent.get(event.id).status, 'Paid Customer');
      assert.equal(byEvent.get(event.id).lastPaymentAmountCents, 3500);
      assert.equal(byEvent.get(event.id).stripePaymentIntentId, 'pi_synthetic');
    }
  } finally { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('paid CRM record honors a later do-not-contact state', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-paid-optout-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const prospect = createProspect(db, { name: 'Synthetic opt-out', contact: 'optout@example.test' }).prospect;
    transitionProspect(db, {
      prospectId: prospect.id, toState: 'verified', idempotencyKey: 'optout-paid',
      type: 'payment_succeeded', payload: { payment: {
        amount_cents: 1000, payment_intent_id: 'pi_optout', status: 'succeeded'
      } }
    });
    transitionProspect(db, {
      prospectId: prospect.id, toState: 'suppressed', idempotencyKey: 'optout-suppressed'
    });
    const records = [];
    const result = await projectPendingCrm(db, {
      write: async payload => { records.push(...payload.records); return { records: payload.records.length, touches: payload.touches.length, errors: [] }; }
    });
    assert.equal(result.succeeded, 2);
    const latest = records.find(record => record.canonicalState === 'suppressed' && record.canonicalEventId);
    assert.ok(latest);
    assert.equal(latest.nextBestAction, 'Do not contact.');
    assert.equal(latest.status, 'Paid Customer');
  } finally { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('CRM outbox follows ledger event order despite colliding timestamps and reversed IDs', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-crm-order-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const prospect = createProspect(db, { name: 'Synthetic order', contact: 'order@example.test' }).prospect;
    const first = transitionProspect(db, { prospectId: prospect.id, toState: 'verified', idempotencyKey: 'order-first' }).event;
    const second = transitionProspect(db, { prospectId: prospect.id, toState: 'eligible', idempotencyKey: 'order-second' }).event;
    db.prepare('UPDATE projection_outbox SET created_at = ?').run('2026-01-01T00:00:00.000Z');
    db.prepare('UPDATE projection_outbox SET id = ? WHERE event_id = ?').run('z-first', first.id);
    db.prepare('UPDATE projection_outbox SET id = ? WHERE event_id = ?').run('a-second', second.id);
    assert.deepEqual(pendingProjections(db).map(row => row.event_id), [first.id, second.id]);
  } finally { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('CRM projection uses each event state, not a later prospect state', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-crm-historical-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const prospect = createProspect(db, { name: 'Synthetic history', contact: 'history@example.test' }).prospect;
    transitionProspect(db, { prospectId: prospect.id, toState: 'verified', idempotencyKey: 'historical-verified' });
    transitionProspect(db, { prospectId: prospect.id, toState: 'eligible', idempotencyKey: 'historical-eligible' });
    transitionProspect(db, { prospectId: prospect.id, toState: 'sent', idempotencyKey: 'historical-sent' });
    const records = [];
    const result = await projectPendingCrm(db, { write: async payload => {
      records.push(...payload.records);
      return { records: payload.records.length, touches: payload.touches.length, errors: [] };
    } });
    assert.equal(result.succeeded, 3);
    assert.deepEqual(records.map(record => record.canonicalState), ['verified', 'eligible', 'sent']);
    assert.deepEqual(records.map(record => record.status), ['Lead', 'Lead', 'Warm - Waiting']);
  } finally { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('CRM projection blocks later events after an ambiguous earlier write', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-crm-failure-barrier-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const prospect = createProspect(db, { name: 'Synthetic retry', contact: 'retry@example.test' }).prospect;
    transitionProspect(db, { prospectId: prospect.id, toState: 'verified', idempotencyKey: 'barrier-first' });
    transitionProspect(db, { prospectId: prospect.id, toState: 'eligible', idempotencyKey: 'barrier-second' });
    let writes = 0;
    const first = await projectPendingCrm(db, { write: async () => {
      writes += 1;
      return { errors: ['synthetic timeout'] };
    } });
    assert.equal(first.failed, 1);
    assert.equal(first.attempted, 1);
    assert.equal(first.blocked, 1);
    assert.equal(writes, 1);
    assert.equal(pendingProjections(db).length, 1, 'later pending event awaits reconciliation');
    const next = await projectPendingCrm(db, { write: async () => {
      writes += 1;
      return { records: 1, touches: 1, errors: [] };
    } });
    assert.equal(next.attempted, 0);
    assert.equal(next.blocked, 1);
    assert.equal(writes, 1, 'no later write until prior event reconciled');
  } finally { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('remote projection roots do not initialize a local radata store', () => {
  const source = fs.readFileSync(require.resolve('../thomas-agent/node/revenue-crm-projection'), 'utf8');
  assert.match(source, /axe:\s*false/);
  assert.match(source, /rad:\s*false/);
  assert.match(source, /radisk:\s*false/);
  assert.match(source, /stats:\s*false/);
});

test('CRM outbox quarantines missing and partial write ACKs without automatic replay', async () => {
  for (const response of [
    undefined, { errors: [] },
    { records: 1, touches: 0, errors: [] },
    { records: 0, touches: 1, errors: [] },
  ]) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-crm-ack-'));
    const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
    try {
      const prospect = createProspect(db, { name: 'Synthetic ACK', contact: 'ack@example.test' }).prospect;
      transitionProspect(db, { prospectId: prospect.id, toState: 'verified', idempotencyKey: 'ack-first' });
      const result = await projectPendingCrm(db, { write: async () => response });
      assert.equal(result.succeeded, 0);
      assert.equal(result.failed, 1);
      assert.equal(pendingProjections(db).length, 0);
      assert.equal(db.prepare('SELECT status FROM projection_claims').get().status, 'needs_review');
    } finally { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
  }
});

test('two concurrent SQLite workers reserve one CRM write and preserve event order', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-crm-concurrency-'));
  const filePath = path.join(tmp, 'ledger.sqlite');
  const dbA = openLedger({ filePath });
  const dbB = openLedger({ filePath });
  try {
    const prospect = createProspect(dbA, { name: 'Synthetic concurrent', contact: 'concurrent@example.test' }).prospect;
    transitionProspect(dbA, { prospectId: prospect.id, toState: 'verified', idempotencyKey: 'concurrent-first' });
    transitionProspect(dbA, { prospectId: prospect.id, toState: 'eligible', idempotencyKey: 'concurrent-second' });
    let releaseWrite;
    let notifyStarted;
    const started = new Promise(resolve => { notifyStarted = resolve; });
    const gate = new Promise(resolve => { releaseWrite = resolve; });
    let calls = 0;
    const first = projectPendingCrm(dbA, { limit: 1, write: async () => {
      calls += 1;
      notifyStarted();
      await gate;
      return { records: 1, touches: 1, errors: [] };
    } });
    await started;
    const second = await projectPendingCrm(dbB, { write: async () => {
      calls += 1;
      return { records: 1, touches: 1, errors: [] };
    } });
    assert.equal(second.attempted, 0);
    assert.equal(calls, 1);
    releaseWrite();
    const firstResult = await first;
    assert.equal(firstResult.succeeded, 1);
    assert.equal(dbA.prepare('SELECT COUNT(*) AS count FROM projection_claims WHERE status = ?').get('finished').count, 1);
    const third = await projectPendingCrm(dbB, { write: async () => {
      calls += 1;
      return { records: 1, touches: 1, errors: [] };
    } });
    assert.equal(third.succeeded, 1);
    assert.equal(calls, 2, 'one external call per ordered event');
  } finally { dbA.close(); dbB.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('expired CRM claim is not stolen or automatically replayed', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-crm-expired-'));
  const filePath = path.join(tmp, 'ledger.sqlite');
  const db = openLedger({ filePath });
  try {
    const prospect = createProspect(db, { name: 'Synthetic crash', contact: 'crash@example.test' }).prospect;
    transitionProspect(db, { prospectId: prospect.id, toState: 'verified', idempotencyKey: 'crash-first' });
    const { claimProjection, finishClaimedProjection } = require('../thomas-agent/node/revenue-ledger');
    const row = pendingProjections(db)[0];
    const claim = claimProjection(db, { id: row.id, leaseMs: 1 });
    assert.ok(claim);
    db.prepare('UPDATE projection_claims SET expires_at = ?').run('2000-01-01T00:00:00Z');
    assert.equal(claimProjection(db, { id: row.id }), null);
    assert.throws(() => finishClaimedProjection(db, { id: row.id, ownerToken: 'other', status: 'succeeded' }), /owned by another worker/);
    let called = false;
    const result = await projectPendingCrm(db, { write: async () => { called = true; } });
    assert.equal(result.attempted, 0);
    assert.equal(called, false);
  } finally { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});
