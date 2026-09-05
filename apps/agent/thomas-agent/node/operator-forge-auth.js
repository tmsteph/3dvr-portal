const path = require('node:path');

const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const BUILTIN_OPERATOR_OWNER_BINDINGS = Object.freeze({
  'tmsteph@3dvr': 'Cg-NVNIbxWPDBqX7OmllJQqjxy2t3KA_U2DqQBjcPQ8.1fppECqamDOHh2tKt1G5t8Yd21NjBCZ3C6qunST3lvg',
});
const BUILTIN_OPERATOR_OWNER_PUBS = Object.freeze(
  [...new Set(Object.values(BUILTIN_OPERATOR_OWNER_BINDINGS))]
);
const BUILTIN_OPERATOR_ADMIN_BINDINGS = Object.freeze({
  'chatgpt-operator-e18d7ed6@3dvr': 'jcsaMMOmGSjWVJOtiPHI3hZWsudATRhOglXRdDatfSA.pzn7gtgVsDxfbV_md8B4a_W4eNTOavwnZwFU0qOtYcU',
});
const BUILTIN_OPERATOR_DEVELOPER_BINDINGS = Object.freeze({
  'operator-secure-e2e-1787643003@3dvr': 'ANISeXozjNF0rrLuDI9HTIh6Mk3UuHIwUa_WpURZhGc.vnOeQy3vExpG07dGXPOAB1PAQ9iskI2SKnYOLbEhYSY',
  'tmsteph@3dvr': 'Cg-NVNIbxWPDBqX7OmllJQqjxy2t3KA_U2DqQBjcPQ8.1fppECqamDOHh2tKt1G5t8Yd21NjBCZ3C6qunST3lvg',
});

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeAlias(value = '') {
  return normalizeText(value).toLowerCase();
}

