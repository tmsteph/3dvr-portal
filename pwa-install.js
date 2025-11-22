(() => {
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
