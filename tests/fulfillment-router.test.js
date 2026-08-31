import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFulfillmentOrder,
  chooseFulfillmentLane,
  createOrFindFulfillmentIssue
} from '../src/money/fulfillment-router.js';

function checkoutEvent(overrides = {}) {
  return {
    id: 'evt_auto_1',
    type: 'checkout.session.completed',
    data: { object: {
      id: 'cs_auto_1', mode: 'payment', payment_status: 'paid',
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
