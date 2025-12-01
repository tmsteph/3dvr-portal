import assert from 'node:assert/strict';
import test from 'node:test';
import { computeStripeTotals, normalizeStripeAmount } from '../finance/stripe-totals.js';

test('computeStripeTotals sums gross, fees, net, and latest payout', () => {
  const reports = [
    {
      period: '2024-05',
      grossVolume: 1200,
      fees: 96.52,
      refunds: 12,
      payoutDate: '2024-06-01'
    },
    {
      period: '2024-06',
      gross: '1840.23',
      fees: '141.10',
      refunds: '0',
      payoutDate: '2024-07-01'
    }
  ];

  const totals = computeStripeTotals(reports);

  assert.equal(totals.gross, 3040.23);
  assert.equal(totals.fees, 237.62);
  assert.equal(totals.net, 2790.61);
  assert.ok(totals.lastPayout instanceof Date);
  assert.equal(totals.lastPayout.toISOString().slice(0, 10), '2024-07-01');
});

test('normalizeStripeAmount handles currency strings and invalid values', () => {
  assert.equal(normalizeStripeAmount('$1,234.56'), 1234.56);
  assert.equal(normalizeStripeAmount('abc'), 0);
  assert.equal(normalizeStripeAmount(undefined), 0);
});