function decodeForgeProof(value = '') {
  const proof = normalizeText(value);
  if (!proof.startsWith('b64:')) return proof;
  try {
    return Buffer.from(proof.slice(4), 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function listFromConfig(value = '') {
  return String(value || '')
    .split(',')
    .map(item => normalizeText(item))
    .filter(Boolean);
}

function parseBindings(value = '') {
  let parsed = {};
  try {
    parsed = JSON.parse(String(value || '{}'));
  } catch {}
  const bindings = new Map();
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return bindings;
  for (const [alias, pub] of Object.entries(parsed)) {
    const normalizedAlias = normalizeAlias(alias);
    const normalizedPub = normalizeText(pub);
    if (normalizedAlias && normalizedPub) bindings.set(normalizedAlias, normalizedPub);
  }
  return bindings;
}

function withBuiltinBindings(bindings, builtins) {
  for (const [alias, pub] of Object.entries(builtins)) {
    const normalizedAlias = normalizeAlias(alias);
    const normalizedPub = normalizeText(pub);
    if (normalizedAlias && normalizedPub && !bindings.has(normalizedAlias)) {
      bindings.set(normalizedAlias, normalizedPub);
    }
  }
  return bindings;
}

function resolvePolicy(env = process.env) {
  const ownerBindings = withBuiltinBindings(
    parseBindings(env.THREEDVR_OPERATOR_OWNER_BINDINGS),
    BUILTIN_OPERATOR_OWNER_BINDINGS
  );
  return {
    ownerPubs: new Set([
      ...ownerBindings.values(),
      ...listFromConfig(env.THREEDVR_OPERATOR_OWNER_PUBS),
    ]),
    ownerBindings,
    adminPubs: new Set(listFromConfig(env.THREEDVR_OPERATOR_ADMIN_PUBS)),
    adminBindings: withBuiltinBindings(
      parseBindings(env.THREEDVR_OPERATOR_ADMIN_BINDINGS),
      BUILTIN_OPERATOR_ADMIN_BINDINGS
    ),
    pubs: new Set(listFromConfig(env.THREEDVR_OPERATOR_DEVELOPER_PUBS)),
    bindings: withBuiltinBindings(
      parseBindings(env.THREEDVR_OPERATOR_DEVELOPER_BINDINGS),
      BUILTIN_OPERATOR_DEVELOPER_BINDINGS
    ),
  };
}

function resolveRepoAlias(repoAlias, env = process.env) {
  const alias = normalizeText(repoAlias).toLowerCase() || 'portal';
  const portalRoot = path.resolve(
    env.THREEDVR_OPERATOR_PORTAL_REPO
      || env.THREEDVR_AGENT_PORTAL_REPO
      || path.resolve(__dirname, '..', '..', '..', '..')
  );
  const builtins = {
    portal: portalRoot,
    agent: path.join(portalRoot, 'apps', 'agent'),
  };
  let extras = {};
  try {
    extras = JSON.parse(env.THREEDVR_OPERATOR_REPO_MAP || '{}');
  } catch {}
  const candidate = builtins[alias] || extras?.[alias];
  return candidate ? path.resolve(candidate) : '';
}

async function defaultVerify(proof, pub) {
  const Gun = require('gun');
  require('gun/sea');
  return Gun.SEA.verify(proof, pub);
}

function resolveMaxAgeMs(env = process.env, override) {
  if (Number.isFinite(override)) return override;
  const configured = Number.parseInt(String(env.THREEDVR_OPERATOR_PROOF_MAX_AGE_MS || ''), 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_AGE_MS;
}

async function authorizePortalOperatorTask(record = {}, options = {}) {
  if (normalizeText(record.requestedBy) !== 'portal-operator') {
    return { ok: false, reason: 'untrusted forge request producer' };
  }

  const authProof = decodeForgeProof(record.authProof);
  const authPub = normalizeText(record.authPub);
  if (!authProof || !authPub) return { ok: false, reason: 'missing 3DVR developer proof' };

  const verify = options.verifyImpl || defaultVerify;
  let verified;
  try {
    verified = await verify(authProof, authPub);
  } catch (_error) {
    return { ok: false, reason: 'invalid 3DVR developer proof' };
  }
  if (!verified || typeof verified !== 'object') return { ok: false, reason: 'invalid 3DVR developer proof' };

  const env = options.env || process.env;
  const issuedAt = Number(verified.iat);
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const maxAgeMs = resolveMaxAgeMs(env, options.maxAgeMs);
  if (!Number.isFinite(issuedAt) || issuedAt > now + 60_000 || now - issuedAt > maxAgeMs) {
    return { ok: false, reason: 'expired 3DVR developer proof' };
  }
  const expiresAt = Number(verified.exp);
  if (Number.isFinite(expiresAt) && now > expiresAt) {
    return { ok: false, reason: 'expired 3DVR developer proof' };
  }
  if (normalizeText(verified.scope) !== 'operator-forge-task') return { ok: false, reason: 'wrong forge proof scope' };
  if (normalizeText(verified.action) !== 'queue-code-change') return { ok: false, reason: 'wrong forge proof action' };
  if (normalizeText(verified.pub) !== authPub) return { ok: false, reason: 'forge proof pub mismatch' };
  if (normalizeText(verified.taskId) !== normalizeText(record.id)) return { ok: false, reason: 'forge proof task mismatch' };
  if (normalizeText(verified.repo).toLowerCase() !== normalizeText(record.repo).toLowerCase()) return { ok: false, reason: 'forge proof repo mismatch' };
  if (normalizeText(verified.task) !== normalizeText(record.task)) return { ok: false, reason: 'forge proof content mismatch' };
  if (Boolean(verified.githubWriteRequested) !== Boolean(record.githubWriteRequested)) {
    return { ok: false, reason: 'forge proof GitHub intent mismatch' };
  }

  const policy = resolvePolicy(env);
  const alias = normalizeAlias(verified.alias);
  const owner = policy.ownerPubs.has(authPub) || policy.ownerBindings.get(alias) === authPub;
  const admin = owner || policy.adminPubs.has(authPub) || policy.adminBindings.get(alias) === authPub;
  const developer = admin || policy.pubs.has(authPub) || policy.bindings.get(alias) === authPub;
  if (!developer) return { ok: false, reason: '3DVR account is not approved for code edits' };
  if (record.githubWriteRequested && !owner) return { ok: false, reason: '3DVR owner authorization is required for GitHub writes' };

  const repoPath = resolveRepoAlias(record.repo, env);
  if (!repoPath) return { ok: false, reason: `repo is not approved: ${normalizeText(record.repo) || 'unknown'}` };

  return {
    ok: true,
    repoPath,
    role: owner ? 'owner' : admin ? 'admin' : 'developer',
    githubWriteApproved: Boolean(record.githubWriteRequested && owner),
    identity: {
      alias: normalizeText(verified.alias),
      pub: authPub,
    },
  };
}

module.exports = {
  authorizePortalOperatorTask,
  resolvePolicy,
  resolveRepoAlias,
  BUILTIN_OPERATOR_OWNER_BINDINGS,
  BUILTIN_OPERATOR_OWNER_PUBS,
  BUILTIN_OPERATOR_ADMIN_BINDINGS,
  BUILTIN_OPERATOR_DEVELOPER_BINDINGS,
  decodeForgeProof,
};
