const DEFAULT_MODEL = 'gpt-5.6-luna';
const DEFAULT_GATEWAY_MODEL = 'openai/gpt-5.6-luna';
const MAX_LEADS = 25;

function clean(value = '', max = 1000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function extractResponseText(responseData) {
  for (const item of Array.isArray(responseData?.output) ? responseData.output : []) {
    if (item?.type !== 'message') continue;
    for (const content of Array.isArray(item.content) ? item.content : []) {
      if (content?.type === 'output_text' && typeof content.text === 'string' && content.text.trim()) {
        return content.text.trim();
      }
    }
  }
  return '';
}

function extractSources(responseData) {
  const seen = new Set();
  const sources = [];
  for (const item of Array.isArray(responseData?.output) ? responseData.output : []) {
    if (item?.type !== 'web_search_call') continue;
    for (const source of Array.isArray(item?.action?.sources) ? item.action.sources : []) {
      const url = clean(source?.url, 2000);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      sources.push({ title: clean(source?.title || source?.site || url, 300), url });
    }
  }
  return sources;
}

export function buildLeadFinderRequest({ description, location = '', count = 10, model = DEFAULT_MODEL } = {}) {
  const limit = Math.min(MAX_LEADS, Math.max(1, Number(count) || 10));
  const target = clean(description, 1800);
  const place = clean(location, 300);

  return {
    model,
    store: false,
    instructions: [
      'You are a careful B2B lead-research assistant for 3DVR Campaigns.',
      'Use live web search to find businesses or professionals matching the requested ideal customer profile.',
      'Only return contacts with a public business email that you can substantiate from a public source.',
      'Never guess or infer an email address pattern. Never invent a person, company, website, email, or source.',
      'Prefer an official business website, official contact page, official professional profile, or reputable public business directory.',
      'Do not return private personal information. Public business contact information is acceptable.',
      'If you cannot verify a public email for a candidate, omit that candidate.',
      'Keep whyFit and evidence concise and factual.',
      'Also draft one concise outreach email for this offer and audience.',
      'The subject must be under 70 characters. The body must be under 120 words.',
      'Use {{name}} for the recipient or business name. Do not pretend there is an existing relationship.',
      'Do not invent results, facts, urgency, discounts, or recipient-specific claims that are not supported by the request.',
      'End with a low-friction question or invitation to reply. Do not add a legal footer; the app adds sender identity, address, and opt-out language.',
      'Return no more than the requested number of leads.'
    ].join(' '),
    input: [
      'Offer and ideal customer: ' + target,
      place ? 'Target geography: ' + place : 'Target geography: any location matching the request.',
      'Find up to ' + limit + ' contacts.'
    ].join('\n'),
    tool_choice: 'required',
    tools: [{ type: 'web_search' }],
    include: ['web_search_call.action.sources'],
    text: {
      format: {
        type: 'json_schema',
        name: 'lead_finder_results',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['leads', 'campaignDraft'],
          properties: {
            campaignDraft: {
              type: 'object',
              additionalProperties: false,
              required: ['subject', 'body'],
              properties: {
                subject: { type: 'string' },
                body: { type: 'string' }
              }
            },
            leads: {
              type: 'array',
              maxItems: limit,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'email', 'website', 'location', 'whyFit', 'evidence', 'sourceUrl'],
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string' },
                  website: { type: 'string' },
                  location: { type: 'string' },
                  whyFit: { type: 'string' },
                  evidence: { type: 'string' },
                  sourceUrl: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  };
}

function normalizeLead(lead = {}) {
  const email = clean(lead.email, 320).toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return null;
  const sourceUrl = clean(lead.sourceUrl, 2000);
  if (!/^https?:\/\//i.test(sourceUrl)) return null;
  return {
    name: clean(lead.name, 240),
    email,
    website: clean(lead.website, 2000),
    location: clean(lead.location, 300),
    whyFit: clean(lead.whyFit, 900),
    evidence: clean(lead.evidence, 900),
    sourceUrl
  };
}

function normalizeCampaignDraft(draft = {}) {
  return {
    subject: clean(draft?.subject, 180),
    body: String(draft?.body || '').trim().slice(0, 4000)
  };
}

export function parseLeadFinderResponse(responseData) {
  const raw = extractResponseText(responseData);
  if (!raw) throw new Error('OpenAI returned no lead data.');
  const parsed = JSON.parse(raw);
  const seen = new Set();
  const leads = [];
  for (const item of Array.isArray(parsed?.leads) ? parsed.leads : []) {
    const lead = normalizeLead(item);
    if (!lead || seen.has(lead.email)) continue;
    seen.add(lead.email);
    leads.push(lead);
  }
  return {
    leads,
    campaignDraft: normalizeCampaignDraft(parsed?.campaignDraft),
    sources: extractSources(responseData)
  };
}

export function createLeadFinderHandler({
  apiKey = process.env.OPENAI_API_KEY,
  gatewayToken = process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_OIDC_TOKEN,
  model = process.env.OPENAI_LEAD_MODEL,
  endpoint,
  fetchImpl = globalThis.fetch
} = {}) {
  return async function leadFinderHandler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const description = clean(req?.body?.description, 1800);
    const location = clean(req?.body?.location, 300);
    const count = Math.min(MAX_LEADS, Math.max(1, Number(req?.body?.count) || 10));

    if (!description) return res.status(400).json({ error: 'Describe the kind of customer you want.' });

    const authorizationToken = apiKey || gatewayToken;
    if (!authorizationToken) {
      return res.status(503).json({ error: 'AI provider is not configured yet.', code: 'ai_not_configured' });
    }

    try {
      const useGateway = !apiKey && Boolean(gatewayToken);
      const effectiveModel = model || (useGateway ? DEFAULT_GATEWAY_MODEL : DEFAULT_MODEL);
      const requestEndpoint = endpoint || (useGateway
        ? 'https://ai-gateway.vercel.sh/v1/responses'
        : 'https://api.openai.com/v1/responses');
      const requestBody = buildLeadFinderRequest({ description, location, count, model: effectiveModel });
      const response = await fetchImpl(requestEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authorizationToken },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const code = clean(payload?.error?.code || payload?.error?.type, 120);
        const message = clean(payload?.error?.message, 1000) || 'OpenAI lead search failed.';
        const status = response.status === 429 ? 402 : response.status;
        return res.status(status).json({
          error: message,
          code: code || (response.status === 429 ? 'openai_quota' : 'openai_error')
        });
      }

      const responseData = await response.json();
      const result = parseLeadFinderResponse(responseData);
      return res.status(200).json({
        ok: true,
        model: effectiveModel,
        provider: useGateway ? 'vercel-ai-gateway' : 'openai',
        query: { description, location, count },
        leads: result.leads,
        campaignDraft: result.campaignDraft,
        sources: result.sources
      });
    } catch (error) {
      return res.status(500).json({ error: error?.message || 'Lead search failed.' });
    }
  };
}
