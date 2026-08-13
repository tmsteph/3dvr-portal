const PLAN_DETAILS = Object.freeze({
  starter: Object.freeze({ label: 'Family & Friends', amount: '$5 / month' }),
  pro: Object.freeze({ label: 'Founder', amount: '$20 / month' }),
  builder: Object.freeze({ label: 'Builder', amount: '$50 / month' }),
  embedded: Object.freeze({ label: 'Embedded', amount: '$200 / month' })
});

function getSelectedPlan(locationLike = window.location) {
  const params = new URLSearchParams(locationLike.search || '');
  const plan = String(params.get('plan') || '').trim().toLowerCase();
  return PLAN_DETAILS[plan] ? plan : '';
}

async function startCheckout(root = document, locationLike = window.location) {
  const title = root.querySelector('#checkoutTitle');
  const status = root.querySelector('#checkoutStatus');
  const retry = root.querySelector('#checkoutRetry');
  const plan = getSelectedPlan(locationLike);
  const details = PLAN_DETAILS[plan];

  if (!title || !status || !retry) {
    return;
  }

  if (!details) {
    title.textContent = 'Choose a valid plan';
    status.textContent = 'Go back to the paid plans and choose the support level you want.';
    retry.hidden = true;
    return;
  }

  title.textContent = `${details.label} — ${details.amount}`;
  status.textContent = 'Opening secure Stripe checkout. No portal account is required.';
  retry.hidden = true;
  retry.disabled = true;

  try {
    const response = await fetch('/api/public-checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ plan })
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.url) {
      throw new Error(payload.error || 'Unable to start checkout.');
    }

    locationLike.replace(payload.url);
  } catch (error) {
    title.textContent = 'Checkout did not open';
    status.textContent = error?.message || 'Unable to start checkout. Please try again.';
    retry.hidden = false;
    retry.disabled = false;
  }
}

function initCheckout(root = document, locationLike = window.location) {
  const retry = root.querySelector('#checkoutRetry');
  if (retry) {
    retry.addEventListener('click', () => startCheckout(root, locationLike));
  }
  startCheckout(root, locationLike);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    initCheckout(document, window.location);
  });
}

export { PLAN_DETAILS, getSelectedPlan, initCheckout, startCheckout };
