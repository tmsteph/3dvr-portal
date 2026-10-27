import { runAutopilotCycle } from './autopilot.js';
import { makeStripeClient } from '../billing/stripe.js';

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

function readCronSecret(config = process.env) {
  return String(config.CRON_SECRET || config.MONEY_AUTOPILOT_CRON_SECRET || '').trim();
}

function setHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
}

export function createMoneyAutopilotCronHandler(options = {}) {
  const runAutopilotImpl = options.runAutopilotImpl || runAutopilotCycle;
  const config = options.config || process.env;
  const stripeClient = options.stripeClient || makeStripeClient(config);
  // Prevent overlapping authenticated calls within this handler instance.
  // Cross-process and cross-host scheduling still require a separate single-writer gate.
  let inFlight = false;

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

    // Enforce authorization at the API boundary too: callers must not bypass the
    // systemd timer's separate default-off gate by invoking this route directly.
    if (!parseBoolean(config.MONEY_AUTOPILOT_CRON_RUN_AUTHORIZED, false)) {
      return res.status(403).json({
        error: 'Money autopilot cron awaits explicit run authorization.'
      });
    }

    const expectedSecret = readCronSecret(config);
    const providedSecret = getBearerToken(req);
    if (!expectedSecret || providedSecret !== expectedSecret) {
      return res.status(401).json({
        error: 'Unauthorized cron trigger.'
      });
    }

    if (inFlight) {
      return res.status(409).json({ error: 'Money autopilot cron already running.' });
    }
    inFlight = true;

    // This scheduled endpoint is research-only. Never allow URL parameters or
    // environment defaults to turn it into a publisher or outbound sender.
    // The normal money loop already gathers demand signals. A caller-supplied
    // autoDiscover=true would trigger an additional network discovery pass,
    // potentially consuming unreviewed provider quotas. Keep cron bounded.

    try {
      const result = await runAutopilotImpl({
        dryRun: true,
        // A dry-run can still call paid OpenAI synthesis. Scheduled research
        // must remain no-cost until spending is separately authorized.
        disablePaidAi: true,
        autoDiscover: false,
        publishEnabled: false,
        vercelDeploy: false,
        promotionEnabled: false,
        stripeClient
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
    } finally {
      inFlight = false;
    }
  };
}

