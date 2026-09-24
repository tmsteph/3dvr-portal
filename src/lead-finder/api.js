import { createHash } from 'node:crypto';

const DEFAULT_MODEL = 'gpt-5.6-luna';
export const DEFAULT_DISCOVERY_BRIEF = [
  'Find actionable small-business prospects with a clear public need that a practical digital service could improve.',
  'Prefer simple, honest offers that can be fulfilled quickly: website improvements, lead follow-up, workflow automation, photography/video, or similar business support.',
  'Choose the strongest fit from public evidence instead of inventing a need.'
].join(' ');
const DEFAULT_GATEWAY_MODEL = 'inclusionai/ling-3.0-flash-vl-free';
const MAX_LEADS = 25;
const DEFAULT_RATE_LIMIT = 10;
const DEFAULT_RATE_WINDOW_MS = 60 * 60 * 1000;

function clean(value = '', max = 1000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function requestIdentity(req, salt = '3dvr-lead-finder') {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const address = forwarded || String(req?.headers?.['x-real-ip'] || req?.socket?.remoteAddress || 'anonymous');
  return createHash('sha256').update(salt + ':' + address).digest('hex').slice(0, 64);
}

export function createLeadFinderRateLimiter({
  limit = DEFAULT_RATE_LIMIT,
  windowMs = DEFAULT_RATE_WINDOW_MS
} = {}) {
  const buckets = new Map();

  return function rateLimit(key, currentTime = Date.now()) {
    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= currentTime) {
      buckets.set(key, { count: 1, resetAt: currentTime + windowMs });
      return { allowed: true, retryAfter: 0 };
    }

    if (existing.count >= limit) {
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((existing.resetAt - currentTime) / 1000))
      };
    }

    existing.count += 1;
    return { allowed: true, retryAfter: 0 };
  };
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
  const target = clean(description, 1800) || DEFAULT_DISCOVERY_BRIEF;
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
      'Build a lightweight business intelligence profile for every lead. profileSummary and capabilities must be factual and supported by public evidence.',
      'Needs may include cautious hypotheses, but every need must include evidence, a confidence score from 0 to 1, and kind observed or inferred. Never present an inferred need as a fact.',
      'recommendedAction should be the smallest useful next step justified by the strongest need. solutionRoute must be one of 3dvr, partner, either, or unknown; use unknown when the evidence is insufficient.',
      'The primary goal is to earn a human reply, not make a sale or book a meeting.',
      'Draft one evidence-backed outreach email for each lead plus one generic fallback campaign draft.',
      'Each lead-specific subject must be under 60 characters and each body should be 3-4 short sentences, preferably under 80 words.',
      'Lead with one concrete observation supported by that lead’s public evidence, then ask one easy-to-answer question.',
      'Do not mention price, a pilot, a meeting, a demo, a call, or a list of capabilities in the first email.',
      'Do not pretend there is an existing relationship. Do not invent results, facts, urgency, discounts, or claims that are not supported by the source.',
      'The final sentence should be a single low-friction question designed to make replying easy. Do not add a legal footer; the app adds sender identity, address, and opt-out language.',
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
                required: ['name', 'email', 'website', 'location', 'whyFit', 'evidence', 'sourceUrl', 'profileSummary', 'capabilities', 'needs', 'recommendedAction', 'solutionRoute', 'analysisConfidence', 'draftSubject', 'draftBody'],
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string' },
                  website: { type: 'string' },
                  location: { type: 'string' },
                  whyFit: { type: 'string' },
                  evidence: { type: 'string' },
                  sourceUrl: { type: 'string' },
                  profileSummary: { type: 'string' },
                  capabilities: {
                    type: 'array',
                    maxItems: 8,
                    items: { type: 'string' }
                  },
                  needs: {
                    type: 'array',
                    maxItems: 6,
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['need', 'evidence', 'confidence', 'kind'],
                      properties: {
                        need: { type: 'string' },
                        evidence: { type: 'string' },
                        confidence: { type: 'number', minimum: 0, maximum: 1 },
                        kind: { type: 'string', enum: ['observed', 'inferred'] }
                      }
                    }
                  },
                  recommendedAction: { type: 'string' },
                  solutionRoute: { type: 'string', enum: ['3dvr', 'partner', 'either', 'unknown'] },
                  analysisConfidence: { type: 'number', minimum: 0, maximum: 1 },
                  draftSubject: { type: 'string' },
                  draftBody: { type: 'string' }
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
    sourceUrl,
    profileSummary: clean(lead.profileSummary, 1200),
    capabilities: (Array.isArray(lead.capabilities) ? lead.capabilities : [])
      .map(value => clean(value, 240))
      .filter(Boolean)
      .slice(0, 8),
    needs: (Array.isArray(lead.needs) ? lead.needs : [])
      .map(item => ({
        need: clean(item?.need, 320),
        evidence: clean(item?.evidence, 900),
        confidence: Math.max(0, Math.min(1, Number(item?.confidence) || 0)),
        kind: item?.kind === 'observed' ? 'observed' : 'inferred'
      }))
      .filter(item => item.need && item.evidence)
      .slice(0, 6),
    recommendedAction: clean(lead.recommendedAction, 700),
    solutionRoute: ['3dvr', 'partner', 'either', 'unknown'].includes(clean(lead.solutionRoute))
      ? clean(lead.solutionRoute)
      : 'unknown',
    analysisConfidence: Math.max(0, Math.min(1, Number(lead.analysisConfidence) || 0)),
    draftSubject: clean(lead.draftSubject, 180),
    draftBody: String(lead.draftBody || '').trim().slice(0, 4000)
  };
}

