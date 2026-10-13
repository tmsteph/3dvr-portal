// navbar.js
// DO NOT re-create Gun or user here!
// Just use the global one from index.html.

function aliasToDisplay(alias) {
  const normalized = typeof alias === 'string' ? alias.trim() : '';
  if (!normalized) return '';
  if (normalized.includes('@')) {
    return normalized.split('@')[0];
  }
  return normalized;
}

function clearSharedIdentityCookie() {
  const base = 'portalIdentity=; Path=/; Max-Age=0; SameSite=Lax; Secure';
  document.cookie = base;
  const hostname = (window.location && window.location.hostname ? window.location.hostname : '').toLowerCase();
  if (hostname === '3dvr.tech' || hostname.endsWith('.3dvr.tech')) {
    document.cookie = `${base}; Domain=.3dvr.tech`;
  }
}

function currentSignInHref() {
  const currentPath = `${window.location.pathname || '/'}${window.location.search || ''}${window.location.hash || ''}`;
  return `/sign-in.html?redirect=${encodeURIComponent(currentPath || '/index.html')}`;
}

function hideUnreadyHomepageSections() {
  const systemLayers = document.getElementById('systemLayers');
  if (systemLayers) {
    systemLayers.remove();
  }
  document.querySelectorAll('a[href="#systemLayers"]').forEach(link => {
    link.remove();
  });
  document.querySelectorAll('.launcher-lanes').forEach(section => {
    section.remove();
  });
}

function ensureHomepageSearchShortcuts() {
  const topButtons = document.querySelector('.top-buttons');
  if (topButtons && !topButtons.querySelector('[data-home-search-shortcut]')) {
    const searchLink = document.createElement('a');
    searchLink.href = '#appSearch';
    searchLink.className = 'top-buttons__search-shortcut';
    searchLink.dataset.appSearchTrigger = 'true';
    searchLink.dataset.homeSearchShortcut = 'true';
    searchLink.textContent = 'Search apps';
    topButtons.insertAdjacentElement('afterbegin', searchLink);
  }

  const soberSpark = document.querySelector('a.app-card[href="sober-spark/"]');
  if (soberSpark) {
    const existingKeywords = soberSpark.dataset.appKeywords || '';
    if (!/\bdrugs?\b/i.test(existingKeywords)) {
      soberSpark.dataset.appKeywords = `${existingKeywords} drug drugs drug simulator drug stimulation psychedelic psychedelics altered state`.trim();
    }
    soberSpark.dataset.appMode = soberSpark.dataset.appMode || 'simple';
  }
}

