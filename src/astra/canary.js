import { resolveOperatorDeveloperAccess } from '../operator/developer-access.js';

export const ASTRA_MODEL = 'gpt-6-astra';
export const ASTRA_GATEWAY_MODEL = 'openai/gpt-6-astra';
export const ASTRA_REASONING_EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);

const clean = (value, max = 4000) => String(value || '').trim().slice(0, max);

function requestOrigin(req) {
  const forwardedProto = clean(req?.headers?.['x-forwarded-proto'] || req?.headers?.['X-Forwarded-Proto'], 20);
  const forwardedHost = clean(req?.headers?.['x-forwarded-host'] || req?.headers?.['X-Forwarded-Host'], 300);
  const host = forwardedHost || clean(req?.headers?.host || req?.headers?.Host, 300);
  const protocol = forwardedProto || (host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https');
  return host ? `${protocol}://${host}` : '';
}

function normalizeReasoningEffort(value) {
  const effort = clean(value, 20).toLowerCase();
  return ASTRA_REASONING_EFFORTS.includes(effort) ? effort : 'low';
}

function extractOutputText(data = {}) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  for (const item of Array.isArray(data.output) ? data.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === 'output_text' && typeof content.text === 'string' && content.text.trim()) {
        return content.text.trim();
      }
    }
  }
  return '';
}

async function readUpstreamError(response) {
  try {
    const payload = await response.json();
    return clean(payload?.error?.message || payload?.error || payload?.message, 500) || 'Astra request failed.';
  } catch (_error) {
    return 'Astra request failed.';
  }
}

export function buildAstraCanaryRequest({ prompt, model = ASTRA_MODEL, reasoningEffort = 'low' } = {}) {
  return {
    model,
    store: false,
    instructions: [
      'You are the GPT-6 Astra canary inside 3DVR.',
      'Answer the user directly and concisely.',
      'This canary is for capability evaluation, not autonomous side effects.',
      'Do not claim to have taken actions unless tool results are explicitly provided.'
    ].join(' '),
    input: clean(prompt),
    reasoning: { effort: normalizeReasoningEffort(reasoningEffort) },
    max_output_tokens: 1200
  };
}

export function createAstraCanaryHandler(options = {}) {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  const gatewayToken = options.gatewayToken ?? process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_OIDC_TOKEN;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const resolveDeveloperAccess = options.resolveDeveloperAccess || resolveOperatorDeveloperAccess;
  const config = options.config || process.env;

  return async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const developerAccess = await resolveDeveloperAccess(req.body?.developerAuth || {}, {
      config,
      expectedOrigin: requestOrigin(req)
    });
    const ownerApproved = developerAccess?.authenticated === true
      && developerAccess?.approved === true
      && developerAccess?.role === 'owner';
    if (!ownerApproved) return res.status(403).json({ error: 'Owner developer access is required for the Astra canary.' });

    const prompt = clean(req.body?.prompt);
    if (!prompt) return res.status(400).json({ error: 'A prompt is required.' });

    const token = apiKey || gatewayToken;
    if (!token) return res.status(503).json({ error: 'No OpenAI or Vercel AI Gateway credential is configured.' });

    const useGateway = !apiKey && Boolean(gatewayToken);
    const endpoint = options.endpoint || (useGateway
      ? 'https://ai-gateway.vercel.sh/v1/responses'
      : 'https://api.openai.com/v1/responses');
    const model = useGateway ? ASTRA_GATEWAY_MODEL : ASTRA_MODEL;
    const requestBody = buildAstraCanaryRequest({
      prompt,
      model,
      reasoningEffort: req.body?.reasoningEffort
    });

    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        return res.status(response.status).json({
          available: false,
          model: ASTRA_MODEL,
          transport: useGateway ? 'vercel-ai-gateway' : 'openai',
          error: await readUpstreamError(response)
        });
      }

      const data = await response.json();
      const text = extractOutputText(data);
      if (!text) return res.status(502).json({ error: 'Astra returned no text.' });

      return res.status(200).json({
        available: true,
        model: ASTRA_MODEL,
        transport: useGateway ? 'vercel-ai-gateway' : 'openai',
        reasoningEffort: requestBody.reasoning.effort,
        text
      });
    } catch (error) {
      return res.status(502).json({ error: clean(error?.message, 500) || 'Astra request failed.' });
    }
  };
}
