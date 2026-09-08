const leadForm = document.querySelector('#cleaningLeadForm');
const partnerForm = document.querySelector('#partnerInterestForm');
const leadStatus = document.querySelector('#formStatus');
const partnerStatus = document.querySelector('#partnerStatus');
const serviceInput = leadForm.elements.namedItem('serviceType');
const selectedService = document.querySelector('#selectedService');
const serviceGrid = document.querySelector('#serviceGrid');
const heroImage = document.querySelector('#heroImage');
const partnerDialog = document.querySelector('#partnerDialog');
const openPartnerDialogButton = document.querySelector('#openPartnerDialog');
const cleanerLink = document.querySelector('#cleanerLink');
const closePartnerDialogButton = document.querySelector('#closePartnerDialog');
const params = new URLSearchParams(window.location.search);
const requestedPartner = /^[a-z0-9-]{1,48}$/.test(String(params.get('partner') || '').toLowerCase())
  ? String(params.get('partner')).toLowerCase()
  : 'network';
const previewToken = String(params.get('preview') || '');
let resolvedPartner = 'network';
let serviceCards = [];

const SERVICE_IMAGES = Object.freeze({
  home: 'https://images.unsplash.com/photo-1758523670739-0d26a3ee976d?auto=format&fit=crop&fm=jpg&q=78&w=1200',
  move: 'https://images.unsplash.com/photo-1786396798391-8c3f330cf3a8?auto=format&fit=crop&fm=jpg&q=78&w=1200',
  office: 'https://images.unsplash.com/photo-1781637590564-01c65dbf2039?auto=format&fit=crop&fm=jpg&q=78&w=1200',
  turnover: 'https://images.unsplash.com/photo-1785486249936-a9a95dfcb63d?auto=format&fit=crop&fm=jpg&q=78&w=1200',
  deep: 'https://images.unsplash.com/photo-1527515545081-5db817172677?auto=format&fit=crop&fm=jpg&q=78&w=1200',
});

function setStatus(node, message, state = '') {
  if (!node) return;
  node.textContent = message;
  node.className = `form-status ${state}`.trim();
}

function todayLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

document.querySelector('#preferredDate').min = todayLocal();

function imageForService(label) {
  const value = String(label || '').toLowerCase();
  if (value.includes('move')) return SERVICE_IMAGES.move;
  if (value.includes('office') || value.includes('commercial')) return SERVICE_IMAGES.office;
  if (value.includes('turnover') || value.includes('rental') || value.includes('airbnb')) return SERVICE_IMAGES.turnover;
  if (value.includes('deep')) return SERVICE_IMAGES.deep;
  return SERVICE_IMAGES.home;
}

function shortServiceLabel(label) {
  return String(label || '')
    .replace(/office\s*\/\s*commercial/i, 'Office')
    .replace(/move in\s*\/\s*move out/i, 'Move in / out')
    .replace(/rental turnover/i, 'Turnover');
}

function syncServiceSelection(value) {
  const selected = String(value || '');
  serviceCards.forEach(card => {
    const active = card.dataset.service === selected;
    card.classList.toggle('selected', active);
    card.setAttribute('aria-pressed', String(active));
  });
  selectedService.textContent = selected ? `Selected job: ${selected}` : '';
  selectedService.hidden = !selected;
}

