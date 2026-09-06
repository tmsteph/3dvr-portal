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
  const recentBalanceTransactions = [
    {
      id: 'txn_charge',
      amount: 10000,
      available_on: 1700000600,
      created: 1700000500,
      currency: 'usd',
      description: 'Builder subscription',
      fee: 320,
      net: 9680,
      reporting_category: 'charge',
      status: 'available',
      type: 'charge',
      source: {
        id: 'ch_1',
        object: 'charge',
        customer: { id: 'cus_1', email: 'user@example.com', name: 'Portal User' },
        billing_details: { name: 'Portal User', email: 'user@example.com' },
        payment_method_details: { type: 'card' },
        invoice: 'in_1'
      }
    },
    {
      id: 'txn_payout',
      amount: -7000,
      available_on: 1700000800,
      created: 1700000700,
      currency: 'usd',
      description: 'Payout to bank',
      fee: 0,
      net: -7000,
      reporting_category: 'payout',
      status: 'pending',
      type: 'payout',
      source: {
        id: 'po_1',
        object: 'payout',
        description: 'Payout to bank',
        destination: 'ba_1',
        method: 'standard',
        arrival_date: 1700000900
      }
    },
    {
      id: 'txn_payin',
      amount: 3000,
      available_on: 1700001000,
      created: 1700000950,
      currency: 'usd',
      description: 'Manual pay-in',
      fee: 0,
      net: 3000,
      reporting_category: 'topup',
      status: 'available',
      type: 'topup',
      source: {
        id: 'tu_1',
        object: 'topup',
        description: 'Manual pay-in'
      }
    },
    {
      id: 'txn_financing_in',
      amount: 280000,
      available_on: 1700001200,
      created: 1700001100,
      currency: 'usd',
      description: 'Payout of your loan',
      fee: 0,
      net: 280000,
      reporting_category: 'financing_payout',
      status: 'available',
      type: 'financing_payout',
      source: {
        id: 'flxlnpo_test',
        object: 'flex_loan_payout',
        loan: 'flxln_test123',
        description: 'Payout of your loan'
      }
    },
    {
      id: 'txn_financing_out',
      amount: -1200,
      available_on: 1700001300,
      created: 1700001250,
      currency: 'usd',
      description: 'Stripe Capital repayment for flex loan flxln_test123',
      fee: 0,
      net: -1200,
      reporting_category: 'adjustment',
      status: 'available',
      type: 'anticipation_repayment',
      source: 'src_financing_out'
    },
    {
      id: 'txn_paydown_deposit',
      amount: 5000,
      available_on: 1700001400,
      created: 1700001350,
      currency: 'usd',
      description: 'External transfer to paydown financing balance',
      fee: 0,
      net: 5000,
      reporting_category: 'financing_paydown',
      status: 'available',
      type: 'financing_paydown',
      source: {
        id: 'pndngpd_test',
        object: 'pending_paydown'
      }
    }
  ];

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
    charges: {
      list: mock.fn(() => ({
        autoPagingToArray: async () => ([
          {
            id: 'ch_thomas_gmail',
            amount: 1000,
            amount_captured: 1000,
            amount_refunded: 0,
            captured: true,
            paid: true,
            status: 'succeeded',
            currency: 'usd',
            created: 1764000000,
            billing_details: { email: 'tmsteph1290@gmail.com', name: 'Thomas M Stephens Jr.' },
            customer: {
              id: 'cus_thomas',
              email: 'tmsteph1290@gmail.com',
              metadata: { billing_email: 'thomas.michael.stephens@outlook.com', portal_alias: 'tmsteph@3dvr' }
            }
          },
          {
            id: 'ch_thomas_outlook',
            amount: 500,
            amount_captured: 500,
            amount_refunded: 0,
            captured: true,
            paid: true,
            status: 'succeeded',
            currency: 'usd',
            created: 1764100000,
            billing_details: { email: 'thomas.michael.stephens@outlook.com', name: 'Thomas Stephens' },
            customer: null
          },
          {
            id: 'ch_brenda',
            amount: 2000,
            amount_captured: 2000,
            amount_refunded: 0,
            captured: true,
            paid: true,
            status: 'succeeded',
            currency: 'usd',
            created: 1764200000,
            billing_details: { email: 'brenda@example.com', name: 'Brenda Stephens' },
            customer: { id: 'cus_brenda', email: 'brenda@example.com', metadata: {} }
          },
          {
            id: 'ch_failed',
            amount: 9000,
            amount_captured: 0,
            amount_refunded: 0,
            captured: false,
            paid: false,
            status: 'failed',
            currency: 'usd',
            created: 1764300000,
            billing_details: { email: 'failed@example.com', name: 'Failed Payment' },
            customer: null
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
    },
    balanceTransactions: {
      list: mock.fn(({ expand } = {}) => ({
        autoPagingToArray: async ({ limit }) => {
          const records = Array.isArray(expand) && expand.includes('data.source')
            ? recentBalanceTransactions
            : recentBalanceTransactions;
          return records.slice(0, limit);
        }
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

test('stripe dashboard route merges explicitly linked customer email identities', async () => {
  const stripeClient = {
    invoices: {
      list: mock.fn(() => ({
        autoPagingToArray: async () => ([
          {
            customer: {
              id: 'cus_gmail',
              email: 'tmsteph1290@gmail.com',
              name: 'Thomas Stephens',
              metadata: {
                billing_email: 'thomas.michael.stephens@outlook.com',
                portal_alias: 'tmsteph@3dvr'
              }
            },
            currency: 'usd',
            amount_paid: 500,
            created: 1700000000
          },
          {
            customer: {
              id: 'cus_outlook',
              email: 'thomas.michael.stephens@outlook.com',
              name: 'Thomas Stephens',
              metadata: { portal_alias: 'tmsteph@3dvr' }
            },
            currency: 'usd',
            amount_paid: 700,
            created: 1700000300
          },
          {
            customer: { id: 'cus_old_gmail', email: 'tmsteph1290@gmail.com', name: 'Thomas Stephens', metadata: {} },
            currency: 'usd',
            amount_paid: 300,
            created: 1699999000
          }
        ])
      }))
    }
  };
  const handler = createStripeDashboardHandler({ stripeClient });
  const req = { method: 'GET', query: { route: 'customers' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 1);
  assert.deepEqual(res.body.currencyTotals, { USD: 1500 });
  assert.equal(res.body.customers[0].aggregateKey, 'tmsteph@3dvr');
  assert.deepEqual(res.body.customers[0].customerIds, ['cus_gmail', 'cus_old_gmail', 'cus_outlook']);
  assert.deepEqual(res.body.customers[0].emails, ['thomas.michael.stephens@outlook.com', 'tmsteph1290@gmail.com']);
  assert.deepEqual(res.body.customers[0].portalAliases, ['tmsteph@3dvr']);
});


test('stripe dashboard route serves the successful payment contribution ledger', async () => {
  const stripeClient = createDashboardStripeMock();
  const handler = createStripeDashboardHandler({ stripeClient });
  const req = { method: 'GET', query: { route: 'contributions' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 2);
  assert.equal(res.body.successfulPaymentCount, 3);
  assert.equal(res.body.totalCents, 3500);
  assert.equal(res.body.startAt, '2025-11-19T22:22:50.000Z');
  const thomas = res.body.contributors.find(row => row.name === 'Thomas Stephens');
  assert.ok(thomas);
  assert.equal(thomas.amountCents, 1500);
  assert.equal(thomas.paymentCount, 2);
  assert.deepEqual(thomas.emails, ['thomas.michael.stephens@outlook.com', 'tmsteph1290@gmail.com']);
  assert.deepEqual(thomas.portalAliases, ['tmsteph@3dvr']);
  assert.equal(stripeClient.charges.list.mock.calls.length, 1);
  assert.deepEqual(stripeClient.charges.list.mock.calls[0].arguments[0].expand, ['data.customer']);
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

test('stripe dashboard route serves Stripe cashflow summaries and counterparties', async () => {
  const stripeClient = createDashboardStripeMock();
  const handler = createStripeDashboardHandler({ stripeClient });
  const req = { method: 'GET', query: { route: 'cashflow', limit: '5' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.transactions.length, 5);
  assert.equal(res.body.transactions[0].label, 'Portal User');
  assert.equal(res.body.transactions[0].group, 'customer_payment');
  assert.equal(res.body.transactions[1].group, 'payout');
  assert.equal(res.body.transactions[4].group, 'financing');
  assert.deepEqual(res.body.summary.inflow, { USD: 298000 });
  assert.deepEqual(res.body.summary.outflow, { USD: 8200 });
  assert.deepEqual(res.body.summary.fees, { USD: 320 });
  assert.deepEqual(res.body.summary.net, { USD: 289480 });
  assert.deepEqual(res.body.summary.payouts, { USD: 7000 });
  assert.deepEqual(res.body.summary.payins, { USD: 3000 });
  assert.deepEqual(res.body.summary.financingIn, { USD: 285000 });
  assert.deepEqual(res.body.summary.financingFunding, { USD: 280000 });
  assert.deepEqual(res.body.summary.financingRepayments, { USD: 1200 });
  assert.deepEqual(res.body.summary.financingPaydownDeposits, { USD: 5000 });
  assert.deepEqual(res.body.summary.financingOut, { USD: 1200 });
  assert.equal(stripeClient.balanceTransactions.list.mock.calls.length, 2);
  assert.deepEqual(
    stripeClient.balanceTransactions.list.mock.calls[0].arguments[0].expand,
    ['data.source']
  );
});

test('stripe dashboard route separates funding, repayment, and paydown deposits', async () => {
  const handler = createStripeDashboardHandler({ stripeClient: createDashboardStripeMock() });
  const req = { method: 'GET', query: { route: 'financing' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.transactionCount, 3);
  assert.deepEqual(res.body.summary.funding, { USD: 280000 });
  assert.deepEqual(res.body.summary.repayments, { USD: 1200 });
  assert.deepEqual(res.body.summary.paydownDeposits, { USD: 5000 });
  assert.equal(res.body.transactions.find(row => row.id === 'txn_financing_in').financingKind, 'funding');
  assert.equal(res.body.transactions.find(row => row.id === 'txn_financing_in').loanId, 'flxln_test123');
  assert.equal(res.body.transactions.find(row => row.id === 'txn_paydown_deposit').financingKind, 'paydown_deposit');
  assert.equal(res.body.transactions.find(row => row.id === 'txn_financing_out').loanId, 'flxln_test123');
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
