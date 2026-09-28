const text = (value, max = 2000) => String(value || '').trim().slice(0, max);

const positiveNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return /^(?:1|true|yes|on)$/i.test(String(value).trim());
};

const MANUAL_EPHEMERAL_PATTERN = /\b(?:use|try|run|switch to|send (?:this|it) to)\s+(?:(?:our|my|the)\s+)?(?:own|open(?:[- ]weight)?|self[- ]hosted|ephemeral|local)\s+(?:llm|model|gpu|compute)\b|\b(?:use|try|run)\s+(?:runpod|modal)\b/i;
const AUTO_ESCAPE_PATTERN = /\b(?:the model|this model|hosted model|provider)\s+(?:will not|won't|can't|cannot|refuses? to)\b|\bneed\s+(?:more|full)\s+control\s+over\s+(?:the\s+)?model\b/i;

export const DEFAULT_EPHEMERAL_MAX_JOB_USD = 2;
export const DEFAULT_EPHEMERAL_MAX_RUNTIME_MS = 20 * 60 * 1000;

export function normalizeEphemeralComputeMode(value = 'auto') {
  const mode = text(value, 40).toLowerCase();
  if (['ephemeral', 'gpu', 'open'].includes(mode)) return 'ephemeral';
  if (['frontier', 'normal', 'hosted', 'off'].includes(mode)) return 'frontier';
  return 'auto';
}

function providerName(endpoint, configured = '') {
  const explicit = text(configured, 40).toLowerCase();
  if (explicit) return explicit;
  const value = text(endpoint, 1000).toLowerCase();
  if (value.includes('runpod')) return 'runpod';
  if (value.includes('modal')) return 'modal';
  return 'openai-compatible';
}

export function getEphemeralComputeConfig(env = {}) {
  const endpoint = text(env.THREEDVR_EPHEMERAL_LLM_URL, 1000);
  const token = text(env.THREEDVR_EPHEMERAL_LLM_TOKEN, 1000);
  const model = text(env.THREEDVR_EPHEMERAL_LLM_MODEL, 300);
  const hourlyUsd = positiveNumber(env.THREEDVR_EPHEMERAL_GPU_USD_PER_HOUR, 0);
  const maxJobUsd = positiveNumber(env.THREEDVR_EPHEMERAL_MAX_JOB_USD, DEFAULT_EPHEMERAL_MAX_JOB_USD);
  const maxRuntimeMs = Math.max(
    1000,
    Math.floor(positiveNumber(env.THREEDVR_EPHEMERAL_MAX_RUNTIME_MS, DEFAULT_EPHEMERAL_MAX_RUNTIME_MS))
  );

  return {
    enabled: Boolean(endpoint && token && model),
    endpoint,
    token,
    model,
    provider: providerName(endpoint, env.THREEDVR_EPHEMERAL_PROVIDER),
    hourlyUsd,
    maxJobUsd,
    maxRuntimeMs,
    auto: parseBoolean(env.THREEDVR_EPHEMERAL_AUTO, false),
    includeContext: parseBoolean(env.THREEDVR_EPHEMERAL_INCLUDE_CONTEXT, false),
    allowImages: parseBoolean(env.THREEDVR_EPHEMERAL_ALLOW_IMAGES, false),
    maxTokens: Math.max(64, Math.floor(positiveNumber(env.THREEDVR_EPHEMERAL_MAX_TOKENS, 1600)))
  };
}

export function estimateEphemeralComputeCost({ hourlyUsd = 0, runtimeMs = 0 } = {}) {
  const hourly = positiveNumber(hourlyUsd, 0);
  const runtime = positiveNumber(runtimeMs, 0);
  if (!hourly || !runtime) return null;
  return Number(((hourly * runtime) / 3_600_000).toFixed(4));
}

