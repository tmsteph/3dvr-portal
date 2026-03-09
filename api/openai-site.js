export const DEFAULT_MODEL = 'gpt-5.4';

export const SITE_BUILDER_CAPABILITIES = Object.freeze({
  liveWebSearch: true
});

const SITE_RESPONSE_SCHEMA = {
  name: 'site_builder_response',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'summary', 'html'],
    properties: {
      title: { type: 'string' },
      summary: { type: 'string' },
      html: { type: 'string' }
    }
  }
};

function resolveDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatIsoDate(value) {
  return resolveDate(value).toISOString().slice(0, 10);
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export function buildPrompt(now = new Date()) {
  const currentDate = resolveDate(now);
  const currentDateLabel = formatIsoDate(currentDate);
  const currentYear = currentDate.getUTCFullYear();

  return [
    'You are the 3dvr portal website builder and design partner.',
    `Today is ${currentDateLabel}. The current year is ${currentYear}.`,
    'Return concise, production-ready HTML with inline CSS only.',
    'Keep markup semantic, accessible, and mobile-friendly.',
    'Do not reference external assets or scripts.',
    'Use calming palettes with sufficient contrast unless the prompt asks otherwise.',
    `If you include copyright, trademark, or footer-year copy, use ${currentYear} or a range ending in ${currentYear} unless the user explicitly asks for a different year.`,
    'Never default to stale years like 2023 for date-sensitive footer or legal copy.',
    'Always write a specific summary that explains the page structure, tone, and any notable footer or legal-copy decisions.',
    'Do not claim live web research or real-time internet access unless tool results are explicitly provided.'
  ].join(' ');
}

function extractResponseText(responseData) {
  const outputItems = Array.isArray(responseData?.output) ? responseData.output : [];

  for (const item of outputItems) {
    if (item?.type !== 'message') continue;
    const contentItems = Array.isArray(item.content) ? item.content : [];
    for (const content of contentItems) {
      if (content?.type !== 'output_text') continue;
      const text = typeof content.text === 'string' ? content.text.trim() : '';
      if (text) {
        return text;
      }
    }
  }

  return '';
}

function extractWebSources(responseData) {
  const outputItems = Array.isArray(responseData?.output) ? responseData.output : [];
  const sources = new Map();

  for (const item of outputItems) {
    if (item?.type !== 'web_search_call') continue;
    const sourceList = Array.isArray(item?.action?.sources) ? item.action.sources : [];
    for (const source of sourceList) {
      const url = String(source?.url || '').trim();
      if (!url || sources.has(url)) {
        continue;
      }
      sources.set(url, {
        title: String(source?.title || source?.site || url).trim(),
        url
      });
    }
  }

  return Array.from(sources.values());
}

function parseResponsePayload(responseData) {
  const raw = extractResponseText(responseData);
  if (!raw) {
    throw new Error('No content returned from OpenAI.');
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed.html) {
      throw new Error('HTML content missing from OpenAI response.');
    }

    return {
      title: parsed.title || 'AI Generated Site',
      html: parsed.html,
      summary: parsed.summary || 'Generated site content ready to publish.',
    };
  } catch (err) {
    throw new Error(`Failed to parse OpenAI response: ${err.message}`);
  }
}

export function buildOpenAiRequest({ model, prompt, now = new Date(), useWebSearch = false }) {
  const requestBody = {
    model,
    instructions: buildPrompt(now),
    input: prompt,
    store: false,
    temperature: 0.35,
    text: {
      format: {
        type: 'json_schema',
        ...SITE_RESPONSE_SCHEMA
      }
    }
  };

  if (useWebSearch) {
    requestBody.tools = [{ type: 'web_search' }];
    requestBody.include = ['web_search_call.action.sources'];
  }

  return requestBody;
}

export function createSiteGeneratorHandler(options = {}) {
  const {
    apiKey = process.env.OPENAI_API_KEY,
    model = String(options.model || process.env.OPENAI_SITE_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
    fetchImpl = globalThis.fetch,
    now = () => new Date()
  } = options;

  return async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { prompt, apiKey: requestApiKey, useWebSearch } = req.body || {};
    const effectiveApiKey = typeof requestApiKey === 'string' && requestApiKey.trim()
      ? requestApiKey.trim()
      : apiKey;

    if (!effectiveApiKey) {
      return res.status(500).json({ error: 'OpenAI API key is not configured.' });
    }

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'A prompt string is required.' });
    }

    try {
      const currentDate = resolveDate(now());
      const shouldUseWebSearch = SITE_BUILDER_CAPABILITIES.liveWebSearch && useWebSearch === true;
      const requestBody = buildOpenAiRequest({
        model,
        prompt,
        now: currentDate,
        useWebSearch: shouldUseWebSearch
      });

      const response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${effectiveApiKey}`,
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: errorText || 'OpenAI error' });
      }

      const data = await response.json();
      const parsed = parseResponsePayload(data);
      const sources = shouldUseWebSearch ? extractWebSources(data) : [];

      return res.status(200).json({
        ...parsed,
        model,
        createdAt: currentDate.getTime(),
        currentYear: currentDate.getUTCFullYear(),
        liveWebSearch: SITE_BUILDER_CAPABILITIES.liveWebSearch,
        usedWebSearch: shouldUseWebSearch,
        sources
      });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Unexpected error during site generation.' });
    }
  };
}

const handler = createSiteGeneratorHandler();
export default handler;
