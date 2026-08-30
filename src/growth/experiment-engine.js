export const SAFE_AUTO_PROMOTION_RISK_CLASSES = Object.freeze([
  'copy',
  'layout',
  'cta',
  'discovery',
]);

export const DEFAULT_MIN_VIEWS_PER_VARIANT = 25;
export const DEFAULT_MIN_CONVERSIONS = 3;
export const DEFAULT_MIN_RELATIVE_LIFT = 0.1;
export const DEFAULT_Z_THRESHOLD = 1.96;

function valuesOf(input) {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== 'object') return [];
  return Object.values(input);
}

function hashUnitInterval(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

export function normalizeExperimentDefinition(definition = {}) {
  const variants = Array.isArray(definition.variants)
    ? definition.variants.filter((variant) => variant?.key)
    : [];

  return {
    id: String(definition.id || '').trim(),
    page: String(definition.page || '').trim(),
    riskClass: String(definition.riskClass || '').trim(),
    conversionEvent: String(definition.conversionEvent || '').trim(),
    variants: variants.map((variant) => ({
      ...variant,
      key: String(variant.key).trim(),
      weight: Math.max(1, Number(variant.weight) || 1),
    })),
    minViewsPerVariant: Math.max(
      1,
      Number(definition.minViewsPerVariant) || DEFAULT_MIN_VIEWS_PER_VARIANT
    ),
    minConversions: Math.max(
      1,
      Number(definition.minConversions) || DEFAULT_MIN_CONVERSIONS
    ),
    minRelativeLift: Math.max(
      0,
      Number(definition.minRelativeLift) || DEFAULT_MIN_RELATIVE_LIFT
    ),
    zThreshold: Math.max(
      0,
      Number(definition.zThreshold) || DEFAULT_Z_THRESHOLD
    ),
  };
}

export function canAutoPromote(definition = {}) {
  const normalized = normalizeExperimentDefinition(definition);
  return SAFE_AUTO_PROMOTION_RISK_CLASSES.includes(normalized.riskClass);
}

export function experimentPath(experimentId, section) {
  return ['3dvr-portal', 'growth', 'experiments', String(experimentId || '').trim(), section];
}

export function assignVariant(definition, visitorId, winner = '') {
  const normalized = normalizeExperimentDefinition(definition);
  const winnerKey = String(winner || '').trim();
  if (normalized.variants.some((variant) => variant.key === winnerKey)) {
    return winnerKey;
  }
  if (!normalized.variants.length) return '';

  const totalWeight = normalized.variants.reduce((sum, variant) => sum + variant.weight, 0);
  let cursor = hashUnitInterval(`${normalized.id}:${visitorId}`) * totalWeight;
  for (const variant of normalized.variants) {
    cursor -= variant.weight;
    if (cursor < 0) return variant.key;
  }
  return normalized.variants.at(-1)?.key || '';
}

export function normalizeExperimentEvent(definition, data = {}, id = '') {
  const normalized = normalizeExperimentDefinition(definition);
  const variant = String(data.variant || '').trim();
  return {
    id: String(id || data.id || '').trim(),
    visitorId: String(data.visitorId || '').trim(),
    page: String(data.page || '').trim(),
    experimentId: String(data.experimentId || '').trim(),
    eventType: String(data.eventType || '').trim(),
    variant: normalized.variants.some((item) => item.key === variant) ? variant : '',
    cta: String(data.cta || '').trim(),
    source: String(data.source || '').trim(),
    timestamp: String(data.timestamp || '').trim(),
  };
}

export function computeConversionStats(definition, events = {}) {
  const normalized = normalizeExperimentDefinition(definition);
  const visitorSets = Object.fromEntries(normalized.variants.map((variant) => [
    variant.key,
    { views: new Set(), conversions: new Set() },
  ]));

  valuesOf(events).forEach((entry) => {
    if (!entry || entry.experimentId !== normalized.id || entry.page !== normalized.page) return;
    if (!visitorSets[entry.variant]) return;
    const visitorKey = String(entry.visitorId || entry.id || '').trim();
    if (!visitorKey) return;
    if (entry.eventType === 'view') visitorSets[entry.variant].views.add(visitorKey);
    if (entry.eventType === normalized.conversionEvent) visitorSets[entry.variant].conversions.add(visitorKey);
  });

  return Object.fromEntries(Object.entries(visitorSets).map(([key, sets]) => {
    const views = sets.views.size;
    const conversions = [...sets.conversions].filter((visitorId) => sets.views.has(visitorId)).length;
    return [key, {
      views,
      conversions,
      conversionRate: views ? conversions / views : 0,
    }];
  }));
}

function twoProportionZScore(best, second) {
  const pooledViews = best.views + second.views;
  if (!pooledViews) return 0;
  const pooledRate = (best.conversions + second.conversions) / pooledViews;
  const standardError = Math.sqrt(
    pooledRate * (1 - pooledRate) * ((1 / best.views) + (1 / second.views))
  );
  if (!standardError) return 0;
  return (best.conversionRate - second.conversionRate) / standardError;
}

export function pickConversionWinner(definition, stats = {}, options = {}) {
  const normalized = normalizeExperimentDefinition({ ...definition, ...options });
  const entries = Object.entries(stats)
    .map(([key, stat]) => ({ key, ...stat }))
    .filter((entry) => entry.views >= normalized.minViewsPerVariant)
    .sort((left, right) => right.conversionRate - left.conversionRate);

  if (entries.length < 2) return null;
  const [best, second] = entries;
  if (best.conversions < normalized.minConversions) return null;
  if (best.conversionRate <= second.conversionRate) return null;

  const relativeLift = second.conversionRate > 0
    ? (best.conversionRate - second.conversionRate) / second.conversionRate
    : 1;
  const zScore = twoProportionZScore(best, second);
  if (relativeLift < normalized.minRelativeLift || zScore < normalized.zThreshold) return null;

  return {
    key: best.key,
    best,
    second,
    relativeLift,
    zScore,
    signature: `${best.key}:${best.views}:${best.conversions}:${second.key}:${second.views}:${second.conversions}`,
    reason: `Auto-promoted ${best.key}: ${(best.conversionRate * 100).toFixed(1)}% vs ${(second.conversionRate * 100).toFixed(1)}% on ${normalized.conversionEvent}.`,
  };
}