export function planEphemeralCompute({
  prompt = '',
  mode = 'auto',
  images = [],
  env = {},
  config = null
} = {}) {
  const effective = config || getEphemeralComputeConfig(env);
  const normalizedMode = normalizeEphemeralComputeMode(mode);
  const cleanPrompt = text(prompt, 4000);
  const explicitPrompt = MANUAL_EPHEMERAL_PATTERN.test(cleanPrompt);
  const explicit = normalizedMode === 'ephemeral' || explicitPrompt;
  const autoCandidate = effective.auto && AUTO_ESCAPE_PATTERN.test(cleanPrompt);
  const requested = explicit || autoCandidate;

  if (normalizedMode === 'frontier') {
    return { useEphemeral: false, requested: false, explicit: false, reason: 'frontier_requested' };
  }
  if (!requested) {
    return { useEphemeral: false, requested: false, explicit: false, reason: 'not_requested' };
  }
  if (!effective.enabled) {
    return { useEphemeral: false, requested: true, explicit, reason: 'not_configured' };
  }
  if (Array.isArray(images) && images.length > 0 && !effective.allowImages) {
    return { useEphemeral: false, requested: true, explicit, reason: 'images_not_enabled' };
  }

  let maxRuntimeMs = effective.maxRuntimeMs;
  if (effective.hourlyUsd > 0 && effective.maxJobUsd > 0) {
    const affordableRuntimeMs = Math.floor((effective.maxJobUsd / effective.hourlyUsd) * 3_600_000);
    maxRuntimeMs = Math.max(1000, Math.min(maxRuntimeMs, affordableRuntimeMs));
  }

  return {
    useEphemeral: true,
    requested: true,
    explicit,
    reason: explicit ? 'explicit_request' : 'auto_escape',
    provider: effective.provider,
    model: effective.model,
    maxRuntimeMs,
    maxJobUsd: effective.maxJobUsd,
    estimatedCeilingUsd: estimateEphemeralComputeCost({
      hourlyUsd: effective.hourlyUsd,
      runtimeMs: maxRuntimeMs
    })
  };
}

function messageText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(item => {
    if (typeof item === 'string') return item;
    return item?.text || item?.content || '';
  }).filter(Boolean).join('\n');
}

export function buildEphemeralChatRequest({
  prompt = '',
  history = [],
  system = '',
  config
} = {}) {
  const messages = [];
  const cleanSystem = text(system, 12000);
  if (cleanSystem) messages.push({ role: 'system', content: cleanSystem });

  for (const item of (Array.isArray(history) ? history : []).slice(-12)) {
    const content = text(messageText(item?.content), 1800);
    if (!content) continue;
    messages.push({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content
    });
  }

  messages.push({ role: 'user', content: text(prompt, 4000) });

  return {
    model: config.model,
    messages,
    stream: false,
    temperature: 0.4,
    max_tokens: config.maxTokens
  };
}

function extractChatText(payload = {}) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.map(item => item?.text || item?.content || '').filter(Boolean).join('\n').trim();
  }
  if (typeof payload?.output_text === 'string') return payload.output_text.trim();
  if (typeof payload?.text === 'string') return payload.text.trim();
  return '';
}

export async function invokeEphemeralText({
  prompt = '',
  history = [],
  system = '',
  config,
  plan,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!config?.enabled) throw new Error('Ephemeral compute is not configured.');
  if (!plan?.useEphemeral) throw new Error('Ephemeral compute was not selected for this request.');

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), plan.maxRuntimeMs) : null;

  try {
    const response = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + config.token,
        'X-3DVR-Max-Runtime-Ms': String(plan.maxRuntimeMs),
        'X-3DVR-Max-Job-Usd': String(plan.maxJobUsd)
      },
      body: JSON.stringify(buildEphemeralChatRequest({ prompt, history, system, config })),
      signal: controller?.signal
    });

    if (!response?.ok) {
      let detail = '';
      try {
        const body = await response.json();
        detail = text(body?.error?.message || body?.message || body?.error, 300);
      } catch {}
      throw new Error(detail || 'Ephemeral compute request failed with HTTP ' + String(response?.status || 500) + '.');
    }

    const payload = await response.json();
    const output = extractChatText(payload);
    if (!output) throw new Error('Ephemeral compute returned an empty response.');

    return {
      text: output,
      usage: payload?.usage || null
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function publicEphemeralComputeReceipt(plan = {}) {
  return {
    lane: 'ephemeral',
    provider: text(plan.provider, 40),
    model: text(plan.model, 300),
    maxRuntimeMs: Number(plan.maxRuntimeMs || 0),
    maxJobUsd: Number(plan.maxJobUsd || 0),
    estimatedCeilingUsd: plan.estimatedCeilingUsd ?? null
  };
}
