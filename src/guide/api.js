export const DEFAULT_GUIDE_MODEL = 'gpt-4.1-mini';
export const SUPPORTED_GUIDE_MODELS = Object.freeze([
  'gpt-4o-mini',
  'gpt-4.1-mini',
  'gpt-5.4-mini',
  'gpt-5.4'
]);

const GUIDE_SCHEMA = {
  name: 'portal_guide_response',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['routeId', 'label', 'title', 'copy', 'steps'],
    properties: {
      routeId: { type: 'string' },
      label: { type: 'string' },
      title: { type: 'string' },
      copy: { type: 'string' },
      steps: {
        type: 'array',
        items: { type: 'string' }
      }
    }
  }
};

const FALLBACK_ROUTE = Object.freeze({
  id: 'life',
  label: 'Life path',
  title: 'Daily Direction',
  copy: 'Start by sorting life, attention, and the one next step for today.',
  steps: [
    'Do a 3-minute check-in.',
    'Name what needs attention.',
    'Pick one small move for today.'
  ]
});

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function resolveDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatIsoDate(value) {
  return resolveDate(value).toISOString().slice(0, 10);
}

function isGpt5FamilyModel(model) {
  return /^gpt-5([.-]|$)/.test(String(model || '').trim());
}

function normalizeRequestedModel(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return DEFAULT_GUIDE_MODEL;
  }

  return SUPPORTED_GUIDE_MODELS.includes(normalized) ? normalized : '';
}

function clean(value, maxLength = 2000) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function normalizeRoutes(value) {
  const source = Array.isArray(value) ? value : [];
  const routes = source
    .map(route => ({
      id: clean(route?.id, 40),
      room: clean(route?.room, 40),
      title: clean(route?.title, 120),
      label: clean(route?.label, 80),
      copy: clean(route?.copy, 220),
      search: clean(route?.search, 160),
      keywords: Array.isArray(route?.keywords)
        ? route.keywords.map(keyword => clean(keyword, 80)).filter(Boolean).slice(0, 12)
        : []
    }))
    .filter(route => route.id && route.title)
    .slice(0, 12);

  return routes.length ? routes : [FALLBACK_ROUTE];
}

function findRouteById(routes, routeId) {
  const normalized = clean(routeId, 40).toLowerCase();
  return routes.find(route => route.id.toLowerCase() === normalized)
    || routes.find(route => route.id === FALLBACK_ROUTE.id)
    || routes[0]
    || FALLBACK_ROUTE;
}

function normalizeStringList(value, fallback, { min = 3, max = 3 } = {}) {
  const source = Array.isArray(value) ? value : [];
  const normalized = source
    .map(item => clean(item, 120))
    .filter(Boolean)
    .slice(0, max);

  fallback.forEach((item) => {
    if (normalized.length < min) {
      normalized.push(item);
    }
  });

  return normalized.slice(0, max);
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

function parseJsonResponse(responseData) {
  const raw = extractResponseText(responseData);
  if (!raw) {
    throw new Error('No content returned from OpenAI.');
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse OpenAI response: ${error.message}`);
  }
}

export function buildGuideInstructions(now = new Date()) {
  const currentDate = resolveDate(now);

  return [
    'You are the 3DVR Portal guide.',
    `Today is ${formatIsoDate(currentDate)}.`,
    'Your job is to read one messy user prompt and choose the best existing portal destination.',
    'Choose only one routeId from the provided routes. Never invent a route.',
    'Give direct, practical guidance. No hype, no sales copy, no long explanation.',
    'Write at about a third-grade reading level. Short words. Short sentences.',
    'The user may feel overwhelmed. Make the next step feel easy.',
    'If the user asks for money, income, clients, sales, bills, or work, usually choose money or work.',
    'If the user asks for purpose, meaning, life direction, or being meant for more, usually choose purpose or life.',
    'If the user has a messy idea or frustration, usually choose idea.',
    'If the user wants to build a page, app, or project, usually choose build.',
    'The copy field must be one short sentence. Each step must be one short action.',
    'Return only the JSON object requested by the schema.'
  ].join(' ');
}

function buildGuideInput({ prompt, routes }) {
  return JSON.stringify({
    prompt: clean(prompt, 800),
    routes: normalizeRoutes(routes)
  }, null, 2);
}

export function buildGuideOpenAiRequest({
  prompt,
  routes,
  model = DEFAULT_GUIDE_MODEL,
  now = new Date()
}) {
  const requestBody = {
    model,
    instructions: buildGuideInstructions(now),
    input: buildGuideInput({ prompt, routes }),
    store: false,
    text: {
      format: {
        type: 'json_schema',
        ...GUIDE_SCHEMA
      }
    }
  };

  if (!isGpt5FamilyModel(model)) {
    requestBody.temperature = 0.25;
  }

  return requestBody;
}

export function normalizeGuideResult(value = {}, routes = []) {
  const normalizedRoutes = normalizeRoutes(routes);
  const route = findRouteById(normalizedRoutes, value?.routeId);

  return {
    routeId: route.id,
    label: clean(value?.label, 80) || route.label || FALLBACK_ROUTE.label,
    title: clean(value?.title, 120) || route.title || FALLBACK_ROUTE.title,
    copy: clean(value?.copy, 220) || route.copy || FALLBACK_ROUTE.copy,
    steps: normalizeStringList(value?.steps, route.steps || FALLBACK_ROUTE.steps, { min: 3, max: 3 })
  };
}

export function createGuideHandler(options = {}) {
  const {
    apiKey = process.env.OPENAI_API_KEY,
    model = normalizeRequestedModel(options.model || process.env.OPENAI_GUIDE_MODEL || DEFAULT_GUIDE_MODEL) || DEFAULT_GUIDE_MODEL,
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

    const {
      prompt,
      routes,
      apiKey: requestApiKey,
      model: requestedModel
    } = req.body || {};
    const effectiveApiKey = typeof requestApiKey === 'string' && requestApiKey.trim()
      ? requestApiKey.trim()
      : apiKey;
    const effectiveModel = requestedModel === undefined
      ? model
      : normalizeRequestedModel(requestedModel);

    if (!effectiveApiKey) {
      return res.status(500).json({ error: 'OpenAI API key is not configured.' });
    }

    if (!effectiveModel) {
      return res.status(400).json({
        error: `Unsupported model. Choose one of: ${SUPPORTED_GUIDE_MODELS.join(', ')}.`
      });
    }

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'A guide prompt is required.' });
    }

    try {
      const currentDate = resolveDate(now());
      const routeList = normalizeRoutes(routes);
      const requestBody = buildGuideOpenAiRequest({
        prompt,
        routes: routeList,
        model: effectiveModel,
        now: currentDate
      });

      const response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${effectiveApiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: errorText || 'OpenAI error' });
      }

      const data = await response.json();
      const parsed = parseJsonResponse(data);

      return res.status(200).json({
        mode: 'guide',
        guide: normalizeGuideResult(parsed, routeList),
        model: effectiveModel,
        createdAt: currentDate.getTime()
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Unexpected error during Guide routing.' });
    }
  };
}

const handler = createGuideHandler();
export default handler;
