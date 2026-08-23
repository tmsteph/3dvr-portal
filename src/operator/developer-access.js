import { resolveSeaAuthMaxAgeMs, verifySignedSeaPayload } from '../auth/sea.js';

export const DEFAULT_OPERATOR_DEVELOPER_ALIAS = '3dvr.tech@gmail.com';

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

export function resolveOperatorDeveloperPolicy(config = process.env) {
  const aliases = listFromConfig(config.THREEDVR_OPERATOR_DEVELOPER_ALIASES || DEFAULT_OPERATOR_DEVELOPER_ALIAS)
    .map(normalizeAlias);
  const pubs = listFromConfig(config.THREEDVR_OPERATOR_DEVELOPER_PUBS);
  return {
    aliases: new Set(aliases),
    pubs: new Set(pubs)
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
  const approved = policy.aliases.has(alias) || policy.pubs.has(pub);

  return {
    authenticated: true,
    approved,
    role: approved ? 'developer' : 'contributor',
    permissions: approved ? ['suggest', 'edit'] : ['suggest'],
    identity: {
      alias: auth.identity.alias,
      pub
    },
    reason: approved ? '' : 'This 3DVR account can submit suggestions but is not approved for code edits yet.'
  };
}
