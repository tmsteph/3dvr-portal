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

test('two SQLite CRM projection workers cannot write one outbox event concurrently', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-crm-claimed-'));
  const ledger = path.join(tmp, 'ledger.sqlite');
  const firstDb = openLedger({ filePath: ledger });
  const secondDb = openLedger({ filePath: ledger });
  let releaseWrite;
  const heldWrite = new Promise(resolve => { releaseWrite = resolve; });
  let markStarted;
  const writeStarted = new Promise(resolve => { markStarted = resolve; });
  let writeCount = 0;
  try {
    const prospect = createProspect(firstDb, {
      name: 'Synthetic Concurrency Buyer', contact: 'concurrent@example.test'
    }).prospect;
    transitionProspect(firstDb, {
      prospectId: prospect.id, toState: 'verified', idempotencyKey: 'crm-concurrent-verified'
    });
    const first = projectPendingCrm(firstDb, { write: async payload => {
      writeCount += 1;
      markStarted();
      await heldWrite;
      return { records: payload.records.length, touches: payload.touches.length, errors: [] };
    } });
    await writeStarted;
    assert.equal(pendingProjections(secondDb).length, 0,
      'a claimed in-flight row cannot consume another bounded worker batch');
    const second = await projectPendingCrm(secondDb, { write: async payload => {
      writeCount += 1;
      return { records: payload.records.length, touches: payload.touches.length, errors: [] };
    } });
    assert.deepEqual(second, { attempted: 0, succeeded: 0, failed: 0, errors: [] });
    assert.equal(writeCount, 1, 'only the lease holder may call the CRM writer');
    releaseWrite();
    const completed = await first;
    assert.equal(completed.succeeded, 1);
    assert.equal(pendingProjections(secondDb).length, 0);
    assert.equal(firstDb.prepare("SELECT status, attempts FROM projection_outbox").get().status, 'succeeded');
    assert.equal(firstDb.prepare("SELECT count(*) AS n FROM projection_claims").get().n, 0,
      'completed work releases its claim');
  } finally {
    releaseWrite();
    firstDb.close();
    secondDb.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CRM projection serializes different events for one buyer across SQLite workers', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-crm-same-buyer-'));
  const ledger = path.join(tmp, 'ledger.sqlite');
  const firstDb = openLedger({ filePath: ledger });
  const secondDb = openLedger({ filePath: ledger });
  let releaseWrite;
  const heldWrite = new Promise(resolve => { releaseWrite = resolve; });
  let signalStarted;
  const writeStarted = new Promise(resolve => { signalStarted = resolve; });
  const writes = [];
  try {
    const buyer = createProspect(firstDb, {
      name: 'Synthetic Opt Out', contact: 'optout@example.test'
    }).prospect;
    transitionProspect(firstDb, {
      prospectId: buyer.id, toState: 'verified', idempotencyKey: 'same-buyer-verified'
    });
    const first = projectPendingCrm(firstDb, { write: async payload => {
      writes.push(payload.records[0].canonicalState);
      signalStarted();
      await heldWrite;
      return { records: payload.records.length, touches: payload.touches.length, errors: [] };
    } });
    await writeStarted;

    // An opt-out event arrives while the earlier buyer write is still in flight.
    // A second worker must not project it concurrently and then risk having
    // the late prior write overwrite the Closed/Do not contact CRM state.
    transitionProspect(secondDb, {
      prospectId: buyer.id, toState: 'suppressed', idempotencyKey: 'same-buyer-suppressed'
    });
    assert.equal(pendingProjections(secondDb).length, 0,
      'a held buyer claim excludes every event for that buyer before LIMIT');
    const competing = await projectPendingCrm(secondDb, { write: async () => {
      throw new Error('concurrent same-buyer CRM write');
    } });
    assert.equal(competing.attempted, 0);

    releaseWrite();
    assert.equal((await first).succeeded, 1);
    const final = await projectPendingCrm(secondDb, { write: async payload => {
      writes.push(payload.records[0].canonicalState);
      assert.equal(payload.records[0].status, 'Closed');
      assert.equal(payload.records[0].nextBestAction, 'Do not contact.');
      return { records: payload.records.length, touches: payload.touches.length, errors: [] };
    } });
    assert.equal(final.succeeded, 1);
    assert.deepEqual(writes, ['verified', 'suppressed']);
    assert.equal(pendingProjections(firstDb).length, 0);
    assert.equal(firstDb.prepare('SELECT COUNT(*) AS total FROM projection_claims').get().total, 0);
  } finally {
    releaseWrite();
    firstDb.close();
    secondDb.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CRM outbox refuses cross-prospect event linkage before writing any mismatched record', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-crm-cross-lead-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const first = createProspect(db, { name: 'Synthetic North', contact: 'north@example.test' }).prospect;
    const second = createProspect(db, { name: 'Synthetic South', contact: 'south@example.test' }).prospect;
    const firstEvent = transitionProspect(db, {
      prospectId: first.id, toState: 'verified', idempotencyKey: 'cross-lead-north'
    }).event;
    transitionProspect(db, {
      prospectId: second.id, toState: 'verified', idempotencyKey: 'cross-lead-south'
    });
    // Both foreign keys still reference valid rows. Only their relationship is
    // corrupt, so schema FK enforcement alone cannot catch this attribution bug.
    db.prepare('UPDATE projection_outbox SET prospect_id=? WHERE event_id=?').run(second.id, firstEvent.id);
    const writes = [];
    const result = await projectPendingCrm(db, { write: async payload => {
      writes.push(payload);
      return { records: payload.records.length, touches: payload.touches.length, errors: [] };
    } });
    assert.equal(result.attempted, 2);
    assert.equal(result.succeeded, 1);
    assert.equal(result.failed, 1);
    assert.match(result.errors.join(' '), /identity mismatch/);
    assert.equal(writes.length, 1, 'mismatched event must never reach CRM writer');
    assert.equal(writes[0].records[0].email, 'south@example.test');
    assert.equal(writes[0].touches[0].contactName, 'Synthetic South');
    const corrupted = db.prepare('SELECT status,attempts FROM projection_outbox WHERE event_id=?').get(firstEvent.id);
    assert.equal(corrupted.status, 'failed', 'quarantine is retryable, never silently accepted');
    assert.equal(corrupted.attempts, 1);
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CRM projection quarantines two distinct ledger buyers sharing one legacy slug ID', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-crm-id-collision-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  try {
    const contacts = ['alice.smith@buyer.example.test', 'alice-smith@buyer.example.test'];
    for (const [i, contact] of contacts.entries()) {
      const prospect = createProspect(db, { name: 'Distinct Buyer ' + i, contact }).prospect;
      transitionProspect(db, {
        prospectId: prospect.id, toState: 'verified', idempotencyKey: 'collision:' + i
      });
    }
    const writes = [];
    const write = async payload => {
      writes.push(payload);
      return { records: payload.records.length, touches: payload.touches.length, errors: [] };
    };
    const blocked = await projectPendingCrm(db, { write });
    assert.equal(blocked.attempted, 2);
    assert.equal(blocked.failed, 2);
    assert.equal(blocked.succeeded, 0);
    assert.equal(writes.length, 0, 'neither distinct contact may overwrite the shared CRM slug');
    assert.equal(pendingProjections(db).length, 2, 'both outbox entries remain retryable');
    assert.ok(blocked.errors.every(error => /ID collision.*manual reconciliation/.test(error)));

    // Quarantine only the ambiguous identities; independent work keeps moving.
    const unrelated = createProspect(db, {
      name: 'Independent Buyer', contact: 'independent@buyer.example.test'
    }).prospect;
    transitionProspect(db, {
      prospectId: unrelated.id, toState: 'verified', idempotencyKey: 'independent:verified'
    });
    const retry = await projectPendingCrm(db, { write });
    assert.equal(retry.attempted, 3);
    assert.equal(retry.failed, 2);
    assert.equal(retry.succeeded, 1);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].records[0].email, 'independent@buyer.example.test');
    assert.equal(pendingProjections(db).length, 2);
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('bounded CRM projection does not starve fresh leads behind quarantined failures', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-crm-retry-fairness-'));
  const db = openLedger({ filePath: path.join(tmp, 'ledger.sqlite') });
  const writes = [];
  const write = async payload => {
    writes.push(payload.records[0].email);
    return { records: payload.records.length, touches: payload.touches.length, errors: [] };
  };
  try {
    // These are distinct buyers, but their legacy CRM IDs collide. Once
    // quarantined, retrying them must not block a healthy third buyer.
    for (const [i, contact] of [
      'alice.smith@buyer.example.test', 'alice-smith@buyer.example.test'
    ].entries()) {
      const buyer = createProspect(db, { name: 'Collision ' + i, contact }).prospect;
      transitionProspect(db, {
        prospectId: buyer.id, toState: 'verified', idempotencyKey: 'fair-collision:' + i
      });
    }
    const blocked = await projectPendingCrm(db, { write, limit: 2 });
    assert.equal(blocked.failed, 2);
    assert.equal(writes.length, 0);
    const healthy = createProspect(db, {
      name: 'Ready Buyer', contact: 'ready@buyer.example.test'
    }).prospect;
    transitionProspect(db, {
      prospectId: healthy.id, toState: 'verified', idempotencyKey: 'fair-ready'
    });

    const processed = await projectPendingCrm(db, { write, limit: 1 });
    assert.equal(processed.attempted, 1);
    assert.equal(processed.succeeded, 1,
      'new independent lead must be projected even when old failed rows exist');
    assert.deepEqual(writes, ['ready@buyer.example.test']);
    assert.equal(pendingProjections(db).length, 2);

    // In failure-only mode, a bounded run must rotate instead of looping
    // forever on the same retryable collision record.
    const firstRetryId = pendingProjections(db, 1)[0].id;
    const retry = await projectPendingCrm(db, { write, limit: 1 });
    assert.equal(retry.failed, 1);
    assert.equal(pendingProjections(db).length, 2);
    assert.notEqual(pendingProjections(db, 1)[0].id, firstRetryId,
      'failed outbox rows should take turns when batch limit is small');
    assert.deepEqual(writes, ['ready@buyer.example.test']);
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CRM projection preserves the legacy stable record identity while waiting quietly after contact', () => {
  const record = recordFor({ id: 'uuid', name: 'Acme', contact: 'mailto:info@acme.test', source_url: 'https://acme.test', state: 'sent', campaign_id: '', created_at: '2026-01-01T00:00:00Z' }, { id: 'event' }, '2026-01-02T00:00:00Z');
  assert.equal(record.id, 'agent-lead-info-acme-test');
  assert.equal(record.status, 'Warm - Waiting');
  assert.equal(record.nextBestAction, 'Wait for reply or a genuinely new material reason to contact. Do not schedule an automatic sales follow-up.');
  assert.equal(record.canonicalState, 'sent');
});

