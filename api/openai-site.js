export const DEFAULT_MODEL = 'gpt-5-mini';
export const SUPPORTED_SITE_MODELS = Object.freeze([
  'gpt-4o-mini',
  'gpt-4.1-mini',
  'gpt-5-mini'
]);

export const SITE_BUILDER_CAPABILITIES = Object.freeze({
  liveWebSearch: true
});

const LAYOUT_GUARD_STYLE_ID = 'three-dvr-layout-guard';
const LAYOUT_GUARD_CSS = [
  'html{width:100%;max-width:100%;overflow-x:hidden;}',
  'body{max-width:100%;overflow-x:hidden;}',
  '*,*::before,*::after{box-sizing:border-box;}',
  'img,video,canvas,svg,iframe{max-width:100%;}'
].join('');
const TEMPORAL_CUE_RE = /\b(current|currently|latest|today|now|right now|as of|up[- ]to[- ]date|recent)\b/i;
const SENSITIVE_FACT_RE = /\b(president|vice president|governor|mayor|senator|congress|ceo|prime minister|chancellor|king|queen|administration|cabinet|price|stock|weather|forecast|news|headline|score|schedule|standings|election)\b/i;

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

function isGpt5FamilyModel(model) {
  return /^gpt-5($|-)/.test(String(model || '').trim());
}

function normalizeRequestedModel(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return DEFAULT_MODEL;
  }

  return SUPPORTED_SITE_MODELS.includes(normalized) ? normalized : '';
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function setSseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
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
    'Avoid horizontal overflow and right-side scrollbars on mobile and desktop.',
    'Do not use raw 100vw section widths or off-screen transforms unless you also prevent overflow.',
    'Do not reference external assets or scripts.',
    'Use calming palettes with sufficient contrast unless the prompt asks otherwise.',
    'For navigation and CTA buttons, prefer in-page anchors such as #pricing or #contact when no real destination is provided.',
    'Do not link buttons or nav items to the local portal, the web builder, or relative files unless the user explicitly asks for those routes.',
    `If you include copyright, trademark, or footer-year copy, use ${currentYear} or a range ending in ${currentYear} unless the user explicitly asks for a different year.`,
    'Never default to stale years like 2023 for date-sensitive footer or legal copy.',
    'Always write a specific summary that explains the page structure, tone, and any notable footer or legal-copy decisions.',
    'Use live web search only when the request needs current facts, recent references, or externally verifiable details.',
    'If the request asks for a current officeholder, recent event, current administration detail, live price, score, schedule, weather, or other time-sensitive fact, use live web search before answering.',
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

function getWebSearchCalls(responseData) {
  const outputItems = Array.isArray(responseData?.output) ? responseData.output : [];
  return outputItems.filter(item => item?.type === 'web_search_call');
}

function extractWebSources(responseData) {
  const outputItems = getWebSearchCalls(responseData);
  const sources = new Map();

  for (const item of outputItems) {
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
      title: parsed.title || 'Generated Site',
      html: injectLayoutGuardStyles(parsed.html),
      summary: parsed.summary || 'Generated site content ready to publish.',
    };
  } catch (err) {
    throw new Error(`Failed to parse OpenAI response: ${err.message}`);
  }
}

export function injectLayoutGuardStyles(html) {
  const markup = String(html || '');
  if (!markup.trim()) {
    return markup;
  }

  if (markup.includes(`id="${LAYOUT_GUARD_STYLE_ID}"`) || markup.includes(`id='${LAYOUT_GUARD_STYLE_ID}'`)) {
    return markup;
  }

  const styleTag = `<style id="${LAYOUT_GUARD_STYLE_ID}">${LAYOUT_GUARD_CSS}</style>`;

  if (/<\/head>/i.test(markup)) {
    return markup.replace(/<\/head>/i, `${styleTag}</head>`);
  }

  if (/<body[^>]*>/i.test(markup)) {
    return markup.replace(/<body([^>]*)>/i, `<body$1>${styleTag}`);
  }

  return `${styleTag}${markup}`;
}

export function shouldForceWebSearch(prompt) {
  const normalized = String(prompt || '').trim();
  if (!normalized) {
    return false;
  }

  if (/\bpresident of the united states\b/i.test(normalized)) {
    return true;
  }

  return TEMPORAL_CUE_RE.test(normalized) && SENSITIVE_FACT_RE.test(normalized);
}

