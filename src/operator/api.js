export const DEFAULT_OPERATOR_MODEL = 'gpt-5.4-mini';
export const DEFAULT_OPERATOR_GATEWAY_MODEL = 'openai/gpt-5.4-mini';

const RESPONSE_SCHEMA = {
  name: 'portal_operator_response', strict: true,
  schema: {
    type: 'object', additionalProperties: false,
    required: ['reply', 'action'],
    properties: {
      reply: { type: 'string' },
      action: {
        type: 'object', additionalProperties: false,
        required: ['type', 'title', 'text', 'business', 'location', 'url'],
        properties: {
          type: { type: 'string', enum: ['none', 'create_note', 'add_lead', 'open_app'] },
          title: { type: 'string' }, text: { type: 'string' }, business: { type: 'string' },
          location: { type: 'string' }, url: { type: 'string' }
        }
      }
    }
  }
};

const clean = (value, max = 3000) => String(value || '').trim().slice(0, max);
const outputText = data => (data?.output || []).flatMap(item => item?.content || []).find(item => item?.type === 'output_text')?.text || '';

async function readUpstreamError(response) {
  const fallback = response.status === 429
    ? 'The operator is busy right now. Please try again in a moment.'
    : 'The operator could not respond. Please try again.';
  try {
    const payload = await response.json();
    const code = clean(payload?.error?.code || payload?.code, 80);
    if (code === 'insufficient_quota') return 'The configured AI account has no available credits.';
    return clean(payload?.error?.message || payload?.message, 300) || fallback;
  } catch {
    return fallback;
  }
}

export function buildOperatorRequest({ prompt, history = [], model = DEFAULT_OPERATOR_MODEL }) {
  const messages = (Array.isArray(history) ? history : []).slice(-10).map(item => ({
    role: item?.role === 'assistant' ? 'assistant' : 'user', content: clean(item?.content, 1200)
  })).filter(item => item.content);
  messages.push({ role: 'user', content: clean(prompt, 2000) });
  return {
    model, store: false,
    instructions: [
      'You are the 3DVR Operator, a calm personal operator inside a life and business portal.',
      'Talk like a capable partner. Lead with the useful answer. Use short, plain sentences.',
      'You may take one safe local action per turn: create_note saves a note in Life Space; add_lead adds a business to Lead Finder; open_app opens an existing portal workspace.',
      'For create_note fill title and text. For add_lead fill business and location. For open_app use only these relative URLs: /life-space/, /lead-finder/, /crm/, /growth-operator/, /web-builder-app/, /calendar/, /finance/.',
      'Use none when the user is asking a question or when the requested action is external, destructive, costly, sensitive, or unsupported. Never claim an unsupported action happened.',
      'When a safe action is clear, choose it without asking the user to navigate an interface.',
      'Return only the requested JSON.'
    ].join(' '),
    input: messages,
    text: { format: { type: 'json_schema', ...RESPONSE_SCHEMA } }
  };
}

export function normalizeOperatorResult(value = {}) {
  const allowed = new Set(['none', 'create_note', 'add_lead', 'open_app']);
  const type = allowed.has(value?.action?.type) ? value.action.type : 'none';
  return {
    reply: clean(value?.reply, 1600) || 'Tell me what you want to do.',
    action: {
      type, title: clean(value?.action?.title, 120), text: clean(value?.action?.text, 4000),
      business: clean(value?.action?.business, 160), location: clean(value?.action?.location, 160),
      url: /^\/(life-space|lead-finder|crm|growth-operator|web-builder-app|calendar|finance)\/$/.test(clean(value?.action?.url, 200)) ? clean(value.action.url, 200) : ''
    }
  };
}

export function createOperatorHandler(options = {}) {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  const gatewayToken = options.gatewayToken ?? process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_OIDC_TOKEN;
  const endpoint = options.endpoint || (gatewayToken ? 'https://ai-gateway.vercel.sh/v1/responses' : 'https://api.openai.com/v1/responses');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  return async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    const requestApiKey = clean(req.body?.apiKey, 300);
    const authorizationToken = apiKey || gatewayToken || requestApiKey;
    if (!authorizationToken) return res.status(503).json({ error: 'The operator is temporarily unavailable.' });
    const prompt = clean(req.body?.prompt, 2000);
    if (!prompt) return res.status(400).json({ error: 'Tell the operator what you need.' });
    try {
      const useGateway = !apiKey && Boolean(gatewayToken);
      const requestEndpoint = useGateway ? endpoint : 'https://api.openai.com/v1/responses';
      const model = options.model || process.env.OPENAI_OPERATOR_MODEL || (useGateway ? DEFAULT_OPERATOR_GATEWAY_MODEL : DEFAULT_OPERATOR_MODEL);
      const response = await fetchImpl(requestEndpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authorizationToken}` },
        body: JSON.stringify(buildOperatorRequest({ prompt, history: req.body?.history, model }))
      });
      if (!response.ok) return res.status(response.status).json({ error: await readUpstreamError(response) });
      const raw = outputText(await response.json());
      return res.status(200).json(normalizeOperatorResult(JSON.parse(raw)));
    } catch (error) { return res.status(500).json({ error: error.message || 'The operator could not respond.' }); }
  };
}
