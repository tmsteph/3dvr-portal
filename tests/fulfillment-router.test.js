import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFulfillmentOrder,
  chooseFulfillmentLane,
  createOrFindFulfillmentIssue,
  dispatchPaidCheckout
} from '../src/money/fulfillment-router.js';

function checkoutEvent(overrides = {}) {
  return {
    id: 'evt_auto_1', livemode: true,
    type: 'checkout.session.completed',
    data: { object: {
      id: 'cs_auto_1', livemode: true, mode: 'payment', payment_status: 'paid',
      amount_total: 29900, currency: 'usd', payment_link: 'plink_auto',
      customer_details: { email: 'private@example.com' },
      metadata: { offer: 'automation-quick-win', source: 'autobusiness' },
      custom_fields: [{ key: 'problem', type: 'text', text: { value: 'Automate lead follow-up' } }],
      ...overrides
    }}
  };
}

test('paid Auto Business checkout becomes a privacy-safe agent task', () => {
  const order = buildFulfillmentOrder(checkoutEvent());
  assert.equal(order.lane, 'agent');
  assert.equal(order.offer, 'automation-quick-win');
  assert.match(order.privateSummary, /private@example\.com/);
  assert.doesNotMatch(order.publicBody, /private@example\.com/);
  assert.doesNotMatch(order.publicBody, /Automate lead follow-up/);
});

test('Freelancer Growth Autopilot subscription starts agent-first fulfillment from product metadata', () => {
  const order = buildFulfillmentOrder(checkoutEvent({
    id: 'cs_freelancer_1',
    mode: 'subscription',
    amount_total: 4900,
    metadata: { product_key: 'freelancer_growth_autopilot', launch_stage: 'founding' },
    custom_fields: [{ key: 'work_type', type: 'text', text: { value: 'AV systems engineering' } }]
  }));
  assert.equal(order.lane, 'agent');
  assert.equal(order.offer, 'freelancer-growth-autopilot');
  assert.equal(order.amount, '$49.00');
  assert.match(order.privateSummary, /AV systems engineering/);
  assert.doesNotMatch(order.publicBody, /AV systems engineering/);
});

test('routing escalates physical, specialist, and high-impact work', () => {
  assert.equal(chooseFulfillmentLane({ fields: { problem: 'Need on-site hardware install' } }).lane, 'local-worker');
  assert.equal(chooseFulfillmentLane({ fields: { problem: 'Need a CAD model' } }).lane, 'contractor');
  assert.equal(chooseFulfillmentLane({ fields: { problem: 'Need bank transfer automation' } }).lane, 'owner-review');
});

test('unpaid checkout does not start fulfillment', () => {
  const event = checkoutEvent({ payment_status: 'unpaid' });
  assert.equal(buildFulfillmentOrder(event), null);
});

test('async payment success starts fulfillment', () => {
  const event = checkoutEvent({ payment_status: 'paid' });
  event.type = 'checkout.session.async_payment_succeeded';
  assert.equal(buildFulfillmentOrder(event).lane, 'agent');
});

test('GitHub task creation is idempotent by Stripe event marker', async () => {
  const order = buildFulfillmentOrder(checkoutEvent());
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ items: [{ number: 42, html_url: 'https://github.com/tmsteph/3dvr-portal/issues/42' }] }) };
  };
  const ticket = await createOrFindFulfillmentIssue(order, { config: { GITHUB_TOKEN: 'test', GITHUB_REPOSITORY: 'tmsteph/3dvr-portal' }, fetchImpl });
  assert.equal(ticket.status, 'existing');
  assert.equal(ticket.issueNumber, 42);
  assert.equal(calls.length, 1);
});

test('GitHub task body contains no private checkout fields', async () => {
  const order = buildFulfillmentOrder(checkoutEvent());
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes('/search/issues')) return { ok: true, json: async () => ({ items: [] }) };
    return { ok: true, json: async () => ({ number: 77, html_url: 'https://github.com/tmsteph/3dvr-portal/issues/77' }) };
  };
  const ticket = await createOrFindFulfillmentIssue(order, {
    config: { GITHUB_TOKEN: 'test', GITHUB_REPOSITORY: 'tmsteph/3dvr-portal' }, fetchImpl
  });
  assert.equal(ticket.status, 'created');
  const createdBody = JSON.parse(calls[1].options.body);
  assert.match(createdBody.body, /3dvr-fulfillment:evt_auto_1/);
  assert.doesNotMatch(createdBody.body, /private@example\.com|Automate lead follow-up/);
});

test('only explicit positive integer paid checkout is classified as paid', () => {
  for (const type of ['checkout.session.completed', 'checkout.session.async_payment_succeeded']) {
    for (const overrides of [
      { payment_status: undefined },
      { payment_status: 'unpaid' },
      { amount_total: 0 },
      { amount_total: -1 },
      { amount_total: 1.5 },
      { amount_total: '29900' },
      { amount_total: null },
      { currency: '' },
      { currency: 'US dollars' }
    ]) {
      assert.equal(buildFulfillmentOrder({ ...checkoutEvent(overrides), type }), null);
    }
    const order = buildFulfillmentOrder({ ...checkoutEvent(), type });
    assert.equal(order.paymentClass, 'paid');
    assert.equal(order.amountCents, 29900);
    assert.equal(order.currency, 'usd');
  }
});

test('explicit free checkout may fulfill but is not represented as paid revenue', () => {
  const event = checkoutEvent({ payment_status: 'no_payment_required', amount_total: 0 });
  const order = buildFulfillmentOrder(event);
  assert.equal(order.paymentClass, 'no-payment-required');
  assert.equal(order.amountCents, 0);
  assert.match(order.publicBody, /no customer revenue attributed/);
  assert.doesNotMatch(order.publicBody, /## Paid fulfillment order/);
  assert.doesNotMatch(order.privateSummary, /^Paid Auto Business/);
  assert.equal(buildFulfillmentOrder(checkoutEvent({ payment_status: 'no_payment_required' })), null);
  assert.equal(buildFulfillmentOrder({ ...event, type: 'checkout.session.async_payment_succeeded' }), null);
});

test('test and ambiguous Stripe modes never dispatch fulfillment', async () => {
  for (const type of ['checkout.session.completed', 'checkout.session.async_payment_succeeded']) {
    for (const [eventMode, sessionMode] of [[false, false], [false, true], [true, false], [undefined, true], [true, undefined], ['true', true]]) {
      const event = { ...checkoutEvent({ livemode: sessionMode }), type, livemode: eventMode };
      let calls = 0;
      const result = await dispatchPaidCheckout(event, { config: { GITHUB_TOKEN: 'test' }, fetchImpl: async () => { calls++; throw new Error('Unexpected network'); } });
      assert.equal(result.order, null);
      assert.equal(result.ticket.status, 'skipped');
      assert.equal(calls, 0);
    }
  }
  assert.equal(buildFulfillmentOrder(checkoutEvent({ livemode: false, payment_status: 'no_payment_required', amount_total: 0 })), null);
});
