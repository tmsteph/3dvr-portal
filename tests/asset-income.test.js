import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAssetCapsule,
  normalizeAssetEconomics,
  summarizeAssetCapsules
} from '../src/money-printer/assetIncome.js';

const now = new Date('2026-09-17T16:30:00Z');

function baseCapsule(overrides = {}) {
  return {
    id: 'capsule-audio-pack',
    sourceId: 'experiment-audio-pack',
    buyer: 'independent music producers',
    offer: 'Original synth preset pack',
    priceCents: 1200,
    priorityScore: 80,
    status: 'queued',
    createdAt: now.toISOString(),
    expiresAt: '2026-09-24T16:30:00Z',
    ...overrides
  };
}

test('asset economics normalize bounded rates, counts, and platform dependency', () => {
  const economics = normalizeAssetEconomics({
    revenueModel: 'marketplace_royalty',
    unitPriceCents: 299,
    unitsSold: 12.8,
    conversionRate: 2,
    repeatPurchaseRate: -1,
    platformDependencyScore: 140
  });

  assert.equal(economics.revenueModel, 'marketplace_royalty');
  assert.equal(economics.unitPriceCents, 299);
  assert.equal(economics.unitsSold, 13);
  assert.equal(economics.conversionRate, 1);
  assert.equal(economics.repeatPurchaseRate, 0);
  assert.equal(economics.platformDependencyScore, 100);
});

test('asset capsules preserve Venture Capsule safety policy and add a separate asset lane', () => {
  const capsule = createAssetCapsule(baseCapsule(), {
    revenueModel: 'one_time',
    distributionChannel: 'first-party store',
    unitPriceCents: 1200
  }, now);

  assert.equal(capsule.lane, 'asset');
  assert.equal(capsule.asset.unitPriceCents, 1200);
  assert.equal(capsule.asset.distributionChannel, 'first-party store');
  assert.equal(capsule.policy.externalWrites, 'approval-required');
  assert.equal(capsule.policy.maxAutomatedSpendCents, 0);
});

test('asset portfolio summary reports realized economics rather than vanity metrics', () => {
  const first = createAssetCapsule(baseCapsule({ id: 'capsule-one' }), {
    revenueModel: 'one_time',
    unitsSold: 20,
    grossRevenueCents: 20000,
    refundsCents: 1000,
    platformFeesCents: 2500,
    creationCostCents: 3000,
    supportCostEstimateCents: 1000,
    ownedAudienceCaptured: 8,
    platformDependencyScore: 80
  }, now);
  const second = createAssetCapsule(baseCapsule({ id: 'capsule-two' }), {
    revenueModel: 'subscription',
    unitsSold: 5,
    grossRevenueCents: 10000,
    platformFeesCents: 500,
    creationCostCents: 1000,
    supportCostEstimateCents: 500,
    ownedAudienceCaptured: 5,
    platformDependencyScore: 20
  }, now);

  const summary = summarizeAssetCapsules([first, second, baseCapsule({ id: 'service-only' })]);

  assert.equal(summary.assetCapsules, 2);
  assert.equal(summary.unitsSold, 25);
  assert.equal(summary.grossRevenueCents, 30000);
  assert.equal(summary.netBeforeTaxCents, 20500);
  assert.equal(summary.ownedAudienceCaptured, 13);
  assert.equal(summary.averagePlatformDependencyScore, 50);
});