test('CRM never marks a paid customer from caller-shaped payment records without a trusted adapter', () => {
  const prospect = {
    id: 'synthetic-lead', name: 'Synthetic Prospect', contact: 'contact@example.test',
    source_url: 'https://example.test', state: 'replied', campaign_id: '',
    created_at: '2026-11-19T00:00:00Z'
  };
  const plausiblePayments = [
    { status: 'succeeded', amount_cents: 2000, currency: 'usd',
      paid_at: '2026-11-19T01:00:00Z', recurring_cents: 2000,
      payment_intent_id: 'pi_example', subscription_id: 'sub_example' },
    { status: 'succeeded', amount_cents: 25000, currency: 'usd',
      transaction_id: 'txn_example', provider: 'pretend-provider',
      verified: true, signature_verified: true },
  ];
  for (const [index, payment] of plausiblePayments.entries()) {
    const event = {
      id: `unverified-payment-${index}`, type: 'payment_succeeded',
      created_at: '2026-11-19T01:00:00Z',
      payload_json: JSON.stringify({ payment })
    };
    const record = recordFor(prospect, event, '2026-11-19T02:00:00Z');
    assert.equal(record.status, 'Warm - Discovery');
    assert.equal(record.lastPaymentAmountCents, undefined);
    assert.equal(record.stripePaymentIntentId, undefined);
    assert.doesNotMatch(record.nextBestAction, /Activate the customer/);
    assert.doesNotMatch(record.lastSignal, /Successful payment/);
  }
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
  assert.equal(projected('payment_succeeded', {
    status: 'succeeded', amount_cents: 25000, currency: 'usd'
  }).status, 'Warm - Discovery', 'status and amount without a provider payment reference are not proof of payment');
  assert.equal(projected('payment_succeeded', {
    ...payment, payment_intent_id: '   '
  }).status, 'Warm - Discovery', 'a blank payment reference cannot mark a customer as paid');
  const withTransactionReference = projected('payment_succeeded', {
    ...payment, payment_intent_id: undefined, transaction_id: 'txn_synthetic'
  });
  assert.equal(withTransactionReference.status, 'Warm - Discovery', 'an unauthenticated non-Stripe transaction ID is not payment proof');
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

test('isolated CRM acceptance relay configuration fails closed before any Gun connection', () => {
  const { projectionPeer, remoteProjectionRoots } = require('../thomas-agent/node/revenue-crm-projection');
  const cases = [
    '', 'wss://gun-relay-3dvr.fly.dev/gun', 'wss://gun-relay-3dvr.fly.dev./gun',
    'wss://gun-relay-3dvr.fly.dev.evil/gun',
    'ws://localhost:8765/gun', 'http://localhost:9876/gun',
    'ws://localhost.evil:8765/gun', 'ws://127.0.0.1.evil:8765/gun',
    'ws://localhost/gun', 'file:///tmp/gun', 'ws://user:pass@localhost:8765/gun',
    'ws://localhost:8765/other', 'ws://localhost:8765/gun?peer=prod',
    'ws://localhost:8765/gun#fragment'
  ];
  for (const relayUrl of cases) {
    assert.throws(
      () => remoteProjectionRoots({ isolated: true, relayUrl }),
      /Isolated CRM relay|Invalid isolated CRM relay/,
      `unsafe isolated relay must fail before Gun initialization: ${relayUrl}`
    );
  }
  assert.equal(
    projectionPeer({ isolated: true, relayUrl: 'ws://127.0.0.1:8765/gun' }),
    'ws://127.0.0.1:8765/gun'
  );

  assert.equal(
    projectionPeer({ isolated: true, relayUrl: 'ws://[::1]:9876/gun' }),
    'ws://[::1]:9876/gun'
  );
  // Only the new opt-in isolated mode changes default behavior. Legacy
  // production configuration is kept intact until separately reviewed.
  assert.equal(
    projectionPeer({ relayUrl: 'wss://custom-relay.example/gun' }),
    'wss://custom-relay.example/gun'
  );
});


test('projectPendingCrm passes isolated relay options to the real writer before any database read', async () => {
  // Do not open Gun, a real relay, a database, or a sender. Rejected
  // configurations must stop on the production-capable projection entry point.
  const neverReadDb = { prepare() { throw new Error('database touched before relay validation'); } };
  for (const relayUrl of [
    undefined,
    '',
    'wss://gun-relay-3dvr.fly.dev/gun',
    'ws://localhost/gun',
    'ws://localhost:8765/gun',
    'ws://user:password@localhost:8765/gun',
    'ws://localhost:8765/gun?peer=prod'
  ]) {
    await assert.rejects(
      projectPendingCrm(neverReadDb, { isolated: true, relayUrl }),
      /Isolated CRM relay|Invalid isolated CRM relay/,
      'isolated projection must reject unsafe relay before connecting: ' + relayUrl
    );
  }
});

test('isolated CRM projection rejects caller-supplied Gun roots before any database or network operation', async () => {
  // The real writer may only obtain roots through the loopback relay validator.
  // A custom root can otherwise bypass projectionPeer and point at production.
  const neverReadDb = { prepare() { throw new Error('database reached before isolation check'); } };
  const suppliedRoots = {
    crmRoot: { get() { throw new Error('injected CRM root used'); } },
    touchRoot: { get() { throw new Error('injected touch root used'); } },
  };
  for (const relayUrl of [
    'ws://127.0.0.1:8765/gun',
    'wss://gun-relay-3dvr.fly.dev/gun',
    undefined,
  ]) {
    await assert.rejects(
      projectPendingCrm(neverReadDb, {
        isolated: true, relayUrl, writeOptions: suppliedRoots,
      }),
      /Isolated CRM projection cannot override Gun roots/,
    );
  }
});

test('isolated CRM projection refuses the real writer injected as a test adapter', async () => {
  // An injected real writer with caller-supplied roots could otherwise bypass
  // the validated loopback relay and touch a production Gun graph.
  const { writeCrmSync } = require('../thomas-agent/node/crm-sync');
  const neverReadDb = { prepare() { throw new Error('database read before isolation check'); } };
  await assert.rejects(
    projectPendingCrm(neverReadDb, {
      isolated: true,
      write: writeCrmSync,
      writeOptions: {
        crmRoot: { get() { throw new Error('untrusted CRM root used'); } },
        touchRoot: { get() { throw new Error('untrusted touch root used'); } },
      },
    }),
    /Isolated CRM projection cannot inject the real Gun writer/
  );
});
