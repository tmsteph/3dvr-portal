import { runMoneyLoop } from '../../src/money/engine.js';
import { runAutopilotCycle } from '../../src/money/autopilot.js';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function normalizeRequestBody(body = {}) {
  const payload = body && typeof body === 'object' ? body : {};
  return {
    market: payload.market,
    keywords: payload.keywords,
    channels: payload.channels,
    budget: payload.budget,
    limit: payload.limit,
    runId: payload.runId,
    openAiApiKey: payload.openAiApiKey,
    openAiModel: payload.openAiModel
  };
}

function parseBooleanQuery(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

function getAutopilotToken(req) {
  const headerValue = req?.headers?.['x-autopilot-token']
    || req?.headers?.['X-Autopilot-Token']
    || req?.headers?.authorization
    || req?.headers?.Authorization;

  const header = String(headerValue || '').trim();
  if (header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  if (header) {
    return header;
  }
  return String(req?.query?.token || '').trim();
}

export function createMoneyLoopHandler(options = {}) {
  const runLoopImpl = options.runLoopImpl || runMoneyLoop;
  const runAutopilotImpl = options.runAutopilotImpl || runAutopilotCycle;
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  return async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method === 'GET') {
      const mode = String(req?.query?.mode || '').trim().toLowerCase();
      if (mode !== 'autopilot') {
        return res.status(200).json({
          ok: true,
          endpoint: 'money-loop',
          methods: ['POST', 'GET?mode=autopilot']
        });
      }

      const expectedToken = String(process.env.MONEY_AUTOPILOT_TOKEN || '').trim();
      if (!expectedToken) {
        return res.status(500).json({ error: 'MONEY_AUTOPILOT_TOKEN is not configured.' });
      }

      const providedToken = getAutopilotToken(req);
      if (!providedToken || providedToken !== expectedToken) {
        return res.status(401).json({ error: 'Unauthorized autopilot trigger.' });
      }

      try {
        const result = await runAutopilotImpl({
          fetchImpl,
          dryRun: parseBooleanQuery(req?.query?.dryRun)
        });

        return res.status(200).json({
          mode: 'autopilot',
          ...result,
          createdAt: Date.now()
        });
      } catch (error) {
        return res.status(500).json({
          error: error?.message || 'Autopilot run failed.'
        });
      }
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const payload = normalizeRequestBody(req.body);

    if (typeof payload.market !== 'undefined' && typeof payload.market !== 'string') {
      return res.status(400).json({ error: 'market must be a string when provided.' });
    }

    try {
      const result = await runLoopImpl(payload, {
        fetchImpl,
        openAiApiKey: process.env.OPENAI_API_KEY,
        openAiModel: process.env.OPENAI_MODEL
      });

      return res.status(200).json({
        ...result,
        createdAt: Date.now()
      });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || 'Money loop run failed.'
      });
    }
  };
}

const handler = createMoneyLoopHandler();
export default handler;
