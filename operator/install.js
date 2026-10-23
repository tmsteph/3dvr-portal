(() => {
  const button = document.getElementById('operator-install');
  const help = document.getElementById('operator-install-help');
  if (!button || !help) return;
  const displayMode = window.matchMedia('(display-mode: standalone)');
  const refreshInstalled = () => {
    button.parentElement.hidden = displayMode.matches || Boolean(navigator.standalone);
  };
  refreshInstalled();
  displayMode.addEventListener('change', refreshInstalled);

  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    button.parentElement.hidden = true;
  });
  button.addEventListener('click', async () => {
    const prompt = installPrompt;
    installPrompt = null;
    if (!prompt) {
      help.showModal();
      return;
    }
    button.disabled = true;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      help.showModal();
    } finally {
      button.disabled = false;
    }
  });

  // The offline worker never caches account data or reloads an active conversation.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/operator/service-worker.js', { scope: '/operator/' })
      .catch((error) => console.warn('Operator offline screen unavailable', error));
  }
})();
