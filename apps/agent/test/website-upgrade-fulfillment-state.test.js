const test = require('node:test');
const assert = require('node:assert/strict');
const {
  readNode,
  receiveOrder,
  reserveDelivery,
  shouldDeliver,
  transitionOrder,
} = require('../thomas-agent/node/website-upgrade-fulfillment-state');

function order() {
  return {
    sessionId: 'cs_live_upgrade_123',
    businessName: 'Example Studio',
    mainAction: 'Book a consultation',
    siteUrl: 'https://3dvr.tech/free-sites/example-studio/',
    slug: 'example-studio',
    customerEmail: 'buyer@example.com',
  };
}

function memoryNodeFactory() {
  const records = new Map();
  const node = sessionId => ({
    once(callback) {
      callback(records.get(sessionId) || null);
    },
    put(value, callback) {
      records.set(sessionId, structuredClone(value));
      callback({ ok: 1 });
    },
  });
  node.records = records;
  return node;
}

test('receives each Stripe Checkout Session only once', async () => {
  const node = memoryNodeFactory();
  const first = await receiveOrder(order(), { node });
  const replay = await receiveOrder({ ...order(), businessName: 'Changed on replay' }, { node });

  assert.equal(first.created, true);
  assert.equal(replay.created, false);
  assert.equal(node.records.size, 1);
  assert.equal(replay.record.businessName, 'Example Studio');
});

test('fails closed on malformed shared fulfillment state', async () => {
  const malformedNode = {
    once(callback) {
      callback('corrupt-existing-record');
    },
  };

  await assert.rejects(
    readNode(malformedNode),
    /Malformed Website Upgrade fulfillment state/
  );
});

test('tracks processing attempts and safe retry state', async () => {
  const node = memoryNodeFactory();
  await receiveOrder(order(), { node });
  await transitionOrder(order().sessionId, 'processing', {}, { node });
  await transitionOrder(order().sessionId, 'failed', { reason: 'verification timeout' }, { node });
  const retry = await transitionOrder(order().sessionId, 'processing', {}, { node });

  assert.equal(retry.attempts, 2);
  assert.equal(retry.status, 'processing');
});

test('delivery reservation survives restart and prevents duplicate send', async () => {
  const node = memoryNodeFactory();
  const { record } = await receiveOrder(order(), { node });
  assert.equal(shouldDeliver(record), true);

  const first = await reserveDelivery(order().sessionId, 'delivery-attempt-1', { node });
  assert.equal(first.reserved, true);
  assert.equal(first.record.deliveryState, 'reserved');
  assert.ok(first.record.deliveryReservedAt);
  assert.equal(shouldDeliver(first.record), false);

  const restartedWorker = await reserveDelivery(order().sessionId, 'delivery-attempt-2', { node });
  assert.equal(restartedWorker.reserved, false);
  assert.equal(restartedWorker.record.deliveryReservationId, 'delivery-attempt-1');
  assert.equal(shouldDeliver(restartedWorker.record), false);

  const delivered = await transitionOrder(order().sessionId, 'delivered', {
    finalUrl: order().siteUrl,
  }, { node });
  assert.equal(delivered.deliveryState, 'sent');
  assert.ok(delivered.deliverySentAt);
  assert.equal(shouldDeliver(delivered), false);
});

test('blocked orders remain terminal and cannot pass the delivery guard', async () => {
  const node = memoryNodeFactory();
  await receiveOrder(order(), { node });
  const blocked = await transitionOrder(order().sessionId, 'blocked', { reason: 'target rejected' }, { node });
  const replay = await transitionOrder(order().sessionId, 'processing', {}, { node });

  assert.equal(blocked.status, 'blocked');
  assert.equal(replay.status, 'blocked');
  assert.equal(shouldDeliver(blocked), false);
  const reservation = await reserveDelivery(order().sessionId, 'should-not-reserve', { node });
  assert.equal(reservation.reserved, false);
});