function createSseParser(onEvent) {
  let buffer = '';

  function flushBlock(block) {
    const normalized = String(block || '').replace(/\r/g, '');
    if (!normalized.trim()) {
      return;
    }

    let eventName = 'message';
    const dataLines = [];

    normalized.split('\n').forEach(line => {
      if (!line || line.startsWith(':')) {
        return;
      }

      if (line.startsWith('event:')) {
        eventName = line.slice('event:'.length).trim();
        return;
      }

      if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trimStart());
      }
    });

    const rawData = dataLines.join('\n');
    if (!rawData || rawData === '[DONE]') {
      return;
    }

    let data = rawData;
    try {
      data = JSON.parse(rawData);
    } catch (error) {
      // Leave non-JSON payloads as raw text.
    }

    onEvent({ event: eventName, data });
  }

  return {
    push(chunk) {
      buffer += String(chunk || '').replace(/\r\n/g, '\n').replace(/\r/g, '');

      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex >= 0) {
        const block = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        flushBlock(block);
        separatorIndex = buffer.indexOf('\n\n');
      }
    },
    flush() {
      flushBlock(buffer);
      buffer = '';
    }
  };
}

async function consumeSseStream(stream, onEvent) {
  if (!stream?.getReader) {
    throw new Error('Streaming response body is not available.');
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser(onEvent);

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    parser.push(decoder.decode(value, { stream: true }));
  }

  parser.push(decoder.decode());
  parser.flush();
}

function writeSseEvent(res, eventName, payload) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function buildSiteResult(data, { model, currentDate }) {
  const parsed = parseResponsePayload(data);
  const sources = extractWebSources(data);
  const usedWebSearch = getWebSearchCalls(data).length > 0;

  return {
    ...parsed,
    model,
    createdAt: currentDate.getTime(),
    currentYear: currentDate.getUTCFullYear(),
    liveWebSearch: SITE_BUILDER_CAPABILITIES.liveWebSearch,
    usedWebSearch,
    sources
  };
}

export function buildOpenAiRequest({ model, prompt, now = new Date(), stream = false, forceWebSearch = false }) {
  const requestBody = {
    model,
    instructions: buildPrompt(now),
    input: prompt,
    store: false,
    tool_choice: forceWebSearch ? 'required' : 'auto',
    tools: [{ type: 'web_search' }],
    include: ['web_search_call.action.sources'],
    text: {
      format: {
        type: 'json_schema',
        ...SITE_RESPONSE_SCHEMA
      }
    }
  };

  if (!isGpt5FamilyModel(model)) {
    requestBody.temperature = 0.35;
  }

  if (stream) {
    requestBody.stream = true;
    requestBody.stream_options = { include_obfuscation: false };
  }

  return requestBody;
}

export function createSiteGeneratorHandler(options = {}) {
  const {
    apiKey = process.env.OPENAI_API_KEY,
    model = normalizeRequestedModel(options.model || process.env.OPENAI_SITE_MODEL || DEFAULT_MODEL) || DEFAULT_MODEL,
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

    const { prompt, apiKey: requestApiKey, stream, model: requestedModel } = req.body || {};
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
        error: `Unsupported model. Choose one of: ${SUPPORTED_SITE_MODELS.join(', ')}.`
      });
    }

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'A prompt string is required.' });
    }

    try {
      const currentDate = resolveDate(now());
      const forceWebSearch = shouldForceWebSearch(prompt);
      const requestBody = buildOpenAiRequest({
        model: effectiveModel,
        prompt,
        now: currentDate,
        stream: stream === true,
        forceWebSearch
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

      if (stream === true) {
        setSseHeaders(res);
        res.flushHeaders?.();

        let didReportWebSearch = false;
        let finalResult = null;

        try {
          await consumeSseStream(response.body, event => {
            if (event.event === 'response.web_search_call.searching' && !didReportWebSearch) {
              didReportWebSearch = true;
              writeSseEvent(res, 'status', {
                message: 'Searching the web...',
                tone: 'info'
              });
              return;
            }

            if (event.event === 'response.completed') {
              finalResult = buildSiteResult(event.data?.response || {}, { model: effectiveModel, currentDate });
              writeSseEvent(res, 'result', finalResult);
              return;
            }

            if (event.event === 'response.failed') {
              writeSseEvent(res, 'error', {
                message: event.data?.response?.error?.message || 'The OpenAI response failed.'
              });
            }

            if (event.event === 'error') {
              writeSseEvent(res, 'error', {
                message: event.data?.error?.message || event.data?.message || 'Unexpected streaming error.'
              });
            }
          });
        } catch (streamError) {
          writeSseEvent(res, 'error', {
            message: streamError.message || 'Unexpected streaming error.'
          });
        }

        if (!finalResult) {
          writeSseEvent(res, 'error', {
            message: 'No completed response was returned from OpenAI.'
          });
        }

        return res.end();
      }

      const data = await response.json();
      return res.status(200).json(buildSiteResult(data, { model: effectiveModel, currentDate }));
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Unexpected error during site generation.' });
    }
  };
}

const handler = createSiteGeneratorHandler();
export default handler;
