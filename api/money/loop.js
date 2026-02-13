import { runMoneyLoop } from '../../src/money/engine.js';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
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

export function createMoneyLoopHandler(options = {}) {
  const runLoopImpl = options.runLoopImpl || runMoneyLoop;
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  return async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
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
