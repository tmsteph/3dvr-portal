import { runAutopilotCycle } from '../../src/money/autopilot.js';
import { makeStripeClient } from '../../src/billing/stripe.js';

function getBearerToken(req) {
  const header = String(req?.headers?.authorization || req?.headers?.Authorization || '').trim();
  if (!header) return '';
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : header;
}

function setHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
}

export function createMoneyStrategyHandler(options = {}) {
  const config = options.config || process.env;
  const runAutopilotImpl = options.runAutopilotImpl || runAutopilotCycle;
  const stripeClient = options.stripeClient || makeStripeClient(config);

  return async function handler(req, res) {
    setHeaders(res);
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const expectedToken = String(config.MONEY_STRATEGY_TOKEN || '').trim();
    const providedToken = getBearerToken(req);
    if (!expectedToken || providedToken !== expectedToken) {
      return res.status(401).json({ error: 'Unauthorized money strategy request.' });
    }

    try {
      const result = await runAutopilotImpl({
        env: config,
        stripeClient,
        dryRun: true,
        publishEnabled: false,
        vercelDeploy: false,
        promotionEnabled: false,
        autoDiscover: true
      });

      return res.status(200).json({
        ok: true,
        mode: 'strategy-read',
        runId: result.runId,
        generatedAt: result.generatedAt,
        market: result.market,
        keywords: result.keywords,
        analytics: result.analytics,
        revenue: result.revenue,
        offerSelection: result.offerSelection,
        topOpportunity: result.topOpportunity,
        monetization: result.monetization,
        warnings: result.warnings
      });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || 'Unable to build money strategy.'
      });
    }
  };
}

const handler = createMoneyStrategyHandler();
export default handler;
