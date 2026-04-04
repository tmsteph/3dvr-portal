export const PORTAL_OAUTH_AUTH_METHOD = 'oauth';
export const PORTAL_OAUTH_RESULT_KEY = 'portal.oauth.result';
export const PORTAL_OAUTH_CONNECTIONS_KEY = 'portal.oauth.connections';
export const PORTAL_OAUTH_CONTACTS_ROOT = 'contacts-users';

export function normalizeOAuthText(value = '') {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeOAuthEmail(value = '') {
  return normalizeOAuthText(value).toLowerCase();
}

export function slugifyOAuthIdentityKey(value = '', fallback = 'user') {
  const normalized = normalizeOAuthText(value).toLowerCase();
  if (!normalized) {
    return fallback;
  }
  const slug = normalized
    .replace(/[^a-z0-9@._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

export function buildOAuthFallbackAlias(provider = '', providerAccountId = '') {
  const normalizedProvider = normalizeOAuthText(provider).toLowerCase() || 'oauth';
  const normalizedAccountId = slugifyOAuthIdentityKey(providerAccountId, 'user').replace(/[@.]/g, '-');
  return `${normalizedProvider}-${normalizedAccountId}@oauth.3dvr`;
}

export function getStoredAuthMethod(storageLike = globalThis.localStorage) {
  try {
    return normalizeOAuthText(storageLike?.getItem?.('authMethod') || '');
  } catch (_err) {
    return '';
  }
}

export function isOAuthSession(storageLike = globalThis.localStorage) {
  return getStoredAuthMethod(storageLike) === PORTAL_OAUTH_AUTH_METHOD;
}

export function getOAuthContactsNodeKey(alias = '') {
  return slugifyOAuthIdentityKey(alias, 'user');
}
