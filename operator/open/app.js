const starters = {
  day: 'Help me plan today. Ask what I need to do and how much time I have. Help me choose a few realistic next steps.',
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
document.querySelector('#interest').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.querySelector('#interest-status');
  const button = form.querySelector('button[type=submit]');
  const values = new FormData(form);
  button.disabled = true;
  status.textContent = 'Saving your request…';
  try {
    const response = await fetch('/api/automation-funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit', lead: {
        inquiryType: 'operator-pilot',
        name: values.get('name'), email: values.get('email'),
        problem: String(values.get('role')) + ': ' + String(values.get('goal')).trim(),
        consent: form.elements.consent.checked,
        websiteTrap: values.get('websiteTrap')
      }}),
      signal: AbortSignal.timeout(20000)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save. Please try again.');
    form.querySelectorAll('input, textarea, select, button').forEach(element => { element.disabled = true; });
    status.textContent = 'You’re on the early-access list. We’ll reply about fit and availability. No payment has been taken. Reference: ' + result.receipt;
  } catch (error) {
    status.textContent = error.message || 'Please try again or email 3dvr.tech@gmail.com.';
    button.disabled = false;
  }
});
document.querySelector('#share').addEventListener('click', async () => {
  const url = 'https://portal.3dvr.tech/operator/open/';
  const status = document.querySelector('#share-status');
  try {
    if (navigator.share) {
      await navigator.share({ title: '3DVR Operator', text: 'We host your agent. You get things done. Join the Operator pilot.', url });
      status.textContent = 'Share sheet opened.';
    } else {
      await navigator.clipboard.writeText(url);
      status.textContent = 'Link copied. Share it with someone who would find it useful.';
    }
  } catch (error) {
    status.textContent = error.name === 'AbortError' ? '' : 'Share this link: ' + url;
  }
});
