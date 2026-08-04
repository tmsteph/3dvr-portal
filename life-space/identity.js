(function initLifeSpaceIdentity(global) {
  const chip = global.document?.getElementById('identity-chip');
  if (!chip) return;

  const clean = value => typeof value === 'string' ? value.trim() : '';
  const displayFromAlias = alias => {
    const normalized = clean(alias);
    return normalized.includes('@') ? normalized.split('@')[0] : normalized;
  };

  function readIdentity() {
    global.AuthIdentity?.syncStorageFromSharedIdentity?.(global.localStorage);
    const shared = global.AuthIdentity?.readSharedIdentity?.() || {};
    const storedSignedIn = global.localStorage?.getItem('signedIn') === 'true';
    const signedIn = shared.signedIn === true || storedSignedIn;
    const username = clean(shared.username)
      || clean(global.localStorage?.getItem('username'))
      || displayFromAlias(shared.alias)
      || displayFromAlias(global.localStorage?.getItem('alias'));
    return {
      signedIn: Boolean(signedIn && username && username.toLowerCase() !== 'guest'),
      username
    };
  }

  function render() {
    const identity = readIdentity();
    const name = identity.signedIn ? identity.username : 'Guest';
    chip.textContent = name;
    chip.dataset.authState = identity.signedIn ? 'signed-in' : 'guest';
    chip.href = identity.signedIn
      ? '/profile.html'
      : `/sign-in.html?redirect=${encodeURIComponent(global.location?.pathname || '/life-space/')}`;
    chip.title = identity.signedIn ? `Open ${name}'s profile` : 'Sign in to sync Life Space';
    chip.setAttribute('aria-label', chip.title);
  }

  render();
  global.addEventListener?.('pageshow', render);
  global.addEventListener?.('focus', render);
  global.addEventListener?.('storage', render);
})(typeof window !== 'undefined' ? window : globalThis);
