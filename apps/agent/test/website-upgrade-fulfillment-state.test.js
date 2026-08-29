const test = require('node:test');
const assert = require('node:assert/strict');
const {
  receiveOrder,
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

test('receives each Stripe Checkout Session only once', () => {
  const state = { version: 1, orders: {} };
  const first = receiveOrder(state, order());
  const replay = receiveOrder(state, { ...order(), businessName: 'Changed on replay' });

  assert.equal(first.created, true);
  assert.equal(replay.created, false);
  assert.equal(Object.keys(state.orders).length, 1);
  assert.equal(replay.record.businessName, 'Example Studio');
});

test('tracks processing attempts and safe retry state', () => {
  const state = { version: 1, orders: {} };
  receiveOrder(state, order());
  transitionOrder(state, order().sessionId, 'processing');
  transitionOrder(state, order().sessionId, 'failed', { reason: 'verification timeout' });
  const retry = transitionOrder(state, order().sessionId, 'processing');

  assert.equal(retry.attempts, 2);
  assert.equal(retry.status, 'processing');
});

test('delivery is exactly-once guarded by durable delivery state', () => {
  const state = { version: 1, orders: {} };
  const { record } = receiveOrder(state, order());
  assert.equal(shouldDeliver(record), true);

  const delivered = transitionOrder(state, order().sessionId, 'delivered', {
    finalUrl: order().siteUrl,
  });
  assert.equal(shouldDeliver(delivered), false);
  assert.ok(delivered.deliverySentAt);

  const replay = transitionOrder(state, order().sessionId, 'processing');
  assert.equal(replay.status, 'delivered');
  assert.equal(replay.attempts, delivered.attempts);
});

test('blocked orders remain terminal on replay', () => {
  const state = { version: 1, orders: {} };
  receiveOrder(state, order());
  const blocked = transitionOrder(state, order().sessionId, 'blocked', { reason: 'target rejected' });
  const replay = transitionOrder(state, order().sessionId, 'processing');

  assert.equal(blocked.status, 'blocked');
  assert.equal(replay.status, 'blocked');
});
