const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;
const REMOTE_ACTIONS = new Set(['status', 'provision', 'start', 'stop']);
const CONTROL_SCOPE = 'freelancer-workspace-control-v1';

function normalizeText(value = '', max = 12000) {
  return String(value || '').trim().slice(0, max);
}

function normalizeWorkspaceSlug(value = '') {
  const normalized = normalizeText(value, 180)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 52);
  if (!normalized) return 'worker';
  if (normalized.length < 3) return `${normalized}-worker`;
  return normalized;
}

function workspaceIdForIdentity(identity = {}) {
  const pub = normalizeText(identity.pub, 500);
  const alias = normalizeText(identity.alias, 200);
  const stableSource = pub || alias;
  if (!stableSource) throw new Error('A signed worker identity is required.');
  const prefix = normalizeWorkspaceSlug(alias.split('@')[0] || 'worker').slice(0, 24);
  const suffix = normalizeWorkspaceSlug(stableSource).replace(/-/g, '').slice(-12) || 'workspace';
  return `fw-${prefix}-${suffix}`.slice(0, 63).replace(/-+$/g, '');
}

function parseCsvSet(value = '') {
  return new Set(String(value || '').split(',').map(item => item.trim()).filter(Boolean));
}

function isEnabled(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

async function defaultVerify(proof, pub) {
  const Gun = require('gun');
  require('gun/sea');
  return Gun.SEA.verify(proof, pub);
}

async function authorizeWorkspaceControlRecord(record = {}, options = {}) {
  if (normalizeText(record.status, 32) !== 'queued') return { ok: false, reason: 'workspace request is not queued' };
  const authProof = normalizeText(record.authProof);
  const authPub = normalizeText(record.authPub, 500);
  if (!authProof || !authPub) return { ok: false, reason: 'missing workspace control proof' };

  const verify = options.verifyImpl || defaultVerify;
  let verified;
  try {
    verified = await verify(authProof, authPub);
  } catch (_error) {
    return { ok: false, reason: 'invalid workspace control proof' };
  }
  if (!verified || typeof verified !== 'object') return { ok: false, reason: 'invalid workspace control proof' };

  const action = normalizeText(verified.action, 32);
  if (normalizeText(verified.scope, 80) !== CONTROL_SCOPE) return { ok: false, reason: 'wrong workspace proof scope' };
  if (!REMOTE_ACTIONS.has(action)) return { ok: false, reason: 'workspace action is not remotely allowed' };
  if (normalizeText(verified.pub, 500) !== authPub) return { ok: false, reason: 'workspace proof pub mismatch' };
  if (normalizeText(verified.requestId, 100) !== normalizeText(record.id, 100)) return { ok: false, reason: 'workspace proof request mismatch' };
  if (normalizeText(verified.workspaceId, 80) !== normalizeText(record.workspaceId, 80)) return { ok: false, reason: 'workspace proof id mismatch' };
  if (action !== normalizeText(record.action, 32)) return { ok: false, reason: 'workspace proof action mismatch' };

  const issuedAt = Number(verified.iat);
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const env = options.env || process.env;
  const configuredMaxAge = Number.parseInt(String(env.FREELANCER_WORKSPACE_PROOF_MAX_AGE_MS || ''), 10);
  const maxAgeMs = Number.isFinite(options.maxAgeMs) ? options.maxAgeMs : (Number.isFinite(configuredMaxAge) && configuredMaxAge > 0 ? configuredMaxAge : DEFAULT_MAX_AGE_MS);
  if (!Number.isFinite(issuedAt) || issuedAt > now + 60_000 || now - issuedAt > maxAgeMs) {
    return { ok: false, reason: 'expired workspace control proof' };
  }

  const identity = { pub: authPub, alias: normalizeText(verified.alias, 200) };
  let expectedWorkspaceId;
  try {
    expectedWorkspaceId = workspaceIdForIdentity(identity);
  } catch (_error) {
    return { ok: false, reason: 'workspace proof identity is incomplete' };
  }
  if (expectedWorkspaceId !== normalizeText(record.workspaceId, 80)) {
    return { ok: false, reason: 'workspace does not belong to signing identity' };
  }

  const allowedPubs = parseCsvSet(env.FREELANCER_WORKSPACE_ALLOWED_PUBS);
  if (allowedPubs.size && !allowedPubs.has(authPub)) return { ok: false, reason: 'workspace account is not enabled on this host' };
  if (action === 'provision' && !isEnabled(env.FREELANCER_WORKSPACE_ALLOW_PROVISION)) {
    return { ok: false, reason: 'workspace provisioning is disabled on this host' };
  }

  return {
    ok: true,
    action,
    workspaceId: expectedWorkspaceId,
    timezone: normalizeText(verified.timezone, 80) || 'UTC',
    identity,
  };
}

module.exports = {
  CONTROL_SCOPE,
  authorizeWorkspaceControlRecord,
  workspaceIdForIdentity,
};
