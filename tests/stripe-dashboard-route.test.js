import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { createStripeDashboardHandler } from '../api/stripe/[route].js';

function createMockRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end(payload) {
      this.ended = true;
      if (payload !== undefined) {
        this.body = payload;
      }
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    }
  };
}

function createDashboardStripeMock() {
  return {
    invoices: {
      list: mock.fn(() => ({
        autoPagingToArray: async () => ([
          {
            customer: { id: 'cus_1', email: 'user@example.com', name: 'Portal User' },
            currency: 'usd',
            amount_paid: 500,
            created: 1700000000
          },
          {
            customer: { id: 'cus_1', email: 'USER@example.com', name: 'Portal User' },
            currency: 'usd',
            amount_paid: 700,
            created: 1700000300
          }
        ])
      }))
    },
    subscriptions: {
      list: mock.fn(() => ({
        autoPagingToArray: async () => ([
          {
            id: 'sub_1',
            items: {
              data: [
                {
                  quantity: 1,
                  price: {
                    currency: 'usd',
                    unit_amount: 5000,
                    recurring: { interval: 'month', interval_count: 1 },
                    metadata: { plan: 'builder' }
                  }
                }
              ]
            }
          },
          {
            id: 'sub_2',
            items: {
              data: [
                {
                  quantity: 1,
                  price: {
                    currency: 'usd',
                    unit_amount: 240000,
                    recurring: { interval: 'year', interval_count: 1 },
                    metadata: { plan: 'embedded' }
                  }
                }
              ]
            }
          }
        ])
      }))
    },
    balance: {
      retrieve: mock.fn(async () => ({
        available: [{ amount: 1200, currency: 'usd' }],
        pending: [{ amount: 300, currency: 'usd' }]
      }))
    },
    events: {
      list: mock.fn(async ({ limit }) => ({
        data: [
          {
            id: 'evt_1',
            type: 'customer.subscription.updated',
            created: 1700000400,
            api_version: '2023-10-16',
            pending_webhooks: 1,
            request: { id: 'req_1' },
            data: { object: { object: 'subscription' } },
            requestedLimit: limit
          }
        ]
      }))
    }
  };
}

test('stripe dashboard route serves customer summaries', async () => {
  const handler = createStripeDashboardHandler({
    stripeClient: createDashboardStripeMock()
  });
  const req = { method: 'GET', query: { route: 'customers' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 1);
  assert.deepEqual(res.body.currencyTotals, { USD: 1200 });
  assert.equal(res.body.customers[0].email, 'user@example.com');
  assert.deepEqual(res.body.customers[0].customerIds, ['cus_1']);
});

test('stripe dashboard route serves balance metrics', async () => {
  const stripeClient = createDashboardStripeMock();
  const handler = createStripeDashboardHandler({ stripeClient });
  const req = { method: 'GET', query: { route: 'metrics' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.available, { USD: 1200 });
  assert.deepEqual(res.body.pending, { USD: 300 });
  assert.equal(res.body.activeSubscribers, 2);
  assert.deepEqual(res.body.recurringRevenue, { USD: 25000 });
  assert.deepEqual(res.body.planCounts, { builder: 1, embedded: 1 });
  assert.equal(stripeClient.subscriptions.list.mock.calls.length, 1);
});

test('stripe dashboard route serves event summaries and preserves the requested limit', async () => {
  const stripeClient = createDashboardStripeMock();
  const handler = createStripeDashboardHandler({ stripeClient });
  const req = { method: 'GET', query: { route: 'events', limit: '8' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.events.length, 1);
  assert.equal(res.body.events[0].id, 'evt_1');
  assert.equal(stripeClient.events.list.mock.calls[0].arguments[0].limit, 8);
});

test('stripe dashboard route rejects unknown endpoints', async () => {
  const handler = createStripeDashboardHandler({
    stripeClient: createDashboardStripeMock()
  });
  const req = { method: 'GET', query: { route: 'missing' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 404);
  assert.match(res.body.error, /Unknown Stripe endpoint/);
});

test('stripe dashboard route delegates checkout and status subpaths before GET-only dashboard checks', async () => {
  const handler = createStripeDashboardHandler({
    stripeClient: createDashboardStripeMock(),
  });

  const checkoutRes = createMockRes();
  await handler({ method: 'OPTIONS', query: { route: 'checkout' } }, checkoutRes);
  assert.equal(checkoutRes.statusCode, 200);
  assert.equal(checkoutRes.ended, true);

  const statusRes = createMockRes();
  await handler({ method: 'OPTIONS', query: { route: 'status' } }, statusRes);
  assert.equal(statusRes.statusCode, 200);
  assert.equal(statusRes.ended, true);
});
