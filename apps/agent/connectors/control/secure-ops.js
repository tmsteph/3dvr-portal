'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_HANDOFF_STATE = '/var/lib/3dvr/secret-handoff/state.json';
const DEFAULT_HANDOFF_ORIGIN = 'https://portal.3dvr.tech';
const DEFAULT_N8N_TARGETS = Object.freeze({
  cvw: Object.freeze({
    label: 'Tom / CVW',
    baseUrl: 'https://178.105.247.138.nip.io',
    secretKey: 'CVW_N8N_API_KEY',
  }),
});

function text(value, max = 1000) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function openBaoBackend(options = {}) {
  if (options.backend) return options.backend;
  const { OpenBaoBackend } = require('/opt/3dvr/secrets-broker/openbao.js');
  return new OpenBaoBackend();
}

function isMissingSecretError(error) {
  return /(?:404|not found|missing|secret value is missing)/i.test(String(error?.message || error || ''));
}

function secretStatus(key, options = {}) {
  const secretKey = text(key, 500);
  if (!secretKey) throw new Error('secret key is required');
  const backend = openBaoBackend(options);
  if (typeof backend.ready === 'function' && !backend.ready()) {
    throw new Error('OpenBao backend is not configured');
  }
  try {
    const value = backend.get({ key: secretKey });
    const exists = typeof value === 'string' && value.length > 0;
    return { key: secretKey, exists, backend: 'openbao' };
  } catch (error) {
    if (isMissingSecretError(error)) return { key: secretKey, exists: false, backend: 'openbao' };
    throw error;
  }
}

function handoffStateFile(config = {}) {
  return text(config.THREEDVR_SECRET_HANDOFF_STATE || DEFAULT_HANDOFF_STATE, 2000);
}

function readHandoffState(config = {}) {
  const file = handoffStateFile(config);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      version: 1,
      requests: parsed?.requests && typeof parsed.requests === 'object' ? parsed.requests : {},
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return { version: 1, requests: {} };
    throw error;
  }
}

function writeHandoffState(config, state) {
  const file = handoffStateFile(config);
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2) + '\n', {
    encoding: 'utf8', mode: 0o600, flag: 'wx',
  });
  fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, file);
}

function pruneHandoffState(state, now = Date.now()) {
  for (const [id, record] of Object.entries(state.requests || {})) {
    const expiresAt = Date.parse(record?.expiresAt || '');
    const completedAt = Date.parse(record?.submittedAt || record?.cancelledAt || '');
    if ((Number.isFinite(expiresAt) && expiresAt < now - 7 * 86400000)
      || (Number.isFinite(completedAt) && completedAt < now - 30 * 86400000)) {
      delete state.requests[id];
    }
  }
}

async function createSecretHandoff({
  key,
  label,
  purpose = '',
  recipient = '',
  ttlMinutes = 1440,
} = {}, options = {}) {
  const config = options.config || process.env;
  const secretKey = text(key, 500);
  const humanLabel = text(label || key, 200);
  const normalizedPurpose = text(purpose, 1000);
  const normalizedRecipient = text(recipient, 200);
  const lifetime = Math.max(10, Math.min(Number(ttlMinutes) || 1440, 10080));
  if (!secretKey || !humanLabel) throw new Error('destination key and label are required');

  const id = `sh-${crypto.randomBytes(12).toString('base64url')}`;
  const token = crypto.randomBytes(32).toString('base64url');
  const keyPair = await crypto.webcrypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'],
  );
  const publicKey = await crypto.webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKey = await crypto.webcrypto.subtle.exportKey('jwk', keyPair.privateKey);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + lifetime * 60000).toISOString();
  const state = readHandoffState(config);
  pruneHandoffState(state);
  state.requests[id] = {
    id,
    key: secretKey,
    label: humanLabel,
    purpose: normalizedPurpose,
    recipient: normalizedRecipient,
    createdAt,
    expiresAt,
    status: 'pending',
    tokenHash: crypto.createHash('sha256').update(token, 'utf8').digest('hex'),
    publicKey,
    privateKey,
    protocol: '3dvr-secret-handoff/1',
    createdBy: 'local-control-mcp',
  };
  writeHandoffState(config, state);

  const origin = text(
    config.THREEDVR_SECRET_HANDOFF_PUBLIC_ORIGIN || DEFAULT_HANDOFF_ORIGIN,
    1000,
  ).replace(/\/+$/, '');
  return {
    ok: true,
    id,
    key: secretKey,
    expiresAt,
    shareUrl: `${origin}/secret-handoff/?id=${encodeURIComponent(id)}#token=${token}`,
    protocol: '3dvr-secret-handoff/1',
  };
}

