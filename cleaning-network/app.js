const form = document.querySelector('#cleaningLeadForm');
const status = document.querySelector('#formStatus');

const params = new URLSearchParams(window.location.search);
const rawPartner = String(params.get('partner') || 'network').toLowerCase();
const partner = /^[a-z0-9-]{1,48}$/.test(rawPartner) ? rawPartner : 'network';

const partnerProfiles = Object.freeze({
  network: {
    name: 'Cleaning Network',
    intro: 'Tell us what needs cleaning, where it is, and when you want it done. A local cleaning team can follow up with availability and a quote.',
  },
});

const profile = partnerProfiles[partner] || partnerProfiles.network;
document.querySelector('#partnerName').textContent = profile.name;
document.querySelector('#partnerIntro').textContent = profile.intro;
document.querySelector('#footerBrand').textContent = profile.name;

function setStatus(message, state = '') {
  status.textContent = message;
  status.className = `form-status ${state}`.trim();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const email = String(data.email || '').trim();
  const phone = String(data.phone || '').trim();

  if (!email && !phone) {
    setStatus('Add an email or phone number so a cleaner can reach you.', 'error');
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  setStatus('Sending your request…');

  try {
    const response = await fetch('/api/trial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        kind: 'cleaning-lead',
        partner,
        source: `cleaning-network:${partner}`,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || 'Could not send the request.');
    }

    form.reset();
    setStatus('Request sent. A cleaning team can follow up with you shortly.', 'success');
  } catch (error) {
    setStatus(error.message || 'Could not send the request. Please try again.', 'error');
  } finally {
    submitButton.disabled = false;
  }
});
