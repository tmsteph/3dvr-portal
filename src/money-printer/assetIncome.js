import { normalizeVentureCapsule } from './ventureCapsules.js';

export const ASSET_REVENUE_MODELS = Object.freeze([
  'one_time',
  'subscription',
  'usage',
  'marketplace_royalty',
  'pay_per_use',
  'hybrid'
]);

function clean(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function cents(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

function count(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

function ratio(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
}

function score(value, fallback = 50) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : fallback;
}

export function normalizeAssetEconomics(input = {}) {
  const revenueModel = ASSET_REVENUE_MODELS.includes(clean(input.revenueModel).toLowerCase())
    ? clean(input.revenueModel).toLowerCase()
    : 'one_time';

  return {
    revenueModel,
    distributionChannel: clean(input.distributionChannel),
    unitPriceCents: cents(input.unitPriceCents),
    estimatedUnitCostCents: cents(input.estimatedUnitCostCents),
    creationCostCents: cents(input.creationCostCents),
    supportCostEstimateCents: cents(input.supportCostEstimateCents),
    unitsSold: count(input.unitsSold),
    grossRevenueCents: cents(input.grossRevenueCents),
    refundsCents: cents(input.refundsCents),
    platformFeesCents: cents(input.platformFeesCents),
    trafficOrImpressions: count(input.trafficOrImpressions),
    conversionRate: ratio(input.conversionRate),
    repeatPurchaseRate: ratio(input.repeatPurchaseRate),
    ownedAudienceCaptured: count(input.ownedAudienceCaptured),
    platformDependencyScore: score(input.platformDependencyScore)
  };
}

export function createAssetCapsule(capsuleInput = {}, assetInput = {}, now = new Date()) {
  const capsule = normalizeVentureCapsule(capsuleInput, now);
  return {
    ...capsule,
    lane: 'asset',
    asset: normalizeAssetEconomics({
      unitPriceCents: capsule.priceCents,
      ...assetInput
    })
  };
}

export function isAssetCapsule(capsule = {}) {
  return capsule?.lane === 'asset' || Boolean(capsule?.asset);
}

export function summarizeAssetCapsules(capsules = []) {
  const assets = capsules.filter(isAssetCapsule).map((capsule) => ({
    ...capsule,
    asset: normalizeAssetEconomics(capsule.asset)
  }));

  const totals = assets.reduce((summary, capsule) => {
    const asset = capsule.asset;
    summary.unitsSold += asset.unitsSold;
    summary.grossRevenueCents += asset.grossRevenueCents;
    summary.refundsCents += asset.refundsCents;
    summary.platformFeesCents += asset.platformFeesCents;
    summary.creationCostCents += asset.creationCostCents;
    summary.supportCostEstimateCents += asset.supportCostEstimateCents;
    summary.ownedAudienceCaptured += asset.ownedAudienceCaptured;
    return summary;
  }, {
    unitsSold: 0,
    grossRevenueCents: 0,
    refundsCents: 0,
    platformFeesCents: 0,
    creationCostCents: 0,
    supportCostEstimateCents: 0,
    ownedAudienceCaptured: 0
  });

  const netBeforeTaxCents = totals.grossRevenueCents
    - totals.refundsCents
    - totals.platformFeesCents
    - totals.creationCostCents
    - totals.supportCostEstimateCents;

  const averagePlatformDependencyScore = assets.length
    ? Math.round(assets.reduce((sum, capsule) => sum + capsule.asset.platformDependencyScore, 0) / assets.length)
    : 0;

  return {
    assetCapsules: assets.length,
    ...totals,
    netBeforeTaxCents,
    averagePlatformDependencyScore
  };
}
