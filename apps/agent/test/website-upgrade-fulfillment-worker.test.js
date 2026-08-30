const test = require('node:test');
const assert = require('node:assert/strict');
const {
  deliveryKey,
  processUpgradeOrder,
  publicationKey,
} = require('../thomas-agent/node/website-upgrade-fulfillment-worker');

function order(overrides = {}) {
  return {
    sessionId: 'cs_live_upgrade_123',
    businessName: 'Example Studio',
    mainAction: 'Book a consultation',
    siteUrl: 'https://3dvr.tech/free-sites/example-studio/',
    slug: 'example-studio',
    customerEmail: 'buyer@example.com',
    ...overrides,
  };
}

function createState() {
  const records = new Map();
  const calls = [];

  const api = {
    calls,
    records,
    async receiveOrder(input) {
      calls.push(['receive', input.sessionId]);
      const existing = records.get(input.sessionId);
      if (existing) {
        return {
          record: { ...existing },
          created: false,
          terminal: ['delivered', 'blocked'].includes(existing.status),
        };
      }
      const record = {
        ...input,
        status: 'received',
        attempts: 0,
        deliveryState: 'pending',
        deliveryReservedAt: null,
        deliveryReservationId: null,
        deliverySentAt: null,
      };
      records.set(input.sessionId, record);
      return { record: { ...record }, created: true, terminal: false };
    },
    async transitionOrder(sessionId, status, details = {}) {
      calls.push(['transition', sessionId, status, details]);
      const current = records.get(sessionId);
      if (!current) throw new Error(`missing ${sessionId}`);
      if (['delivered', 'blocked'].includes(current.status) && current.status !== status) {
        return { ...current };
      }
      const next = { ...current, ...details, status };
      if (status === 'processing') next.attempts = Number(current.attempts || 0) + 1;
      if (status === 'delivered') {
        next.deliveryState = 'sent';
        next.deliverySentAt = next.deliverySentAt || '2026-08-30T00:00:00.000Z';
      }
      records.set(sessionId, next);
      return { ...next };
    },
    async reserveDelivery(sessionId, reservationId) {
      calls.push(['reserve', sessionId, reservationId]);
      const current = records.get(sessionId);
      if (!current) throw new Error(`missing ${sessionId}`);
      if (
        ['delivered', 'blocked'].includes(current.status)
        || current.deliveryReservedAt
        || current.deliverySentAt
      ) {
        return { record: { ...current }, reserved: false };
      }
      const next = {
        ...current,
        deliveryState: 'reserved',
        deliveryReservedAt: '2026-08-30T00:00:00.000Z',
        deliveryReservationId: reservationId,
      };
      records.set(sessionId, next);
      return { record: { ...next }, reserved: true };
    },
  };

  return api;
}

function adapters(overrides = {}) {
  const calls = { publish: [], verify: [], send: [] };
  return {
    calls,
    publishUpgrade: overrides.publishUpgrade || (async (input) => {
      calls.publish.push(input);
      return { siteUrl: input.order.siteUrl, prUrl: 'https://github.com/tmsteph/3dvr-web/pull/123' };
    }),
    verifyUpgrade: overrides.verifyUpgrade || (async (input) => {
      calls.verify.push(input);
      return true;
    }),
    sendDelivery: overrides.sendDelivery || (async (input) => {
      calls.send.push(input);
      return { accepted: true };
    }),
  };
}

test('success publishes, verifies, reserves delivery, sends once, then marks delivered', async () => {
  const state = createState();
  const sideEffects = adapters();
  const input = order();

  const result = await processUpgradeOrder(input, { state, ...sideEffects });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'delivered');
  assert.equal(sideEffects.calls.publish.length, 1);
  assert.equal(sideEffects.calls.verify.length, 1);
  assert.equal(sideEffects.calls.send.length, 1);
  assert.equal(sideEffects.calls.publish[0].idempotencyKey, publicationKey(input.sessionId));
  assert.equal(sideEffects.calls.send[0].idempotencyKey, deliveryKey(input.sessionId));
  assert.equal(result.record.finalUrl, input.siteUrl);
  assert.equal(result.record.deliveryState, 'sent');
});

test('delivered replay performs no publish, verify, or delivery side effects', async () => {
  const state = createState();
  const sideEffects = adapters();
  const input = order();

  await processUpgradeOrder(input, { state, ...sideEffects });
  const replay = await processUpgradeOrder(input, { state, ...sideEffects });

  assert.equal(replay.status, 'delivered');
  assert.equal(replay.replay, true);
  assert.equal(sideEffects.calls.publish.length, 1);
  assert.equal(sideEffects.calls.verify.length, 1);
  assert.equal(sideEffects.calls.send.length, 1);
});

