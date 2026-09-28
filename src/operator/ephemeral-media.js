const text = (value, max = 4000) => String(value || '').trim().slice(0, max);

const positive = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const DEFAULT_EPHEMERAL_MEDIA_MAX_JOB_USD = 4;
export const DEFAULT_EPHEMERAL_MEDIA_MAX_RUNTIME_MS = 30 * 60 * 1000;

export function classifyEphemeralMediaTask(prompt = '') {
  const value = text(prompt).toLowerCase();
  if (/\b(?:edit|cut|trim|splice|reframe|caption|subtitle|stabili[sz]e|color grade|remove background)\b/.test(value) && /\bvideo\b/.test(value)) return 'video_edit';
  if (/\b(?:generate|create|make|render)\b/.test(value) && /\bvideo\b/.test(value)) return 'video_generate';
  if (/\b(?:edit|retouch|remove|replace|upscale|restore)\b/.test(value) && /\b(?:image|photo|picture)\b/.test(value)) return 'image_edit';
  if (/\b(?:generate|create|make|render|draw)\b/.test(value) && /\b(?:image|photo|picture|art)\b/.test(value)) return 'image_generate';
  if (/\b(?:transcribe|subtitle|caption)\b/.test(value) && /\b(?:audio|video|recording)\b/.test(value)) return 'transcribe';
  return 'media';
}

export function getEphemeralMediaConfig(env = {}) {
  return {
    enabled: Boolean(text(env.THREEDVR_EPHEMERAL_MEDIA_URL, 1000) && text(env.THREEDVR_EPHEMERAL_MEDIA_TOKEN, 1000)),
    endpoint: text(env.THREEDVR_EPHEMERAL_MEDIA_URL, 1000),
    token: text(env.THREEDVR_EPHEMERAL_MEDIA_TOKEN, 1000),
    provider: text(env.THREEDVR_EPHEMERAL_MEDIA_PROVIDER, 40) || 'openai-compatible',
    maxJobUsd: positive(env.THREEDVR_EPHEMERAL_MEDIA_MAX_JOB_USD, DEFAULT_EPHEMERAL_MEDIA_MAX_JOB_USD),
    maxRuntimeMs: Math.floor(positive(env.THREEDVR_EPHEMERAL_MEDIA_MAX_RUNTIME_MS, DEFAULT_EPHEMERAL_MEDIA_MAX_RUNTIME_MS))
  };
}

export function buildEphemeralMediaJob({
  prompt = '',
  inputs = [],
  task = '',
  modelHint = '',
  toolPolicy = null,
  config = {}
} = {}) {
  const cleanInputs = (Array.isArray(inputs) ? inputs : []).slice(0, 12).map(input => ({
    kind: text(input?.kind, 40) || 'file',
    url: text(input?.url, 2000),
    mime: text(input?.mime, 120),
    name: text(input?.name, 240)
  })).filter(input => input.url);

  return {
    version: 1,
    task: text(task, 60) || classifyEphemeralMediaTask(prompt),
    prompt: text(prompt, 12000),
    inputs: cleanInputs,
    modelHint: text(modelHint, 300),
    budget: {
      maxJobUsd: Number(config.maxJobUsd || DEFAULT_EPHEMERAL_MEDIA_MAX_JOB_USD),
      maxRuntimeMs: Number(config.maxRuntimeMs || DEFAULT_EPHEMERAL_MEDIA_MAX_RUNTIME_MS)
    },
    toolPolicy: toolPolicy && typeof toolPolicy === 'object'
      ? {
          mode: toolPolicy.mode === 'allowlist' ? 'allowlist' : 'none',
          tools: (Array.isArray(toolPolicy.tools) ? toolPolicy.tools : []).map(item => text(item, 120)).filter(Boolean).slice(0, 32)
        }
      : { mode: 'none', tools: [] }
  };
}

export async function submitEphemeralMediaJob({
  prompt = '',
  inputs = [],
  task = '',
  modelHint = '',
  toolPolicy = null,
  config,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!config?.enabled) throw new Error('Ephemeral media compute is not configured.');

  const job = buildEphemeralMediaJob({ prompt, inputs, task, modelHint, toolPolicy, config });
  const response = await fetchImpl(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + config.token,
      'X-3DVR-Max-Runtime-Ms': String(job.budget.maxRuntimeMs),
      'X-3DVR-Max-Job-Usd': String(job.budget.maxJobUsd)
    },
    body: JSON.stringify(job)
  });

  if (!response?.ok) throw new Error('Ephemeral media worker returned HTTP ' + String(response?.status || 500) + '.');
  const result = await response.json();
  return {
    jobId: text(result?.jobId || result?.id, 240),
    status: text(result?.status, 40) || 'submitted',
    outputs: Array.isArray(result?.outputs) ? result.outputs : [],
    provider: config.provider,
    budget: job.budget
  };
}
