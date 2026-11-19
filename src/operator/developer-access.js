import { resolveSeaAuthMaxAgeMs, verifySignedSeaPayload } from '../auth/sea.js';
import {
  OPERATOR_PERMISSIONS as FORK_OPERATOR_PERMISSIONS,
  findForksForIdentity,
  isForkActive,
  parseForkRecords,
  resolveForkPermissions
} from '../agents/fork-contract.js';

export const DEFAULT_OPERATOR_DEVELOPER_ALIAS = '3dvr.tech@gmail.com';
export const BUILTIN_OPERATOR_OWNER_BINDINGS = Object.freeze({
  'tmsteph@3dvr': 'Cg-NVNIbxWPDBqX7OmllJQqjxy2t3KA_U2DqQBjcPQ8.1fppECqamDOHh2tKt1G5t8Yd21NjBCZ3C6qunST3lvg',
});
export const BUILTIN_OPERATOR_OWNER_PUBS = Object.freeze(
  [...new Set(Object.values(BUILTIN_OPERATOR_OWNER_BINDINGS))]
);
export const BUILTIN_OPERATOR_ADMIN_BINDINGS = Object.freeze({
  'chatgpt-operator-e18d7ed6@3dvr': 'jcsaMMOmGSjWVJOtiPHI3hZWsudATRhOglXRdDatfSA.pzn7gtgVsDxfbV_md8B4a_W4eNTOavwnZwFU0qOtYcU',
  // Muse's forked agent account (fork_claude_pilot). Bound by its verified
  // SEA public key, never by username alone. Admin here means it may submit
  // and track operator tasks as itself; it does not approve R2 actions,
  // which stay with the owner, and it holds no payment authority.
  'claude@3dvr': '67t3RM6lGI93oxzWB4_l8GPU_FLxLrArOzh93wJ1ZFY.WX4esGVbZvVTytLQlBDmIvmT6XkEo82HoOC51D30fWg',
});
export const BUILTIN_OPERATOR_DEVELOPER_BINDINGS = Object.freeze({
  'operator-secure-e2e-1787643003@3dvr': 'ANISeXozjNF0rrLuDI9HTIh6Mk3UuHIwUa_WpURZhGc.vnOeQy3vExpG07dGXPOAB1PAQ9iskI2SKnYOLbEhYSY',
  'tmsteph@3dvr': 'Cg-NVNIbxWPDBqX7OmllJQqjxy2t3KA_U2DqQBjcPQ8.1fppECqamDOHh2tKt1G5t8Yd21NjBCZ3C6qunST3lvg',
});

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

export function resolveOperatorDeveloperPolicy(config = process.env) {
  const ownerBindings = withBuiltinBindings(
    parseBindings(config.THREEDVR_OPERATOR_OWNER_BINDINGS),
    BUILTIN_OPERATOR_OWNER_BINDINGS
  );
  return {
    ownerPubs: new Set([
      ...ownerBindings.values(),
      ...listFromConfig(config.THREEDVR_OPERATOR_OWNER_PUBS),
    ]),
    ownerBindings,
    adminPubs: new Set(listFromConfig(config.THREEDVR_OPERATOR_ADMIN_PUBS)),
    adminBindings: withBuiltinBindings(
      parseBindings(config.THREEDVR_OPERATOR_ADMIN_BINDINGS),
      BUILTIN_OPERATOR_ADMIN_BINDINGS
    ),
    pubs: new Set(listFromConfig(config.THREEDVR_OPERATOR_DEVELOPER_PUBS)),
    bindings: withBuiltinBindings(
      parseBindings(config.THREEDVR_OPERATOR_DEVELOPER_BINDINGS),
      BUILTIN_OPERATOR_DEVELOPER_BINDINGS
    ),
    // Forked accounts (src/agents/fork-contract.js). Empty unless the
    // THREEDVR_FORKS env JSON defines fork records, so deployments without
    // forks resolve access exactly as before.
    forks: parseForkRecords(config.THREEDVR_FORKS)
  };
}

export async function resolveOperatorDeveloperAccess(payload = {}, options = {}) {
  const config = options.config || process.env;
  const verify = options.verify || verifySignedSeaPayload;
  const auth = await verify(payload, {
    scope: 'operator-developer-access',
    expectedOrigin: options.expectedOrigin,
    config,
    maxAgeMs: resolveSeaAuthMaxAgeMs(config),
    messages: {
      missing: 'Sign in with a 3DVR account to use developer actions.',
      verifyError: 'Refresh your 3DVR sign-in before using developer actions.',
      invalid: 'Refresh your 3DVR sign-in before using developer actions.',
      wrongScope: 'Developer proof had the wrong scope.',
      wrongPub: 'Developer proof did not match this 3DVR account.',
      expired: 'Developer proof expired. Refresh your 3DVR sign-in and try again.',
      wrongOrigin: 'Developer proof was issued for a different portal origin.'
    }
  });

  if (!auth.ok) {
    return {
      authenticated: false,
      approved: false,
      role: 'contributor',
      permissions: ['suggest'],
      reason: auth.reason || 'Developer access could not be verified.'
    };
  }

  const policy = resolveOperatorDeveloperPolicy(config);
  const alias = normalizeAlias(auth.identity.alias);
  const pub = normalizeText(auth.identity.pub);

  // Forked accounts resolve from their fork records instead of the binding
  // ladder: an active fork grants exactly the permissions Thomas recorded on
  // it, and a revoked fork grants none. Identities with no fork record are
  // untouched and follow the bindings below, exactly as before.
  const forks = Array.isArray(options.forks) ? options.forks : policy.forks;
  const identityForks = findForksForIdentity(forks, { alias, pub });
  if (identityForks.length) {
    const identity = { alias: auth.identity.alias, pub };
    if (!identityForks.some(isForkActive)) {
      return {
        authenticated: true,
        approved: false,
        role: 'contributor',
        permissions: [],
        identity,
        viaFork: true,
        reason: 'This forked account has been revoked by its parent account.'
      };
    }
    const permissions = resolveForkPermissions(identityForks, { alias, pub })
      .filter(permission => FORK_OPERATOR_PERMISSIONS.includes(permission));
    return {
      authenticated: true,
      approved: permissions.includes('edit'),
      role: permissions.includes('admin')
        ? 'admin'
        : permissions.includes('edit')
          ? 'developer'
          : 'contributor',
      permissions,
      identity,
      viaFork: true,
      reason: permissions.includes('edit')
        ? ''
        : 'This forked account can submit suggestions but is not approved for code edits yet.'
    };
  }

  const owner = policy.ownerPubs.has(pub) || policy.ownerBindings.get(alias) === pub;
  const admin = owner || policy.adminPubs.has(pub) || policy.adminBindings.get(alias) === pub;
  const developer = admin || policy.pubs.has(pub) || policy.bindings.get(alias) === pub;

  return {
    authenticated: true,
    approved: developer,
    role: owner ? 'owner' : admin ? 'admin' : developer ? 'developer' : 'contributor',
    permissions: owner
      ? ['suggest', 'edit', 'github_write']
      : admin
        ? ['suggest', 'edit', 'admin']
        : developer
          ? ['suggest', 'edit']
          : ['suggest'],
    identity: {
      alias: auth.identity.alias,
      pub
    },
    reason: developer ? '' : 'This 3DVR account can submit suggestions but is not approved for code edits yet.'
  };
}
