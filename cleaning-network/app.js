const leadForm = document.querySelector('#cleaningLeadForm');
const partnerForm = document.querySelector('#partnerInterestForm');
const leadStatus = document.querySelector('#formStatus');
const partnerStatus = document.querySelector('#partnerStatus');
const params = new URLSearchParams(window.location.search);
const requestedPartner = /^[a-z0-9-]{1,48}$/.test(String(params.get('partner') || '').toLowerCase())
  ? String(params.get('partner')).toLowerCase() : 'network';
let resolvedPartner = 'network';

function setStatus(node, message, state = '') {
  node.textContent = message;
  node.className = `form-status ${state}`.trim();
}

function todayLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

document.querySelector('#preferredDate').min = todayLocal();

function updatePartner(profile) {
  resolvedPartner = profile.partner || 'network';
  document.querySelector('#partnerName').textContent = profile.name || 'Cleaning Network';
  document.querySelector('#partnerIntro').textContent = profile.intro || '';
  document.querySelector('#footerBrand').textContent = profile.name || 'Cleaning Network';
  document.querySelector('#headerBrandName').textContent = profile.name || 'Cleaning Network';
  const initials = String(profile.name || 'Cleaning Network').split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  document.querySelector('#headerBrandMark').textContent = initials || 'CN';
  const eyebrow = document.querySelector('#serviceAreaEyebrow');
  eyebrow.textContent = profile.serviceArea ? `Cleaning in ${profile.serviceArea}` : 'Simple local cleaning requests';
  const contact = document.querySelector('#partnerContact');
  contact.replaceChildren();
  const links = [];
  if (profile.publicPhone) {
    const phoneLink = document.createElement('a');
    phoneLink.href = `tel:${String(profile.publicPhone).replace(/[^+\d]/g, '')}`;
    phoneLink.textContent = profile.publicPhone;
    links.push(phoneLink);
  }
  if (profile.website) {
    const websiteLink = document.createElement('a');
    websiteLink.href = profile.website;
    websiteLink.rel = 'noopener noreferrer';
    websiteLink.textContent = 'Company website';
    links.push(websiteLink);
  }
  links.forEach((link, index) => {
    if (index) {
      const separator = document.createElement('span');
      separator.setAttribute('aria-hidden', 'true');
      separator.textContent = '·';
      contact.append(separator);
    }
    contact.append(link);
  });
  contact.hidden = links.length === 0;
}

async function loadPartner() {
  try {
    const response = await fetch(`/api/trial?kind=cleaning-partner&partner=${encodeURIComponent(requestedPartner)}`);
    const profile = await response.json();
    if (response.ok) updatePartner(profile);
  } catch {
    resolvedPartner = 'network';
  }
}

function attribution() {
  return {
    pageUrl: window.location.href,
    referrer: document.referrer,
    utmSource: params.get('utm_source') || '',
    utmMedium: params.get('utm_medium') || '',
    utmCampaign: params.get('utm_campaign') || '',
  };
}

async function postForm(form, statusNode, kind, extra = {}) {
  const data = Object.fromEntries(new FormData(form).entries());
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  setStatus(statusNode, 'Sending…');
  try {
    const response = await fetch('/api/trial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, ...extra, kind, ...attribution() }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not send this request.');
    form.reset();
    if (form === leadForm) {
      document.querySelector('#preferredDate').min = todayLocal();
      form.querySelector('details')?.removeAttribute('open');
    }
    const reference = result.requestId ? ` Reference: ${result.requestId}.` : '';
    setStatus(statusNode, `Sent successfully.${reference}`, 'success');
    return result;
  } catch (error) {
    setStatus(statusNode, error.message || 'Could not send this request. Please try again.', 'error');
    return null;
  } finally {
    button.disabled = false;
  }
}

leadForm.addEventListener('submit', async event => {
  event.preventDefault();
  const data = new FormData(leadForm);
  if (!String(data.get('email') || '').trim() && !String(data.get('phone') || '').trim()) {
    setStatus(leadStatus, 'Add an email or phone number so a cleaner can reach you.', 'error');
    return;
  }
  await postForm(leadForm, leadStatus, 'cleaning-lead', {
    partner: resolvedPartner,
    source: `cleaning-network:${resolvedPartner}`,
  });
});

partnerForm.addEventListener('submit', async event => {
  event.preventDefault();
  await postForm(partnerForm, partnerStatus, 'cleaning-partner-interest', {
    source: 'cleaning-network:partner-interest',
  });
});

loadPartner();
