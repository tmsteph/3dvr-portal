function setText(element, value) {
  if (element) {
    element.textContent = String(value);
  }
}

function setMeterWidth(element, percent) {
  if (element) {
    element.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }
}

export function createUI() {
  const elements = {
    loading: document.getElementById('loading'),
    menuToggle: document.getElementById('menu-toggle'),
    gameNav: document.getElementById('game-nav'),
    hudScore: document.getElementById('hud-score'),
    hudShield: document.getElementById('hud-shield'),
    hudFuel: document.getElementById('hud-fuel'),
    hudDistance: document.getElementById('hud-distance'),
    hudBoost: document.getElementById('hud-boost'),
    shieldBar: document.getElementById('shield-meter-fill'),
    fuelBar: document.getElementById('fuel-meter-fill'),
    distanceBar: document.getElementById('distance-meter-fill'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlay-title'),
    overlayMessage: document.getElementById('overlay-message'),
    overlayButton: document.getElementById('overlay-action'),
    pauseButton: document.getElementById('pause-btn'),
  };

  function initMenuToggle() {
    if (!elements.menuToggle || !elements.gameNav) {
      return;
    }

    const mobileQuery = window.matchMedia('(max-width: 900px)');

    const closeMenu = () => {
      document.body.classList.remove('nav-open');
      elements.menuToggle.setAttribute('aria-expanded', 'false');
    };

    elements.menuToggle.addEventListener('click', () => {
      const isOpen = document.body.classList.toggle('nav-open');
      elements.menuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    elements.gameNav.addEventListener('click', event => {
      if (mobileQuery.matches && event.target && event.target.tagName === 'A') {
        closeMenu();
      }
    });

    const syncMenuState = () => {
      if (!mobileQuery.matches) {
        closeMenu();
      }
    };

    if (typeof mobileQuery.addEventListener === 'function') {
      mobileQuery.addEventListener('change', syncMenuState);
    } else if (typeof mobileQuery.addListener === 'function') {
      mobileQuery.addListener(syncMenuState);
    }
    syncMenuState();
  }

  function hideLoading() {
    if (elements.loading) {
      elements.loading.style.display = 'none';
    }
  }

  function updateHUD(stats) {
    setText(elements.hudScore, Math.round(stats.score));
    setText(elements.hudShield, `${Math.round(stats.shield)}%`);
    setText(elements.hudFuel, `${Math.round(stats.fuel)}%`);
    setText(elements.hudDistance, `${Math.round(stats.progress * 100)}%`);

    const boostText = stats.boostSeconds > 0 ? `${stats.boostSeconds.toFixed(1)}s` : 'Ready';
    setText(elements.hudBoost, boostText);

    setMeterWidth(elements.shieldBar, stats.shield);
    setMeterWidth(elements.fuelBar, stats.fuel);
    setMeterWidth(elements.distanceBar, stats.progress * 100);
  }

  function showOverlay(options = {}) {
    const {
      title = '',
      message = '',
      buttonLabel = 'Start',
      hideButton = false,
    } = options;

    setText(elements.overlayTitle, title);
    setText(elements.overlayMessage, message);

    if (elements.overlayButton) {
      elements.overlayButton.textContent = buttonLabel;
      elements.overlayButton.style.display = hideButton ? 'none' : 'inline-flex';
    }

    if (elements.overlay) {
      elements.overlay.hidden = false;
      elements.overlay.setAttribute('aria-hidden', 'false');
    }
  }

  function hideOverlay() {
    if (elements.overlay) {
      elements.overlay.hidden = true;
      elements.overlay.setAttribute('aria-hidden', 'true');
    }
  }

  function bindOverlayAction(handler) {
    if (elements.overlayButton) {
      elements.overlayButton.addEventListener('click', handler);
    }
  }

  function setPauseButtonLabel(isPaused) {
    if (elements.pauseButton) {
      elements.pauseButton.textContent = isPaused ? 'Resume' : 'Pause';
      elements.pauseButton.setAttribute('aria-pressed', isPaused ? 'true' : 'false');
    }
  }

  return {
    initMenuToggle,
    hideLoading,
    updateHUD,
    showOverlay,
    hideOverlay,
    bindOverlayAction,
    setPauseButtonLabel,
  };
}
