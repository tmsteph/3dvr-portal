const form = document.querySelector('#intake');
const status = document.querySelector('#status');
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button[type=submit]');
  button.disabled = true;
  status.className = 'status';
  status.textContent = 'Submitting your inquiry…';
  try {
    const lead = Object.fromEntries(new FormData(form));
    lead.consent = form.elements.consent.checked;
    const response = await fetch('/api/automation-funnel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit', lead }), signal: AbortSignal.timeout(20000)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not submit. Please try again.');
    form.hidden = true;
    status.className = 'status success';
    status.textContent = 'Your inquiry is saved. Thomas will review it and reply about fit and scope. No payment has been taken.\nReference: ' + result.receipt;
  } catch (error) {
    status.className = 'status error';
    status.textContent = error.message || 'Please retry or email 3dvr.tech@gmail.com.';
  } finally { button.disabled = false; }
});
