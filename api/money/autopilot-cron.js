import { runAutopilotCycle } from '../../src/money/autopilot.js';

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
  return String(config.CRON_SECRET || config.MONEY_AUTOPILOT_CRON_SECRET || '').trim();
}

function setHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
}

export function createMoneyAutopilotCronHandler(options = {}) {
  const runAutopilotImpl = options.runAutopilotImpl || runAutopilotCycle;
  const config = options.config || process.env;

  return async function handler(req, res) {
    setHeaders(res);

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const cronEnabled = parseBoolean(config.MONEY_AUTOPILOT_CRON_ENABLED, false);
    if (!cronEnabled) {
      return res.status(403).json({
        error: 'Money autopilot cron is disabled. Set MONEY_AUTOPILOT_CRON_ENABLED=true.'
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
      parseBoolean(config.MONEY_AUTOPILOT_CRON_DRY_RUN, false)
    );
    const autoDiscover = parseBoolean(readQueryValue(req, 'autoDiscover'), undefined);
    const publishEnabled = parseBoolean(readQueryValue(req, 'publish'), undefined);
    const vercelDeploy = parseBoolean(readQueryValue(req, 'vercelDeploy'), undefined);
    const promotionEnabled = parseBoolean(readQueryValue(req, 'promotion'), undefined);

    try {
      const result = await runAutopilotImpl({
        dryRun,
        autoDiscover,
        publishEnabled,
        vercelDeploy,
        promotionEnabled
      });

      return res.status(200).json({
        ok: true,
        mode: 'cron',
        runId: result.runId,
        generatedAt: result.generatedAt,
        topOpportunity: result.topOpportunity,
        signalsAnalyzed: result.signalsAnalyzed,
        publish: result.publish,
        promotion: result.promotion,
        monetization: result.monetization,
        warnings: result.warnings
      });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || 'Autopilot cron run failed.'
      });
    }
  };
}

const handler = createMoneyAutopilotCronHandler();
export default handler;
