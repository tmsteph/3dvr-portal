export const HOMEPAGE_HERO_EXPERIMENT_ID = 'homepage-hero';
export const DEFAULT_GUN_PEERS = Object.freeze([
  'wss://relay.3dvr.tech/gun',
  'wss://gun-relay-3dvr.fly.dev/gun',
]);
export const EXPERIMENT_CONFIG_PATH = Object.freeze([
  '3dvr-portal',
  'growth',
  'experiments',
  HOMEPAGE_HERO_EXPERIMENT_ID,
  'config',
]);
export const EXPERIMENT_EVENT_PATH = Object.freeze([
  '3dvr-portal',
  'growth',
  'experiments',
  HOMEPAGE_HERO_EXPERIMENT_ID,
  'events',
]);
export const FEEDBACK_EVENT_PATH = Object.freeze([
  '3dvr-portal',
  'growth',
  'feedback',
  HOMEPAGE_HERO_EXPERIMENT_ID,
]);
export const MIN_COMPARISON_VIEWS = 5;
export const AUTO_PROMOTION_GAP = 0.05;
export const VARIANTS = Object.freeze({
  clarity: Object.freeze({ key: 'clarity', label: 'Clarity-first copy' }),
  traction: Object.freeze({ key: 'traction', label: 'Traction-first copy' }),
});

function valuesOf(input) {
  if (Array.isArray(input)) {
    return input;
  }
  if (!input || typeof input !== 'object') {
    return [];
  }
  return Object.values(input);
}

export function getNode(root, path) {
  return path.reduce(
    (node, key) => (node && typeof node.get === 'function' ? node.get(key) : null),
    root
  );
}

export function normalizeConfig(data = {}) {
  return {
    autoMode: typeof data.autoMode === 'boolean' ? data.autoMode : true,
    winner: VARIANTS[String(data.winner || '').trim()] ? String(data.winner).trim() : '',
    winnerReason: String(data.winnerReason || '').trim(),
    clarityWeight: Math.max(1, Number.parseInt(data.clarityWeight, 10) || 50),
    tractionWeight: Math.max(1, Number.parseInt(data.tractionWeight, 10) || 50),
    updatedAt: String(data.updatedAt || '').trim(),
    updatedBy: String(data.updatedBy || '').trim(),
  };
}

export function normalizeEvent(data = {}, id = '') {
  return {
    id: String(id || data.id || '').trim(),
    visitorId: String(data.visitorId || '').trim(),
    page: String(data.page || '').trim(),
    eventType: String(data.eventType || '').trim(),
    cta: String(data.cta || '').trim(),
    variant: VARIANTS[String(data.variant || '').trim()] ? String(data.variant).trim() : '',
    timestamp: String(data.timestamp || '').trim(),
    source: String(data.source || '').trim(),
  };
}

export function normalizeFeedback(data = {}, id = '') {
  return {
    id: String(id || data.id || '').trim(),
    visitorId: String(data.visitorId || '').trim(),
    page: String(data.page || '').trim(),
    sentiment: String(data.sentiment || '').trim(),
    variant: VARIANTS[String(data.variant || '').trim()] ? String(data.variant).trim() : '',
    prompt: String(data.prompt || '').trim(),
    timestamp: String(data.timestamp || '').trim(),
    source: String(data.source || '').trim(),
  };
}

export function computeStats(events = {}, feedback = {}) {
  const stats = {
    clarity: { views: 0, clicks: 0, clear: 0, unclear: 0 },
    traction: { views: 0, clicks: 0, clear: 0, unclear: 0 },
  };

  valuesOf(events).forEach((entry) => {
    if (!entry?.variant || !stats[entry.variant] || entry.page !== 'homepage') {
      return;
    }
    if (entry.eventType === 'view') {
      stats[entry.variant].views += 1;
    }
    if (entry.eventType === 'cta-click') {
      stats[entry.variant].clicks += 1;
    }
  });

  valuesOf(feedback).forEach((entry) => {
    if (!entry?.variant || !stats[entry.variant] || entry.page !== 'homepage') {
      return;
    }
    if (entry.sentiment === 'clear') {
      stats[entry.variant].clear += 1;
    }
    if (entry.sentiment === 'unclear') {
      stats[entry.variant].unclear += 1;
    }
  });

  return stats;
}

export function computeVariantScore(stat = {}) {
  const clickRate = stat.views ? stat.clicks / stat.views : 0;
  const feedbackTotal = (stat.clear || 0) + (stat.unclear || 0);
  const clarityRate = feedbackTotal ? (stat.clear || 0) / feedbackTotal : 0;
  return (clickRate * 0.7) + (clarityRate * 0.3);
}

export function pickRecommendedWinner(stats, options = {}) {
  const minComparisonViews = Number.parseInt(options.minComparisonViews, 10) || MIN_COMPARISON_VIEWS;
  const autoPromotionGap = Number.parseFloat(options.autoPromotionGap) || AUTO_PROMOTION_GAP;

  const entries = Object.entries(stats || {})
    .map(([key, stat]) => ({
      key,
      stat,
      clickRate: stat.views ? stat.clicks / stat.views : 0,
      clarityRate: (stat.clear + stat.unclear) ? stat.clear / (stat.clear + stat.unclear) : 0,
      score: computeVariantScore(stat),
    }))
    .filter((entry) => entry.stat.views >= minComparisonViews);

  if (entries.length < 2) {
    return null;
  }

  entries.sort((left, right) => right.score - left.score);
  const [best, second] = entries;
  if (!best || !second || (best.score - second.score) < autoPromotionGap) {
    return null;
  }

  return {
    key: best.key,
    reason: `Auto-promoted ${best.key} from stronger click and clarity signals.`,
    signature: `${best.key}:${best.score.toFixed(4)}:${second.score.toFixed(4)}:${best.stat.views}:${second.stat.views}`,
    best,
    second,
  };
}

export function summarizeStats(stats) {
  return {
    totalViews: (stats?.clarity?.views || 0) + (stats?.traction?.views || 0),
    totalClicks: (stats?.clarity?.clicks || 0) + (stats?.traction?.clicks || 0),
    totalFeedback:
      (stats?.clarity?.clear || 0) +
      (stats?.clarity?.unclear || 0) +
      (stats?.traction?.clear || 0) +
      (stats?.traction?.unclear || 0),
  };
}
