const path = require('node:path');

const DEFAULT_DEVELOPER_ALIAS = '3dvr.tech@gmail.com';
const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeAlias(value = '') {
  return normalizeText(value).toLowerCase();
}

function listFromConfig(value = '') {
  return String(value || '')
    .split(',')
    .map(item => normalizeText(item))
    .filter(Boolean);
}

function resolvePolicy(env = process.env) {
  return {
    aliases: new Set(listFromConfig(env.THREEDVR_OPERATOR_DEVELOPER_ALIASES || DEFAULT_DEVELOPER_ALIAS).map(normalizeAlias)),
    pubs: new Set(listFromConfig(env.THREEDVR_OPERATOR_DEVELOPER_PUBS)),
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

async function authorizePortalOperatorTask(record = {}, options = {}) {
  if (normalizeText(record.requestedBy) !== 'portal-operator') {
    return { ok: true, repoPath: normalizeText(record.repo) };
  }

  const authProof = normalizeText(record.authProof);
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

  const issuedAt = Number(verified.iat);
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const maxAgeMs = Number.isFinite(options.maxAgeMs) ? options.maxAgeMs : DEFAULT_MAX_AGE_MS;
  if (!Number.isFinite(issuedAt) || issuedAt > now + 60_000 || now - issuedAt > maxAgeMs) {
    return { ok: false, reason: 'expired 3DVR developer proof' };
  }
  if (normalizeText(verified.scope) !== 'operator-forge-task') return { ok: false, reason: 'wrong forge proof scope' };
  if (normalizeText(verified.action) !== 'queue-code-change') return { ok: false, reason: 'wrong forge proof action' };
  if (normalizeText(verified.pub) !== authPub) return { ok: false, reason: 'forge proof pub mismatch' };
  if (normalizeText(verified.taskId) !== normalizeText(record.id)) return { ok: false, reason: 'forge proof task mismatch' };
  if (normalizeText(verified.repo).toLowerCase() !== normalizeText(record.repo).toLowerCase()) return { ok: false, reason: 'forge proof repo mismatch' };
  if (normalizeText(verified.task) !== normalizeText(record.task)) return { ok: false, reason: 'forge proof content mismatch' };

  const policy = resolvePolicy(options.env || process.env);
  const alias = normalizeAlias(verified.alias);
  const approved = policy.aliases.has(alias) || policy.pubs.has(authPub);
  if (!approved) return { ok: false, reason: '3DVR account is not approved for code edits' };

  const repoPath = resolveRepoAlias(record.repo, options.env || process.env);
  if (!repoPath) return { ok: false, reason: `repo is not approved: ${normalizeText(record.repo) || 'unknown'}` };

  return {
    ok: true,
    repoPath,
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
};
