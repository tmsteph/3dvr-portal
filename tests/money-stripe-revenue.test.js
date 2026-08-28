import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectStripeRevenueHints,
  parseAutopilotReferenceId,
  summarizeStripeRevenue,
} from '../src/money/stripe-revenue.js';

test('parseAutopilotReferenceId separates run and offer profile', () => {
  assert.deepEqual(
    parseAutopilotReferenceId('money-20260828-abc__free-page-starter'),
    { runId: 'money-20260828-abc', offerProfile: 'free-page-starter' }
  );
});

test('summarizeStripeRevenue attributes paid checkouts and calculates MRR', () => {
  const result = summarizeStripeRevenue({
    paymentLinks: [
      { id: 'plink_upgrade', url: 'https://buy.stripe.com/upgrade', metadata: { offer: 'website-upgrade' } },
    ],
    sessions: [
      { payment_status: 'paid', amount_total: 500, client_reference_id: 'money-run-1__free-page-starter', payment_link: 'plink_upgrade', created: 10 },
      { payment_status: 'paid', amount_total: 9900, payment_link: 'plink_upgrade', created: 20 },
      { payment_status: 'unpaid', amount_total: 9900, payment_link: 'plink_upgrade', created: 30 },
    ],
    subscriptions: [
      {
        status: 'active',
        items: { data: [{ quantity: 1, price: { unit_amount: 2000, recurring: { interval: 'month', interval_count: 1 } } }] },
      },
    ],
  });

  assert.equal(result.paidCheckouts, 2);
  assert.equal(result.grossRevenueCents, 10400);
  assert.equal(result.monthlyRecurringRevenueCents, 2000);
  assert.equal(result.byOffer.find(item => item.offer === 'website-upgrade').grossRevenueCents, 9900);
  assert.equal(result.byOffer.find(item => item.offer === 'free-page-starter').grossRevenueCents, 500);
});
test('collectStripeRevenueHints reads recent Stripe sessions, links, and subscriptions', async () => {
  const stripeClient = {
    checkout: {
      sessions: {
        async list() {
          return { data: [{ payment_status: 'paid', amount_total: 9900, payment_link: 'plink_upgrade', created: 20 }] };
        },
      },
    },
    paymentLinks: {
      async list() {
        return { data: [{ id: 'plink_upgrade', url: 'https://buy.stripe.com/upgrade', metadata: { offer: 'website-upgrade' } }] };
      },
    },
    subscriptions: {
      async list() {
        return { data: [] };
      },
    },
  };

  const result = await collectStripeRevenueHints({ stripeClient, limit: 50 });
  assert.equal(result.enabled, true);
  assert.equal(result.sampleLimit, 50);
  assert.equal(result.paidCheckouts, 1);
  assert.equal(result.byOffer[0].offer, 'website-upgrade');
  assert.equal(result.byOffer[0].checkoutUrl, 'https://buy.stripe.com/upgrade');
});