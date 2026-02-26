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
        return registration;
      }

      return navigator.serviceWorker.register(
        `${resolvedWorkerUrl.pathname}${resolvedWorkerUrl.search}`,
        { scope: scopePath }
      );
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
