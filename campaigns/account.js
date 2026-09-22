(() => {
  const accountEntry = document.querySelector('[data-account-entry]');
  if (!accountEntry) return;

  const aliasToDisplay = alias => {
    const normalized = typeof alias === 'string' ? alias.trim() : '';
    if (!normalized) return '';
    return normalized.includes('@') ? normalized.split('@')[0] : normalized;
  };

  const readAccountState = () => {
    try {
      window.AuthIdentity?.syncStorageFromSharedIdentity?.(localStorage);
    } catch (error) {
      console.warn('Campaign account identity sync unavailable.', error);
    }

    const shared = window.AuthIdentity?.readSharedIdentity?.() || {};
    const signedIn = localStorage.getItem('signedIn') === 'true';
    const alias = (localStorage.getItem('alias') || shared.alias || '').trim();
    const username = (localStorage.getItem('username') || shared.username || '').trim();
    return {
      signedIn,
      alias,
      displayName: signedIn ? username || aliasToDisplay(alias) || 'User' : ''
    };
  };

  const readCachedPoints = state => {
    if (!state.signedIn || !state.alias) return 0;
    try {
      const key = `3dvr:score:user:${state.alias.toLowerCase()}`;
      return [key, `${key}:pending`, `${key}:portalPending`]
        .map(cacheKey => Number(localStorage.getItem(cacheKey) || 0))
        .filter(Number.isFinite)
        .reduce((best, value) => Math.max(best, Math.max(0, Math.round(value))), 0);
    } catch {
      return 0;
    }
  };

  const render = () => {
    const state = readAccountState();
    if (!state.signedIn) {
      accountEntry.href = '/sign-in.html?redirect=%2Fcampaigns%2F';
      accountEntry.textContent = 'Sign in';
      accountEntry.setAttribute('aria-label', 'Sign in or create an account, then return to Campaigns');
      return;
    }

    const points = readCachedPoints(state);
    accountEntry.href = '/profile.html#profile';
    accountEntry.textContent = `${state.displayName} · ⭐ ${points}`;
    accountEntry.setAttribute('aria-label', `Open profile for ${state.displayName}. ${points} points.`);
  };

  render();
  window.addEventListener('storage', render);
  window.addEventListener('portal-auth:changed', render);
})();
