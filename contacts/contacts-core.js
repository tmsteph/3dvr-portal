export function aliasToDisplay(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return '';
  if (normalized.includes('@')) {
    return normalized.split('@')[0];
  }
  return normalized;
}

export function deriveIdentityState({
  authState,
  storedAlias = '',
  storedUsername = '',
  aliasFromSession = '',
  usernameFromSession = '',
} = {}) {
  const normalize = value => (typeof value === 'string' ? value.trim() : '');
  const mode = authState?.mode || 'anon';
  const sessionAlias = normalize(aliasFromSession);
  const sessionUsername = normalize(usernameFromSession);
  const storedAliasNormalized = normalize(storedAlias);
  const storedUsernameNormalized = normalize(storedUsername);

  let signedIn = mode === 'user';
  let guest = mode === 'guest';
  let alias = '';
  let username = '';

  if (!signedIn && (sessionAlias || sessionUsername)) {
    signedIn = true;
    guest = false;
  }

  if (signedIn) {
    alias = normalize(authState?.alias) || sessionAlias || storedAliasNormalized;
    username = normalize(authState?.username) || sessionUsername || storedUsernameNormalized;
    if (!username) {
      username = aliasToDisplay(alias) || 'User';
    }
  } else if (guest) {
    alias = storedAliasNormalized;
    username = storedUsernameNormalized || 'Guest';
  } else {
    alias = storedAliasNormalized;
    username = storedUsernameNormalized;
  }

  const displayName = signedIn
    ? username
    : guest
    ? 'Guest'
    : username || aliasToDisplay(alias) || 'Guest';

  return { signedIn, guest, alias, username, displayName };
}

export function deriveFloatingIdentityDisplay({
  latestDisplayName = '',
  signedIn = false,
  guest = false,
  username = '',
  storedUsername = '',
  alias = '',
  guestDisplayName = '',
} = {}) {
  const normalizedHint = typeof latestDisplayName === 'string' ? latestDisplayName.trim() : '';
  if (normalizedHint) {
    return normalizedHint;
  }

  const aliasDisplay = aliasToDisplay(alias);

  if (signedIn) {
    const normalizedUsername = typeof username === 'string' ? username.trim() : '';
    const normalizedStored = typeof storedUsername === 'string' ? storedUsername.trim() : '';
    return normalizedUsername || normalizedStored || aliasDisplay || 'User';
  }

  if (guest) {
    const normalizedGuest = typeof guestDisplayName === 'string' ? guestDisplayName.trim() : '';
    return normalizedGuest || aliasDisplay || 'Guest';
  }

  return aliasDisplay || 'Guest';
}

const DEFAULT_PORTAL_ORIGIN = 'https://3dvr-portal.vercel.app';

export function isContactsSubpath(pathname = '') {
  const normalizedPath = typeof pathname === 'string' ? pathname.trim() : '';
  if (!normalizedPath) return false;
  return normalizedPath === '/contacts' || normalizedPath.startsWith('/contacts/');
}

export function normalizeOrigin(value = '') {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';
  if (!normalizedValue) return '';
  try {
    return new URL(normalizedValue).origin;
  } catch (_err) {
    return '';
  }
}

export function resolvePortalOrigin({
  configuredOrigin = '',
  currentOrigin = '',
  pathname = '',
  fallbackOrigin = DEFAULT_PORTAL_ORIGIN,
} = {}) {
  const configured = normalizeOrigin(configuredOrigin);
  if (configured) return configured;

  const current = normalizeOrigin(currentOrigin);
  if (isContactsSubpath(pathname) && current) {
    return current;
  }

  const fallback = normalizeOrigin(fallbackOrigin);
  if (fallback) return fallback;
  if (current) return current;
  return DEFAULT_PORTAL_ORIGIN;
}

export function toPortalHref(path = '/', originOptions = {}) {
  const value = typeof path === 'string' ? path.trim() : '';
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  const normalizedPath = value ? (value.startsWith('/') ? value : `/${value}`) : '/';
  const portalOrigin = resolvePortalOrigin(originOptions);
  return new URL(normalizedPath, `${portalOrigin}/`).toString();
}

export function resolveSpaceNode({
  space,
  signedIn,
  userHasSession,
  user,
  gun,
  guestsRoot,
  guestId,
  orgSpaceKey = 'org-3dvr-demo',
} = {}) {
  const normalizedSpace = typeof space === 'string' && space ? space : 'personal';

  if (normalizedSpace === 'personal') {
    if (userHasSession && user && typeof user.get === 'function') {
      return {
        node: user.get('contacts'),
        requiresAuth: false,
        shouldClearAuth: true,
        legacyNodes: [],
      };
    }
    if (signedIn) {
      return {
        node: null,
        requiresAuth: true,
        shouldClearAuth: false,
        legacyNodes: [],
      };
    }
    if (guestId && guestsRoot && typeof guestsRoot.get === 'function') {
      const guestNode = guestsRoot.get(guestId);
      if (guestNode && typeof guestNode.get === 'function') {
        return {
          node: guestNode.get('contacts'),
          requiresAuth: false,
          shouldClearAuth: false,
          legacyNodes: [],
        };
      }
    }
    return {
      node: null,
      requiresAuth: false,
      shouldClearAuth: false,
      legacyNodes: [],
    };
  }

  if (!gun || typeof gun.get !== 'function') {
    return {
      node: null,
      requiresAuth: false,
      shouldClearAuth: false,
      legacyNodes: [],
    };
  }

  if (normalizedSpace === 'org-3dvr') {
    const orgRoot = gun.get(orgSpaceKey);
    const legacyOrgContacts = orgRoot && typeof orgRoot.get === 'function'
      ? orgRoot.get('contacts')
      : null;
    return {
      node: orgRoot,
      requiresAuth: false,
      shouldClearAuth: false,
      // CRM and contacts now share the same top-level org node; keep the legacy child for migration.
      legacyNodes: legacyOrgContacts ? [legacyOrgContacts] : [],
    };
  }

  if (normalizedSpace === 'public-demo') {
    const publicRoot = gun.get('contacts-public');
    const legacyPublicContacts = publicRoot && typeof publicRoot.get === 'function'
      ? publicRoot.get('contacts')
      : null;
    return {
      node: publicRoot,
      requiresAuth: false,
      shouldClearAuth: false,
      // Align with CRM's workspace path and observe the legacy collection so we can migrate data.
      legacyNodes: legacyPublicContacts ? [legacyPublicContacts] : [],
    };
  }

  const spaceRoot = gun.get(normalizedSpace);
  const legacySpaceContacts = spaceRoot && typeof spaceRoot.get === 'function'
    ? spaceRoot.get('contacts')
    : null;
  return {
    node: spaceRoot,
    requiresAuth: false,
    shouldClearAuth: false,
    // Default to the shared root node while honoring any historical `contacts` child collections.
    legacyNodes: legacySpaceContacts ? [legacySpaceContacts] : [],
  };
}

if (typeof window !== 'undefined') {
  window.ContactsCore = {
    aliasToDisplay,
    deriveIdentityState,
    deriveFloatingIdentityDisplay,
    isContactsSubpath,
    normalizeOrigin,
    resolvePortalOrigin,
    toPortalHref,
    resolveSpaceNode,
  };
}
