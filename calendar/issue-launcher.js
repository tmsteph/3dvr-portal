(() => {
  if (typeof document === 'undefined') return;
  if (document.querySelector('script[data-calendar-issue-launcher-source]')) return;

  const script = document.createElement('script');
  script.src = 'https://portal.3dvr.tech/issue-launcher.js';
  script.async = true;
  script.dataset.calendarIssueLauncherSource = 'portal';
  script.addEventListener('error', () => {
    console.warn('3DVR issue launcher could not be loaded from portal.3dvr.tech.');
  });
  document.head.appendChild(script);
})();
