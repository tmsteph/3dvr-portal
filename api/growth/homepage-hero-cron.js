import { runHomepageHeroCronCycle } from '../../src/growth/homepage-hero-cron.js';

function parseBoolean(value, fallback) {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function getBearerToken(req) {
  const headerValue = req?.headers?.authorization || req?.headers?.Authorization || '';
  const header = String(headerValue || '').trim();
  if (!header) {
    return '';
  }

  if (header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }

  return header;
}

function readQueryValue(req, key) {
  const value = req?.query?.[key];
  if (Array.isArray(value)) {
    return String(value[0] || '').trim();
  }
  return String(value || '').trim();
}

function readCronSecret(config = process.env) {
  return String(config.CRON_SECRET || config.GROWTH_HOMEPAGE_CRON_SECRET || '').trim();
}

function setHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
}

export function createHomepageHeroGrowthCronHandler(options = {}) {
  const runCycleImpl = options.runCycleImpl || runHomepageHeroCronCycle;
  const config = options.config || process.env;

  return async function handler(req, res) {
    setHeaders(res);

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const cronEnabled = parseBoolean(config.GROWTH_HOMEPAGE_CRON_ENABLED, false);
    if (!cronEnabled) {
      return res.status(403).json({
        error: 'Growth homepage cron is disabled. Set GROWTH_HOMEPAGE_CRON_ENABLED=true.'
      });
    }

    const expectedSecret = readCronSecret(config);
    const providedSecret = getBearerToken(req);
    if (!expectedSecret || providedSecret !== expectedSecret) {
      return res.status(401).json({
        error: 'Unauthorized cron trigger.'
      });
    }

    const dryRun = parseBoolean(
      readQueryValue(req, 'dryRun'),
      parseBoolean(config.GROWTH_HOMEPAGE_CRON_DRY_RUN, false)
    );

    try {
      const result = await runCycleImpl({
        dryRun,
        gunPeers: config.GROWTH_GUN_PEERS,
      });

      return res.status(200).json({
        ok: true,
        mode: 'cron',
        experiment: result.experiment,
        generatedAt: result.generatedAt,
        dryRun: result.dryRun,
        autoMode: result.autoMode,
        winnerBefore: result.winnerBefore,
        winnerAfter: result.winnerAfter,
        recommendedWinner: result.recommendedWinner,
        recommendedReason: result.recommendedReason,
        updatedBy: result.updatedBy,
        wouldPromote: result.wouldPromote,
        promoted: result.promoted,
        action: result.action,
        stats: result.stats,
        totals: result.totals,
        reason: result.reason,
      });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || 'Growth homepage cron run failed.'
      });
    }
  };
}

const handler = createHomepageHeroGrowthCronHandler();
export default handler;
