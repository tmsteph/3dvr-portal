import { runMarketPulseCycle } from '../../src/growth/market-pulse.js';

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
  return String(config.CRON_SECRET || config.GROWTH_MARKET_PULSE_CRON_SECRET || '').trim();
}

function setHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
}

export function createMarketPulseCronHandler(options = {}) {
  const runCycleImpl = options.runCycleImpl || runMarketPulseCycle;
  const config = options.config || process.env;

  return async function handler(req, res) {
    setHeaders(res);

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const cronEnabled = parseBoolean(config.GROWTH_MARKET_PULSE_CRON_ENABLED, false);
    if (!cronEnabled) {
      return res.status(403).json({
        error: 'Growth market pulse cron is disabled. Set GROWTH_MARKET_PULSE_CRON_ENABLED=true.'
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
      parseBoolean(config.GROWTH_MARKET_PULSE_CRON_DRY_RUN, false)
    );
    const market = readQueryValue(req, 'market') || config.GROWTH_MARKET_PULSE_MARKET;
    const keywords = readQueryValue(req, 'keywords') || config.GROWTH_MARKET_PULSE_KEYWORDS;
    const channels = readQueryValue(req, 'channels') || config.GROWTH_MARKET_PULSE_CHANNELS;
    const rawLimit = readQueryValue(req, 'limit') || config.GROWTH_MARKET_PULSE_LIMIT || '';
    const limit = rawLimit ? Number(rawLimit) : undefined;

    try {
      const result = await runCycleImpl({
        dryRun,
        market,
        keywords,
        channels,
        limit: Number.isFinite(limit) ? limit : undefined,
        gunPeers: config.GROWTH_GUN_PEERS,
      });

      return res.status(200).json({
        ok: true,
        mode: 'cron',
        runId: result.runId,
        generatedAt: result.generatedAt,
        dryRun: result.dryRun,
        market: result.profile?.market || '',
        marketFit: result.marketFit,
        signalsAnalyzed: result.signalsAnalyzed,
        topOpportunity: result.topOpportunity,
        directoryListings: result.directoryListings,
        outreachDraftCount: Array.isArray(result.outreachDrafts) ? result.outreachDrafts.length : 0,
        testCount: Array.isArray(result.tests) ? result.tests.length : 0,
        approvalsRequired: result.approvalsRequired,
        persist: result.persist,
        warnings: result.warnings,
      });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || 'Growth market pulse cron run failed.'
      });
    }
  };
}

const handler = createMarketPulseCronHandler();
export default handler;
