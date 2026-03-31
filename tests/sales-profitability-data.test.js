import assert from 'node:assert/strict';
import test from 'node:test';

import {
  estimateRecurringRevenue,
  normalizeStripeMetricsRecord,
  normalizeWeeklyPlan,
  summarizeLinkedBilling,
} from '../sales/scoreboard-data.js';

test('profitability data helpers dedupe linked billing records by account identity', () => {
  const summary = summarizeLinkedBilling({
    'alias:builder-owner': {
      alias: 'builder-owner',
      plan: 'builder',
      tier: 'builder',
      updatedAt: 10,
    },
    'pub:builder-owner': {
      alias: 'builder-owner',
      pub: '~builder',
      plan: 'builder',
      tier: 'builder',
      updatedAt: 20,
    },
    'alias:embedded-team': {
      alias: 'embedded-team',
      plan: 'embedded',
      tier: 'embedded',
      updatedAt: 30,
    },
    'alias:starter-supporter': {
      alias: 'starter-supporter',
      plan: 'starter',
      tier: 'supporter',
      updatedAt: 40,
    },
    'alias:free-user': {
      alias: 'free-user',
      plan: 'free',
      tier: 'account',
      updatedAt: 50,
    },
  });

  assert.equal(summary.linkedAccounts, 4);
  assert.equal(summary.linkedPaidCustomers, 3);
  assert.equal(summary.builderCustomers, 1);
  assert.equal(summary.embeddedCustomers, 1);
});

test('profitability data helpers keep weekly plan manual fields only', () => {
  const plan = normalizeWeeklyPlan({
    outreachGoal: '25',
    replyGoal: '5',
    closeGoal: '2',
    depositGoal: '1',
    depositCount: '3',
    weeklyCashCollected: '750',
    productMove: 'Tighten billing handoff',
    revenueMove: 'Send two Builder asks',
    systemMove: 'Document Friday review',
    blocker: 'Need faster follow-up',
    builderCustomers: 99,
    embeddedCustomers: 99,
  });

  assert.deepEqual(plan, {
    outreachGoal: 25,
    replyGoal: 5,
    closeGoal: 2,
    depositGoal: 1,
    depositCount: 3,
    weeklyCashCollected: 750,
    productMove: 'Tighten billing handoff',
    revenueMove: 'Send two Builder asks',
    systemMove: 'Document Friday review',
    blocker: 'Need faster follow-up',
  });
});

test('profitability data helpers normalize stripe metrics and estimate linked MRR', () => {
  const metrics = normalizeStripeMetricsRecord({
    activeSubscribers: '7',
    updatedAt: '2026-03-31T12:00:00.000Z',
  });

  assert.equal(metrics.activeSubscribers, 7);
  assert.equal(metrics.updatedAt, '2026-03-31T12:00:00.000Z');
  assert.equal(estimateRecurringRevenue({ builderCustomers: 2, embeddedCustomers: 3 }), 700);
});
