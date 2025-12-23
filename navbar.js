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

function createNavbar() {
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
  nav.className = 'floating-identity';
  nav.setAttribute('aria-label', 'Account status');

  const stats = document.createElement('a');
  stats.className = 'floating-identity__stats';
  stats.href = 'profile.html#profile';
  stats.setAttribute('aria-label', 'View your profile details');
  stats.title = 'Go to your profile';

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
    try {
      user.leave();
    } catch (err) {
      console.warn('Error signing out', err);
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
    window.location.href = 'index.html';
  });

  nav.appendChild(stats);
  nav.appendChild(button);

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
  if (!isSignedIn) {
    if (window.ScoreSystem && typeof window.ScoreSystem.ensureGuestIdentity === 'function') {
      window.ScoreSystem.ensureGuestIdentity();
    }
  }
  const isGuest = !isSignedIn && localStorage.getItem('guest') === 'true';
  let latestDisplayName = '';
  let aliasDisplay = aliasToDisplay(localStorage.getItem('alias'));

  function updateNameDisplay() {
    if (latestDisplayName) {
      usernameSpan.innerText = `👤 ${latestDisplayName}`;
      return;
    }
    if (isSignedIn) {
      const stored = (localStorage.getItem('username') || '').trim();
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

window.addEventListener('load', createNavbar);
