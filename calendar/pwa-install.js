(() => {
  const scriptEl = document.currentScript;
  const resolutionBaseUrl = new URL(window.location.href);
  const configuredWorkerUrl = scriptEl?.dataset?.swUrl || '/service-worker.js';
  const configuredScope = scriptEl?.dataset?.swScope || '/';
  const resolvedWorkerUrl = new URL(configuredWorkerUrl, resolutionBaseUrl);
  const resolvedScopeUrl = new URL(configuredScope, resolutionBaseUrl);
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

  const isInstalled = () => {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone
      || document.referrer.startsWith('android-app://');
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

  window.addEventListener('appinstalled', hideBanner);

  installButton.addEventListener('click', async () => {
    if (!deferredPrompt) return;

    installButton.disabled = true;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    installButton.disabled = false;

    if (outcome === 'accepted') hideBanner();
  });

  if (isInstalled()) hideBanner();
})();