function bindServiceCards() {
  serviceCards = Array.from(document.querySelectorAll('[data-service]'));
  serviceCards.forEach(card => card.addEventListener('click', () => {
    serviceInput.value = card.dataset.service || '';
    syncServiceSelection(serviceInput.value);
    document.querySelector('#quote').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

function renderServices(services) {
  if (!Array.isArray(services) || services.length === 0) return;
  const cleaned = [...new Set(services.map(value => String(value || '').trim()).filter(Boolean))].slice(0, 8);
  if (!cleaned.length) return;

  serviceGrid.replaceChildren();

  cleaned.forEach(service => {
    const card = document.createElement('button');
    card.className = 'service-card';
    card.type = 'button';
    card.dataset.service = service;
    card.setAttribute('aria-pressed', 'false');

    const image = document.createElement('img');
    image.loading = 'lazy';
    image.src = imageForService(service);
    image.alt = '';

    const label = document.createElement('span');
    label.textContent = shortServiceLabel(service);
    card.append(image, label);
    serviceGrid.append(card);

  });

  bindServiceCards();
  syncServiceSelection('');
}

bindServiceCards();

function openPartnerDialog() {
  if (!partnerDialog) return;
  if (typeof partnerDialog.showModal === 'function') partnerDialog.showModal();
  else partnerDialog.setAttribute('open', '');
  partnerForm?.querySelector('input')?.focus();
}

function closePartnerDialog() {
  if (!partnerDialog) return;
  if (typeof partnerDialog.close === 'function') partnerDialog.close();
  else partnerDialog.removeAttribute('open');
}

openPartnerDialogButton?.addEventListener('click', openPartnerDialog);
cleanerLink?.addEventListener('click', openPartnerDialog);
closePartnerDialogButton?.addEventListener('click', closePartnerDialog);
partnerDialog?.addEventListener('click', event => {
  if (event.target === partnerDialog) closePartnerDialog();
});

function updatePartner(profile) {
  resolvedPartner = profile.partner || 'network';
  const branded = Boolean(profile.configured && resolvedPartner !== 'network');
  document.body.classList.toggle('partner-page', branded);

  if (cleanerLink) cleanerLink.hidden = branded;
  if (openPartnerDialogButton) openPartnerDialogButton.hidden = branded;
  if (profile.accent) document.documentElement.style.setProperty('--accent', profile.accent);
  if (profile.accentDark) document.documentElement.style.setProperty('--accent-dark', profile.accentDark);
  if (profile.heroImageUrl) heroImage.src = profile.heroImageUrl;
  if (Array.isArray(profile.services) && profile.services.length) renderServices(profile.services);

  document.title = branded
    ? `${profile.name} | Request a cleaning quote`
    : 'Cleaning Network | Request a local cleaning quote';
  const name = profile.name || 'Cleaning Network';
  document.querySelector('#partnerName').textContent = branded ? name : 'Clean space. Easy quote.';
  document.querySelector('#partnerIntro').textContent = branded
    ? (profile.intro || "Pick a service. We'll follow up.")
    : "Pick a service. We'll follow up.";
  document.querySelector('#footerBrand').textContent = profile.name || 'Cleaning Network';
  document.querySelector('#headerBrandName').textContent = profile.name || 'Cleaning Network';

  const initials = String(profile.name || 'Cleaning Network')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0])
    .join('')
    .toUpperCase();
  const brandMark = document.querySelector('#headerBrandMark');
  brandMark.replaceChildren();
  if (profile.logoUrl) {
    const logo = document.createElement('img');
    logo.src = profile.logoUrl;
    logo.alt = '';
    brandMark.append(logo);
  } else {
    brandMark.textContent = initials || 'CN';
  }

  const eyebrow = document.querySelector('#serviceAreaEyebrow');
  eyebrow.textContent = profile.serviceArea
    ? `Cleaning in ${profile.serviceArea}`
    : 'Simple local cleaning requests';

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
    const endpoint = previewToken
      ? `/api/trial?kind=cleaning-preview&token=${encodeURIComponent(previewToken)}`
      : `/api/trial?kind=cleaning-partner&partner=${encodeURIComponent(requestedPartner)}`;
    const response = await fetch(endpoint);
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
    utmCampaign: params.get('utm_campaign') || ''
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
      body: JSON.stringify({ ...data, ...extra, kind, ...attribution() })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not send this request.');
    form.reset();
    if (form === leadForm) {
      document.querySelector('#preferredDate').min = todayLocal();
      form.querySelector('details')?.removeAttribute('open');
      serviceInput.value = '';
      syncServiceSelection('');
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
  if (!String(serviceInput.value || '').trim()) {
    setStatus(leadStatus, 'Choose a service above first.', 'error');
    document.querySelector('#services').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const result = await postForm(leadForm, leadStatus, 'cleaning-lead', {
    partner: resolvedPartner,
    source: `cleaning-network:${previewToken ? `preview:${resolvedPartner}` : resolvedPartner}`,
    previewToken
  });
  if (result) {
    const reference = result.requestId ? ` Reference: ${result.requestId}.` : '';
    const textNote = result.smsConfirmationSent ? ' Text confirmation sent too.' : '';
    setStatus(leadStatus, `Request received. Check your email for confirmation.${textNote}${reference}`, 'success');
  }
});

if (partnerForm) {
  partnerForm.addEventListener('submit', async event => {
    event.preventDefault();
    const result = await postForm(partnerForm, partnerStatus, 'cleaning-partner-interest', {
      source: 'cleaning-network:partner-interest'
    });
    if (result) {
      try {
        sessionStorage.setItem('cleaningPartnerResult', JSON.stringify({
          requestId: result.requestId || '',
          previewUrl: result.previewUrl || '',
          qualified: Boolean(result.qualified),
          qualificationScore: Number(result.qualificationScore || 0)
        }));
      } catch {
        // Routing still works if session storage is unavailable.
      }
      window.location.assign(result.qualified ? 'qualified.html' : 'thanks.html');
    }
  });
}

loadPartner();