function normalizeCampaignDraft(draft = {}) {
  return {
    subject: clean(draft?.subject, 180),
    body: String(draft?.body || '').trim().slice(0, 4000)
  };
}

function normalizeLeadFinderPayload(parsed = {}, sources = []) {
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
    sources
  };
}

function parseJsonObjectText(value = '') {
  let text = String(value || '').trim();
  if (!text) throw new Error('AI provider returned no lead data.');

  const fenced = text.match(/^\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`$/i);
  if (fenced) text = fenced[1].trim();

  try {
    return JSON.parse(text);
  } catch (_error) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error('AI provider returned invalid lead JSON.');
  }
}

function extractGatewaySearchSources(toolResults = []) {
  const seen = new Set();
  const sources = [];
  const add = (title, url) => {
    const cleanUrl = clean(url, 2000);
    if (!/^https?:\/\//i.test(cleanUrl) || seen.has(cleanUrl)) return;
    seen.add(cleanUrl);
    sources.push({ title: clean(title || cleanUrl, 300), url: cleanUrl });
  };

  for (const result of Array.isArray(toolResults) ? toolResults : []) {
    const output = result?.output || result?.result || {};
    for (const item of Array.isArray(output?.web_results) ? output.web_results : []) {
      add(item?.title || item?.source_name, item?.url);
    }
    for (const card of Array.isArray(output?.cards) ? output.cards : []) {
      add(card?.title || card?.description, card?.webpage_url || card?.content?.url);
      for (const source of Array.isArray(card?.sources) ? card.sources : []) {
        add(source?.source_name || card?.title, source?.url);
      }
    }
  }
  return sources;
}

function buildGatewayLeadPrompt({ description, location, count }) {
  return [
    'Research B2B prospects using tako_search before answering.',
    'Only include a lead when public search results substantiate a real public business email and sourceUrl points to that public source.',
    'Never infer an email pattern and never invent a person, business, email, website, claim, or source.',
    'Prefer official business websites and official contact pages.',
    'Return ONLY JSON with campaignDraft and leads. Each lead needs name, email, website, location, whyFit, evidence, sourceUrl, profileSummary, capabilities, needs, recommendedAction, solutionRoute, analysisConfidence, draftSubject, and draftBody.',
    'profileSummary and capabilities must be public facts. needs is an array of {need,evidence,confidence,kind}; kind is observed or inferred and confidence is 0 to 1. Never turn a hypothesis into a fact.',
    'recommendedAction is the smallest useful next step. solutionRoute is 3dvr, partner, either, or unknown; prefer unknown when uncertain.',
    'The goal is a human reply, not a sale. Each lead-specific email should be 3-4 short sentences and preferably under 80 words.',
    'Use one factual observation supported by that lead’s evidence and end with one easy-to-answer question.',
    'Do not mention price, a pilot, a meeting, a demo, a call, or a list of capabilities in the first email.',
    'Do not claim an existing relationship. Do not add a legal footer.',
    'Offer and ideal customer: ' + description,
    location ? 'Target geography: ' + location : 'Target geography: any location matching the request.',
    'Find up to ' + count + ' contacts.'
  ].join('\n');
}

async function runGatewayLeadSearch({ model, description, location, count }) {
  const { gateway, generateText, stepCountIs } = await import('ai');
  const research = await generateText({
    model: gateway(model),
    instructions: [
      'You are a careful B2B lead researcher.',
      'You must use tako_search to find public business contact information.',
      'Search for real businesses and public email addresses relevant to the request.',
      'Never infer an email pattern. Prefer official business websites and contact pages.'
    ].join(' '),
    prompt: buildGatewayLeadPrompt({ description, location, count }),
    tools: {
      tako_search: gateway.tools.takoSearch({
        effort: 'fast',
        sources: {
          web: {
            count: Math.min(20, Math.max(5, count * 2)),
            highlights: true,
            snippetMaxChars: 3000
          }
        }
      })
    },
    stopWhen: stepCountIs(3),
    maxRetries: 1
  });

  if (!Array.isArray(research.toolResults) || research.toolResults.length === 0) {
    throw new Error('Lead Finder search tool returned no research results.');
  }

  const sources = extractGatewaySearchSources(research.toolResults);
  const researchMaterial = JSON.stringify({
    searchSummary: String(research.text || '').slice(0, 12000),
    searchResults: research.toolResults
  }).slice(0, 70000);

  const formatted = await generateText({
    model: gateway(model),
    instructions: [
      'You are a strict JSON formatter for verified B2B lead research.',
      'Use only the supplied research. Never invent or infer an email address.',
      'Omit any candidate whose public business email and source URL are not supported by the research.',
      'Return JSON only, with no markdown fences or commentary.'
    ].join(' '),
    prompt: [
      buildGatewayLeadPrompt({ description, location, count }),
      '',
      'Research material:',
      researchMaterial
    ].join('\n'),
    maxRetries: 1
  });

  return normalizeLeadFinderPayload(
    parseJsonObjectText(formatted.text),
    sources
  );
}

export function parseLeadFinderResponse(responseData) {
  const raw = extractResponseText(responseData);
  if (!raw) throw new Error('OpenAI returned no lead data.');
  return normalizeLeadFinderPayload(JSON.parse(raw), extractSources(responseData));
}

export function createLeadFinderHandler({
  apiKey = process.env.OPENAI_API_KEY,
  gatewayToken = process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_OIDC_TOKEN,
  model = process.env.OPENAI_LEAD_MODEL,
  gatewayModel = process.env.AI_GATEWAY_LEAD_MODEL,
  endpoint,
  fetchImpl = globalThis.fetch,
  gatewaySearchImpl = runGatewayLeadSearch,
  rateLimiter = createLeadFinderRateLimiter(),
  nowMs = () => Date.now()
} = {}) {
  return async function leadFinderHandler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const requestedDescription = clean(req?.body?.description, 1800);
    const description = requestedDescription || DEFAULT_DISCOVERY_BRIEF;
    const location = clean(req?.body?.location, 300);
    const count = Math.min(MAX_LEADS, Math.max(1, Number(req?.body?.count) || 10));

    const authorizationToken = apiKey || gatewayToken;
    if (!authorizationToken) {
      return res.status(503).json({ error: 'AI provider is not configured yet.', code: 'ai_not_configured' });
    }

    const rate = rateLimiter(requestIdentity(req), nowMs());
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfter));
      return res.status(429).json({
        error: 'Lead Finder is cooling down for this connection. Try again later.',
        code: 'lead_search_rate_limited',
        retryAfter: rate.retryAfter
      });
    }

    try {
      const useGateway = !apiKey && Boolean(gatewayToken);
      const effectiveModel = useGateway
        ? (gatewayModel || DEFAULT_GATEWAY_MODEL)
        : (model || DEFAULT_MODEL);

      let result;
      if (useGateway) {
        result = await gatewaySearchImpl({
          model: effectiveModel,
          description,
          location,
          count
        });
      } else {
        const requestEndpoint = endpoint || 'https://api.openai.com/v1/responses';
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

        result = parseLeadFinderResponse(await response.json());
      }

      return res.status(200).json({
        ok: true,
        model: effectiveModel,
        provider: useGateway ? 'vercel-ai-gateway+tako' : 'openai',
        query: { description, location, count, usedDefaultBrief: !requestedDescription },
        leads: result.leads,
        campaignDraft: result.campaignDraft,
        sources: result.sources
      });
    } catch (error) {
      const status = Number(error?.statusCode || error?.status) || 500;
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error?.message || 'Lead search failed.'
      });
    }
  };
}