function n8nTargets(config = process.env) {
  const targets = { ...DEFAULT_N8N_TARGETS };
  const raw = text(config.THREEDVR_N8N_TARGETS_JSON, 10000);
  if (raw) {
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { throw new Error('THREEDVR_N8N_TARGETS_JSON is invalid JSON'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('THREEDVR_N8N_TARGETS_JSON must be an object');
    }
    for (const [id, target] of Object.entries(parsed)) {
      if (!target || typeof target !== 'object' || Array.isArray(target)) continue;
      targets[id] = {
        label: text(target.label || id, 200),
        baseUrl: text(target.baseUrl, 2000),
        secretKey: text(target.secretKey, 500),
      };
    }
  }
  return targets;
}

function resolveN8nTarget(targetId, config = process.env) {
  const id = text(targetId || 'cvw', 100);
  const target = n8nTargets(config)[id];
  if (!target) throw new Error(`unknown n8n target: ${id}`);
  if (!/^https:\/\//i.test(target.baseUrl || '')) {
    throw new Error(`n8n target must use HTTPS: ${id}`);
  }
  if (!target.secretKey) throw new Error(`n8n target has no secret key mapping: ${id}`);
  return { id, ...target, baseUrl: target.baseUrl.replace(/\/+$/, '') };
}

async function readJsonResponse(response) {
  const raw = await response.text();
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch { throw new Error(`n8n returned non-JSON response (${response.status})`); }
}

async function n8nApiRequest(targetId, pathname, {
  query = {},
  config = process.env,
  fetchImpl = globalThis.fetch,
  backend,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable');
  const target = resolveN8nTarget(targetId, config);
  const secretBackend = openBaoBackend({ backend });
  if (typeof secretBackend.ready === 'function' && !secretBackend.ready()) {
    throw new Error('OpenBao backend is not configured');
  }

  let apiKey = secretBackend.get({ key: target.secretKey });
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('n8n API key is unavailable');
  apiKey = apiKey.trim();
  const url = new URL(pathname, `${target.baseUrl}/`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-N8N-API-KEY': apiKey },
      redirect: 'manual',
    });
  } finally {
    apiKey = '';
  }

  if (response.status >= 300 && response.status < 400) {
    throw new Error(`n8n API redirected unexpectedly (${response.status})`);
  }
  if (!response.ok) throw new Error(`n8n API request failed (${response.status})`);
  return { target, status: response.status, body: await readJsonResponse(response) };
}

async function n8nStatus(targetId = 'cvw', options = {}) {
  const config = options.config || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const target = resolveN8nTarget(targetId, config);
  let health = { ok: false, status: 0 };
  try {
    const response = await fetchImpl(new URL('/healthz', `${target.baseUrl}/`), {
      headers: { Accept: 'application/json' },
      redirect: 'manual',
    });
    health = { ok: response.ok, status: response.status };
  } catch {}

  const api = await n8nApiRequest(target.id, '/api/v1/workflows', {
    query: { limit: 1, excludePinnedData: true },
    ...options,
    config,
    fetchImpl,
  });
  return {
    target: { id: target.id, label: target.label, baseUrl: target.baseUrl },
    health,
    api: { ok: true, status: api.status, authorized: true },
  };
}

function safeWorkflow(row = {}) {
  return {
    id: String(row.id ?? ''),
    name: text(row.name, 300),
    active: Boolean(row.active),
    isArchived: Boolean(row.isArchived),
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
    tags: Array.isArray(row.tags)
      ? row.tags.slice(0, 20).map(tag => ({ id: String(tag?.id ?? ''), name: text(tag?.name, 200) }))
      : [],
  };
}

async function n8nWorkflows({
  target = 'cvw',
  active,
  limit = 25,
} = {}, options = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
  const result = await n8nApiRequest(target, '/api/v1/workflows', {
    query: {
      limit: safeLimit,
      excludePinnedData: true,
      ...(typeof active === 'boolean' ? { active } : {}),
    },
    ...options,
  });
  const rows = Array.isArray(result.body?.data) ? result.body.data : [];
  return {
    target: { id: result.target.id, label: result.target.label },
    workflows: rows.map(safeWorkflow),
    nextCursor: text(result.body?.nextCursor, 1000) || null,
  };
}

function safeExecution(row = {}) {
  return {
    id: String(row.id ?? ''),
    workflowId: String(row.workflowId ?? ''),
    status: text(row.status, 50),
    mode: text(row.mode, 50),
    finished: Boolean(row.finished),
    startedAt: row.startedAt || null,
    stoppedAt: row.stoppedAt || null,
    waitTill: row.waitTill || null,
    retryOf: row.retryOf == null ? null : String(row.retryOf),
    retrySuccessId: row.retrySuccessId == null ? null : String(row.retrySuccessId),
  };
}

async function n8nExecutions({
  target = 'cvw',
  workflowId,
  status,
  limit = 25,
} = {}, options = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
  const result = await n8nApiRequest(target, '/api/v1/executions', {
    query: {
      limit: safeLimit,
      includeData: false,
      ...(workflowId ? { workflowId: text(workflowId, 200) } : {}),
      ...(status ? { status: text(status, 50) } : {}),
    },
    ...options,
  });
  const rows = Array.isArray(result.body?.data) ? result.body.data : [];
  return {
    target: { id: result.target.id, label: result.target.label },
    executions: rows.map(safeExecution),
    nextCursor: text(result.body?.nextCursor, 1000) || null,
  };
}

module.exports = {
  DEFAULT_N8N_TARGETS,
  createSecretHandoff,
  n8nApiRequest,
  n8nExecutions,
  n8nStatus,
  n8nTargets,
  n8nWorkflows,
  resolveN8nTarget,
  secretStatus,
};
