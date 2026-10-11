const starters = {
  project: 'Help me turn a rough project idea into one useful experiment. Ask me what I want to build, then help define the smallest outcome and how to check it.',
  workflow: 'Help me diagnose an automation that is stuck. Ask what should happen, what happens now, and which tools are involved. Start with read-only checks.',
  contribute: 'I want to contribute to 3DVR Operator. Help me choose a small contribution toward a reliable overnight project loop, based on my skills. Treat planned capabilities as unfinished.'
};
document.querySelectorAll('[data-starter]').forEach(link => {
  link.addEventListener('click', () => {
    try {
      sessionStorage.setItem('3dvr.operator.prefill.v1', JSON.stringify({ prompt: starters[link.dataset.starter], submit: false }));
    } catch { /* Opening Operator still works when browser storage is unavailable. */ }
  });
});
document.querySelector('#interest').addEventListener('submit', event => {
  event.preventDefault();
  const role = document.querySelector('#role').value;
  const goal = document.querySelector('#goal').value.trim();
  if (!goal) return;
  const body = 'Hi Thomas,\n\n' + role + '.\n\nMy task or contribution:\n' + goal + '\n\nMy setup / relevant experience:\n\n';
  window.location.href = 'mailto:3dvr.tech@gmail.com?subject=' + encodeURIComponent('3DVR Operator: ' + role) + '&body=' + encodeURIComponent(body);
  document.querySelector('#interest-status').textContent = 'Review and send in your email app. If it did not open, email 3dvr.tech@gmail.com.';
});
document.querySelector('#share').addEventListener('click', async () => {
  const url = 'https://portal.3dvr.tech/operator/open/';
  const status = document.querySelector('#share-status');
  try {
    if (navigator.share) {
      await navigator.share({ title: '3DVR Operator', text: 'Your AI. Your workspace. Your control. Help build the open assistant.', url });
      status.textContent = 'Share sheet opened.';
    } else {
      await navigator.clipboard.writeText(url);
      status.textContent = 'Link copied. Share it with someone who would find it useful.';
    }
  } catch (error) {
    status.textContent = error.name === 'AbortError' ? '' : 'Share this link: ' + url;
  }
});