test('missing or malformed customer email blocks before publishing', async () => {
  for (const customerEmail of ['', 'not-an-email']) {
    const state = createState();
    const sideEffects = adapters();
    const result = await processUpgradeOrder(order({ customerEmail }), { state, ...sideEffects });

    assert.equal(result.status, 'blocked');
    assert.match(result.record.reason, /valid customer email/);
    assert.equal(sideEffects.calls.publish.length, 0);
    assert.equal(sideEffects.calls.verify.length, 0);
    assert.equal(sideEffects.calls.send.length, 0);
  }
});

test('invalid or external target is blocked before publishing', async () => {
  const state = createState();
  const sideEffects = adapters();
  const result = await processUpgradeOrder(order({
    siteUrl: 'https://example.com/free-sites/example-studio/',
  }), { state, ...sideEffects });

  assert.equal(result.status, 'blocked');
  assert.match(result.record.reason, /validated 3DVR-hosted free-site URL/);
  assert.equal(sideEffects.calls.publish.length, 0);
  assert.equal(sideEffects.calls.send.length, 0);
});

test('publisher cannot redirect delivery to a different URL', async () => {
  const state = createState();
  const calls = { publish: 0, verify: 0, send: 0 };
  const result = await processUpgradeOrder(order(), {
    state,
    publishUpgrade: async () => {
      calls.publish += 1;
      return { siteUrl: 'https://evil.example/' };
    },
    verifyUpgrade: async () => {
      calls.verify += 1;
      return true;
    },
    sendDelivery: async () => {
      calls.send += 1;
    },
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.stage, 'publish');
  assert.equal(calls.publish, 1);
  assert.equal(calls.verify, 0);
  assert.equal(calls.send, 0);
});

test('verification failure records failed state and never reserves or sends delivery', async () => {
  const state = createState();
  const sideEffects = adapters({
    verifyUpgrade: async (input) => {
      sideEffects.calls.verify.push(input);
      return false;
    },
  });

  const result = await processUpgradeOrder(order(), { state, ...sideEffects });

  assert.equal(result.status, 'failed');
  assert.equal(result.stage, 'verify');
  assert.equal(sideEffects.calls.publish.length, 1);
  assert.equal(sideEffects.calls.verify.length, 1);
  assert.equal(sideEffects.calls.send.length, 0);
  assert.equal(state.calls.filter((entry) => entry[0] === 'reserve').length, 0);
});

test('delivery failure leaves durable reservation uncertain and retry never sends again', async () => {
  const state = createState();
  const calls = { publish: 0, verify: 0, send: 0 };
  const opts = {
    state,
    publishUpgrade: async ({ order: input }) => {
      calls.publish += 1;
      return { siteUrl: input.siteUrl };
    },
    verifyUpgrade: async () => {
      calls.verify += 1;
      return true;
    },
    sendDelivery: async () => {
      calls.send += 1;
      throw new Error('smtp outcome unknown');
    },
  };

  const first = await processUpgradeOrder(order(), opts);
  const replay = await processUpgradeOrder(order(), opts);

  assert.equal(first.status, 'delivery_uncertain');
  assert.equal(first.record.deliveryState, 'uncertain');
  assert.ok(first.record.deliveryReservedAt);
  assert.equal(replay.status, 'delivery_uncertain');
  assert.equal(calls.publish, 1);
  assert.equal(calls.verify, 1);
  assert.equal(calls.send, 1);
});

test('publish failure can retry with the same stable publication idempotency key', async () => {
  const state = createState();
  const keys = [];
  let attempts = 0;
  const sideEffects = adapters({
    publishUpgrade: async (input) => {
      keys.push(input.idempotencyKey);
      attempts += 1;
      if (attempts === 1) throw new Error('temporary git failure');
      return { siteUrl: input.order.siteUrl };
    },
  });

  const first = await processUpgradeOrder(order(), { state, ...sideEffects });
  const second = await processUpgradeOrder(order(), { state, ...sideEffects });

  assert.equal(first.status, 'failed');
  assert.equal(first.stage, 'publish');
  assert.equal(second.status, 'delivered');
  assert.deepEqual(keys, [publicationKey(order().sessionId), publicationKey(order().sessionId)]);
  assert.equal(sideEffects.calls.send.length, 1);
});
