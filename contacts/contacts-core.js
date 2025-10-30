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
      };
    }
    if (signedIn) {
      return {
        node: null,
        requiresAuth: true,
        shouldClearAuth: false,
      };
    }
    if (guestId && guestsRoot && typeof guestsRoot.get === 'function') {
      const guestNode = guestsRoot.get(guestId);
      if (guestNode && typeof guestNode.get === 'function') {
        return {
          node: guestNode.get('contacts'),
          requiresAuth: false,
          shouldClearAuth: false,
        };
      }
    }
    return {
      node: null,
      requiresAuth: false,
      shouldClearAuth: false,
    };
  }

  if (!gun || typeof gun.get !== 'function') {
    return {
      node: null,
      requiresAuth: false,
      shouldClearAuth: false,
    };
  }

  if (normalizedSpace === 'org-3dvr') {
    return {
      node: gun.get(orgSpaceKey).get('contacts'),
      requiresAuth: false,
      shouldClearAuth: false,
    };
  }

  if (normalizedSpace === 'public-demo') {
    return {
      node: gun.get('contacts-public').get('contacts'),
      requiresAuth: false,
      shouldClearAuth: false,
    };
  }

  return {
    node: gun.get(normalizedSpace).get('contacts'),
    requiresAuth: false,
    shouldClearAuth: false,
  };
}

if (typeof window !== 'undefined') {
  window.ContactsCore = {
    aliasToDisplay,
    deriveIdentityState,
    deriveFloatingIdentityDisplay,
    resolveSpaceNode,
  };
}
