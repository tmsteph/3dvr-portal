import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectStripeRevenueHints,
  opportunityIdForOfferProfile,
  parseAutopilotReferenceId,
  summarizeStripeRevenue,
} from '../src/money/stripe-revenue.js';

test('canonical offer profiles map to stable opportunity IDs without changing legacy reference parsing', () => {
  assert.equal(opportunityIdForOfferProfile('free-page-starter'), '3dvr-free-page-starter');
  assert.equal(opportunityIdForOfferProfile('website_upgrade'), '3dvr-website-upgrade');
  assert.equal(opportunityIdForOfferProfile('microbusiness launch sprint'), '3dvr-microbusiness-launch-sprint');
  assert.equal(opportunityIdForOfferProfile('unknown-offer'), '');
  assert.equal(opportunityIdForOfferProfile('constructor'), '');
  assert.equal(opportunityIdForOfferProfile('toString'), '');

  assert.deepEqual(
    parseAutopilotReferenceId('money-20260828-abc__free-page-starter'),
    { runId: 'money-20260828-abc', offerProfile: 'free-page-starter' },
  );
});

test('Stripe revenue is summarized by canonical opportunity as well as by offer', () => {
  const result = summarizeStripeRevenue({
    paymentLinks: [
      { id: 'plink_upgrade', url: 'https://buy.stripe.com/upgrade', metadata: { offer: 'website-upgrade' } },
    ],
    sessions: [
      {
        payment_status: 'paid',
        amount_total: 500,
        client_reference_id: 'money-run-1__free-page-starter',
        created: 10,
      },
      {
        payment_status: 'paid',
        amount_total: 700,
        client_reference_id: 'money-run-2__free-page-starter',
        created: 20,
      },
      {
        payment_status: 'paid',
        amount_total: 9900,
        payment_link: 'plink_upgrade',
        created: 30,
      },
    ],
  });

  const freePage = result.byOpportunity.find((item) => item.opportunityId === '3dvr-free-page-starter');
  const upgrade = result.byOpportunity.find((item) => item.opportunityId === '3dvr-website-upgrade');

  assert.equal(result.paidCheckouts, 3);
  assert.equal(freePage.paidCheckouts, 2);
  assert.equal(freePage.grossRevenueCents, 1200);
  assert.equal(freePage.lastCheckoutSessionCreatedAt, 20);
  assert.equal(Object.hasOwn(freePage, 'lastPaidAt'), false);
  assert.deepEqual(freePage.runIds, ['money-run-1', 'money-run-2']);
  assert.equal(upgrade.paidCheckouts, 1);
  assert.equal(upgrade.grossRevenueCents, 9900);
  assert.equal(upgrade.checkoutUrl, 'https://buy.stripe.com/upgrade');
  assert.equal(upgrade.lastCheckoutSessionCreatedAt, 30);
});

test('arbitrary client references and unknown offers never become opportunity revenue evidence', () => {
  const result = summarizeStripeRevenue({
    paymentLinks: [
      { id: 'plink_unknown', metadata: { offer: 'mystery-offer' } },
    ],
    sessions: [
      { payment_status: 'paid', amount_total: 10000, client_reference_id: 'portal-user-public-key', created: 10 },
      { payment_status: 'paid', amount_total: 2500, payment_link: 'plink_unknown', created: 20 },
    ],
  });

  assert.equal(result.paidCheckouts, 2);
  assert.equal(result.byOpportunity.length, 0);
  assert.equal(result.byOffer.length, 1);
  assert.equal(result.byOffer[0].offer, 'mystery-offer');
});

test('prototype property names cannot become canonical opportunity evidence', () => {
  const result = summarizeStripeRevenue({
    sessions: [
      { payment_status: 'paid', amount_total: 5000, client_reference_id: 'money-run-3__constructor', created: 40 },
      { payment_status: 'paid', amount_total: 5000, client_reference_id: 'money-run-4__toString', created: 50 },
    ],
  });

  assert.equal(result.paidCheckouts, 2);
  assert.equal(result.byOpportunity.length, 0);
});

test('Stripe-unavailable fallback exposes an empty opportunity attribution set', async () => {
  const result = await collectStripeRevenueHints({ stripeClient: null });
  assert.equal(result.enabled, false);
  assert.deepEqual(result.byOpportunity, []);
});
