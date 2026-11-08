(() => {
  const scriptEl = document.currentScript;
  const configuredWorkerUrl = scriptEl?.dataset?.swUrl || '/service-worker.js';
  const configuredScope = scriptEl?.dataset?.swScope || '/';
  const resolvedWorkerUrl = new URL(configuredWorkerUrl, window.location.origin);
  const resolvedScopeUrl = new URL(configuredScope, window.location.origin);
  const scopePath = resolvedScopeUrl.pathname.endsWith('/')
    ? resolvedScopeUrl.pathname
    : `${resolvedScopeUrl.pathname}/`;
  const scopeHref = new URL(scopePath, window.location.origin).href;

  const toPathname = (url) => {
    if (!url) return '';
    try {
      return new URL(url, window.location.origin).pathname;
    } catch (error) {
      console.warn('Unable to parse service worker URL', error);
      return '';
    }
  };

  let waitingActivationRequested = false;

  const bindControllerRefresh = () => {
    if (waitingActivationRequested) return;
    waitingActivationRequested = true;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    }, { once: true });
  };

  const requestWaitingActivation = (registration) => {
    if (!registration || !registration.waiting) return false;
    const waitingWorker = registration.waiting;
    if (typeof waitingWorker.postMessage !== 'function') return false;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    return true;
  };

  const wireServiceWorkerUpdates = (registration) => {
    if (!registration) return;

    if (requestWaitingActivation(registration)) {
      bindControllerRefresh();
    }

    registration.addEventListener('updatefound', () => {
      const installingWorker = registration.installing;
      if (!installingWorker) return;

      installingWorker.addEventListener('statechange', () => {
        if (installingWorker.state !== 'installed') return;
        if (!registration.waiting) return;
        bindControllerRefresh();
        requestWaitingActivation(registration);
      });
    });
  };

  const registerServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) return null;

    try {
      const registration = await navigator.serviceWorker.getRegistration(scopePath);
      const activeScriptPath = toPathname(registration?.active?.scriptURL);
      const isExpectedWorker = Boolean(registration)
        && activeScriptPath === resolvedWorkerUrl.pathname
        && registration.scope === scopeHref;

      if (isExpectedWorker) {
        registration.update().catch((error) => {
          console.warn('Service worker update skipped', error);
        });
        wireServiceWorkerUpdates(registration);
        return registration;
      }

      const nextRegistration = await navigator.serviceWorker.register(
        `${resolvedWorkerUrl.pathname}${resolvedWorkerUrl.search}`,
        { scope: scopePath }
      );
      wireServiceWorkerUpdates(nextRegistration);
      return nextRegistration;
    } catch (error) {
      console.error('Service worker registration failed', error);
      return null;
    }
  };

  registerServiceWorker();

  const installBanner = document.querySelector('[data-install-banner]');
  const installButton = installBanner?.querySelector('[data-install-button]');
  let deferredPrompt = null;

  if (!installBanner || !installButton) return;

  // Install state has to survive the visit where it happened: the browser
  // offers a fresh beforeinstallprompt on later tab visits (and other
  // browsers on the same device never saw the install at all), so a banner
  // keyed only on the live prompt nags people who already installed.
  // Remember the install on this origin, and ask the platform what it
  // knows when it can answer.
  const installedFlagKey = `3dvr-pwa-installed:${scopePath}`;

  const hasInstalledFlag = () => {
    try {
      return localStorage.getItem(installedFlagKey) === 'true';
    } catch (error) {
      return false;
    }
  };

  const markInstalled = () => {
    try {
      localStorage.setItem(installedFlagKey, 'true');
    } catch (error) {
      console.warn('Unable to remember install state', error);
    }
  };

  const isInstalled = () => {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone
      || document.referrer.startsWith('android-app://')
      || hasInstalledFlag();
  };

  const hideBanner = () => {
    installBanner.classList.add('is-hidden');
    installBanner.setAttribute('hidden', '');
  };

  const showBanner = () => {
    installBanner.classList.remove('is-hidden');
    installBanner.removeAttribute('hidden');
  };

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;

    if (!isInstalled()) {
      showBanner();
    }
  });

  window.addEventListener('appinstalled', () => {
    markInstalled();
    hideBanner();
  });

  installButton.addEventListener('click', async () => {
    if (!deferredPrompt) return;

    installButton.disabled = true;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    installButton.disabled = false;

    if (outcome === 'accepted') {
      markInstalled();
      hideBanner();
    }
  });

  if (isInstalled()) hideBanner();

  // Running inside the installed app proves the install; remember it so a
  // later tab visit on this origin stays quiet too.
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
    markInstalled();
  }

  // Where the platform can name installed related apps (the manifest
  // declares this app as its own related webapp), trust that answer even
  // when this browser never saw the install happen.
  if (typeof navigator.getInstalledRelatedApps === 'function') {
    navigator.getInstalledRelatedApps()
      .then((relatedApps) => {
        if (Array.isArray(relatedApps) && relatedApps.length > 0) {
          markInstalled();
          hideBanner();
        }
      })
      .catch((error) => {
        console.warn('Installed apps check skipped', error);
      });
  }
})();