function createNavbar() {
  ensureHomepageSearchShortcuts();
  hideUnreadyHomepageSections();
  document.querySelectorAll('.floating-identity').forEach(existingNav => {
    existingNav._menuAbort?.abort();
    existingNav.remove();
  });

  if (window.ScoreSystem && typeof window.ScoreSystem.recallUserSession === 'function') {
    window.ScoreSystem.recallUserSession(user);
  } else {
    try {
      user.recall({ sessionStorage: true, localStorage: true });
    } catch (err) {
      console.warn('Unable to recall user session', err);
    }
  }

  const nav = document.createElement('div');
  nav._menuAbort = new AbortController();
  nav.className = 'floating-identity';
  nav.setAttribute('aria-label', 'Account status');

  const stats = document.createElement('button');
  stats.type = 'button';
  stats.className = 'floating-identity__stats';
  stats.setAttribute('aria-label', 'Open account menu');
  stats.setAttribute('aria-haspopup', 'true');
  stats.setAttribute('aria-expanded', 'false');
  stats.title = 'Account menu';

  const usernameSpan = document.createElement('span');
  usernameSpan.className = 'floating-identity__label';

  const scoreSpan = document.createElement('span');
  scoreSpan.className = 'floating-identity__value';

  stats.appendChild(usernameSpan);
  stats.appendChild(scoreSpan);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'floating-identity__button';
  button.innerText = 'Sign Out';

  button.addEventListener('click', () => {
    if (isGuest) {
      window.location.href = currentSignInHref();
      return;
    }

    if (!isGuest) {
      try {
        user.leave();
      } catch (err) {
        console.warn('Error signing out', err);
      }
    }
    if (window.ScoreSystem) {
      window.ScoreSystem.resetManager();
    }
    localStorage.removeItem('signedIn');
    localStorage.removeItem('alias');
    localStorage.removeItem('username');
    localStorage.removeItem('password');
    localStorage.removeItem('guest');
    localStorage.removeItem('guestId');
    localStorage.removeItem('guestDisplayName');
    localStorage.removeItem('userId');
    localStorage.removeItem('userPubKey');
    clearSharedIdentityCookie();
    window.location.href = 'index.html';
  });

  const menu = document.createElement('div');
  menu.className = 'floating-identity__menu';
  menu.id = 'floatingAccountMenu';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  const menuStatus = document.createElement('div');
  menuStatus.className = 'floating-identity__menu-status';
  menuStatus.setAttribute('role', 'status');
  const menuLinks = [
    ['View profile', '/profile.html#profile'],
    ['Score & progress', '/score-rewards/'],
    ['Settings', '/profile.html#settings'],
    ['All apps', '/#appSearch']
  ];
  menu.appendChild(menuStatus);
  menuLinks.forEach(([label, href]) => {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = label;
    link.setAttribute('role', 'menuitem');
    menu.appendChild(link);
  });
  button.setAttribute('role', 'menuitem');
  menu.appendChild(button);
  nav.appendChild(stats);
  nav.appendChild(menu);
  const setMenuOpen = open => {
    menu.hidden = !open;
    stats.setAttribute('aria-expanded', String(open));
    if (open) menuStatus.textContent = usernameSpan.textContent + ' · ' + scoreSpan.textContent;
  };
  stats.addEventListener('click', () => setMenuOpen(menu.hidden));
  document.addEventListener('pointerdown', event => {
    if (nav.isConnected && !nav.contains(event.target)) setMenuOpen(false);
  }, { signal: (() => {
    // Listeners are tied to this navbar instance and cleaned up on rebuild.
    return nav._menuAbort.signal;
  })() });
  nav.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) {
      setMenuOpen(false);
      stats.focus();
    }
  });
  if (!document.getElementById('floatingAccountMenuStyles')) {
    const style = document.createElement('style');
    style.id = 'floatingAccountMenuStyles';
    style.textContent = `
      .floating-identity { position: relative; }
      .floating-identity__stats { cursor: pointer; font: inherit; }
      .floating-identity__menu[hidden] { display: none !important; }
      .floating-identity__menu { position: absolute; z-index: 1000; right: 0; top: calc(100% + 8px); min-width: 220px; max-width: min(320px, 90vw); padding: 10px; border: 1px solid rgba(140,160,190,.35); border-radius: 14px; background: #152032; color: #fff; box-shadow: 0 12px 32px #0006; display: grid; gap: 3px; }
      .floating-identity__menu-status { padding: 9px 11px; opacity: .8; font-size: .9rem; border-bottom: 1px solid #ffffff25; overflow-wrap: anywhere; }
      .floating-identity__menu a, .floating-identity__menu .floating-identity__button { display: block; width: 100%; box-sizing: border-box; text-align: left; padding: 11px 12px; border-radius: 8px; color: inherit; text-decoration: none; background: transparent; border: 0; font: inherit; cursor: pointer; }
      .floating-identity__menu a:hover, .floating-identity__menu a:focus-visible, .floating-identity__menu button:hover, .floating-identity__menu button:focus-visible { background: #ffffff20; outline-offset: 2px; }
    `;
    document.head.appendChild(style);
  }

  const topButtons = document.querySelector('.top-buttons');
  const landingHeader = document.querySelector('.landing-header');
  const landingShell = document.querySelector('.landing-shell');

  if (topButtons) {
    topButtons.insertAdjacentElement('afterend', nav);
  } else if (landingHeader) {
    landingHeader.insertAdjacentElement('afterend', nav);
  } else if (landingShell) {
    landingShell.insertAdjacentElement('afterbegin', nav);
  } else {
    document.body.appendChild(nav);
  }

  const isSignedIn = localStorage.getItem('signedIn') === 'true';
  const isGuest = !isSignedIn && localStorage.getItem('guest') === 'true';
  let latestDisplayName = '';
  let aliasDisplay = aliasToDisplay(localStorage.getItem('alias'));

  if (isGuest) {
    stats.setAttribute('aria-label', 'Open guest account menu');
    stats.title = 'Guest account menu';
    button.innerText = 'Sign in';
    button.setAttribute('aria-label', 'Sign in or create an account');
  }

  function updateNameDisplay() {
    if (latestDisplayName) {
      usernameSpan.innerText = `👤 ${latestDisplayName}`;
      return;
    }
    if (isSignedIn) {
      let stored = (localStorage.getItem('username') || '').trim();
      if (stored.toLowerCase() === 'guest') {
        stored = '';
      }
      const fallback = stored || aliasDisplay || 'Guest';
      usernameSpan.innerText = `👤 ${fallback}`;
      return;
    }
    if (isGuest) {
      const guestStored = (localStorage.getItem('guestDisplayName') || '').trim();
      const fallbackName = guestStored || aliasDisplay || 'Guest';
      usernameSpan.innerText = `👤 ${fallbackName}`;
      return;
    }
    usernameSpan.innerText = '👤 Guest';
  }

  function normalizeScore(value) {
    if (window.ScoreSystem && typeof window.ScoreSystem.sanitizeScore === 'function') {
      return window.ScoreSystem.sanitizeScore(value);
    }
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.round(numeric));
  }

  function updateScoreDisplay(score) {
    scoreSpan.innerText = `⭐ ${normalizeScore(score)}`;
  }

  updateNameDisplay();

  const scoreManager = window.ScoreSystem
    ? window.ScoreSystem.getManager({ gun, user, portalRoot: gun.get('3dvr-portal') })
    : null;

  updateScoreDisplay(scoreManager ? scoreManager.getCurrent() : 0);

  if (scoreManager) {
    scoreManager.subscribe(updateScoreDisplay);
  }

  if (isSignedIn) {
    user.get('alias').on(alias => {
      aliasDisplay = aliasToDisplay(alias);
      updateNameDisplay();
    });
    user.get('username').on(name => {
      const normalized = typeof name === 'string' ? name.trim() : '';
      latestDisplayName = normalized;
      if (normalized) {
        localStorage.setItem('username', normalized);
      }
      updateNameDisplay();
    });
  } else if (isGuest) {
    const guestId = window.ScoreSystem
      ? window.ScoreSystem.ensureGuestIdentity()
      : (() => {
        const legacyId = localStorage.getItem('userId');
        if (legacyId && !localStorage.getItem('guestId')) {
          localStorage.setItem('guestId', legacyId);
        }
        if (legacyId) {
          localStorage.removeItem('userId');
        }
        let generated = localStorage.getItem('guestId');
        if (!generated) {
          generated = `guest_${Math.random().toString(36).substr(2, 9)}`;
          localStorage.setItem('guestId', generated);
        }
        if (!localStorage.getItem('guestDisplayName')) {
          localStorage.setItem('guestDisplayName', 'Guest');
        }
        return generated;
      })();
    const guestProfile = gun.get('3dvr-guests').get(guestId);
    guestProfile.get('username').on(name => {
      const normalized = typeof name === 'string' ? name.trim() : '';
      latestDisplayName = normalized;
      if (normalized) {
        localStorage.setItem('guestDisplayName', normalized);
      }
      updateNameDisplay();
    });
  } else {
    usernameSpan.innerText = '👤 Guest';
    scoreSpan.innerText = '⭐ 0';
  }
}

ensureHomepageSearchShortcuts();
window.addEventListener('load', createNavbar);
window.addEventListener('portal-auth:changed', createNavbar);
