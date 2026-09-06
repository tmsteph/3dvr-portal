const leadForm = document.querySelector('#cleaningLeadForm');
const partnerForm = document.querySelector('#partnerInterestForm');
const leadStatus = document.querySelector('#formStatus');
const partnerStatus = document.querySelector('#partnerStatus');
const serviceSelect = leadForm.elements.namedItem('serviceType');
const serviceCards = Array.from(document.querySelectorAll('[data-service]'));
const selectedService = document.querySelector('#selectedService');
const params = new URLSearchParams(window.location.search);
const requestedPartner = /^[a-z0-9-]{1,48}$/.test(String(params.get('partner') || '').toLowerCase())
  ? String(params.get('partner')).toLowerCase() : 'network';
let resolvedPartner = 'network';
function setStatus(node, message, state = '') { node.textContent = message; node.className = `form-status ${state}`.trim(); }
function todayLocal() { const now = new Date(); const offset = now.getTimezoneOffset() * 60000; return new Date(now.getTime() - offset).toISOString().slice(0, 10); }
document.querySelector('#preferredDate').min = todayLocal();
function syncServiceSelection(value) {
  const selected = String(value || '');
  serviceCards.forEach(card => { const active = card.dataset.service === selected; card.classList.toggle('selected', active); card.setAttribute('aria-pressed', String(active)); });
  selectedService.textContent = selected ? `Selected job: ${selected}` : ''; selectedService.hidden = !selected;
}
serviceCards.forEach(card => card.addEventListener('click', () => { serviceSelect.value = card.dataset.service || ''; syncServiceSelection(serviceSelect.value); document.querySelector('#quote').scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
serviceSelect.addEventListener('change', () => syncServiceSelection(serviceSelect.value));
function updatePartner(profile) {
  resolvedPartner = profile.partner || 'network';
  const branded = Boolean(profile.configured && resolvedPartner !== 'network');
  document.body.classList.toggle('partner-page', branded);
  const cleanerLink = document.querySelector('#cleanerLink'); if (cleanerLink) cleanerLink.hidden = branded;
  if (profile.accent) document.documentElement.style.setProperty('--accent', profile.accent);
  if (profile.accentDark) document.documentElement.style.setProperty('--accent-dark', profile.accentDark);
  document.title = branded ? `${profile.name} | Request a cleaning quote` : 'Cleaning Network | Request a local cleaning quote';
  const name = profile.name || 'Cleaning Network';
  document.querySelector('#partnerName').textContent = branded ? name : 'Clean space. Easy quote.';
  document.querySelector('#partnerIntro').textContent = branded ? (profile.intro || "Pick a service. We'll follow up.") : "Pick a service. We'll follow up.";
  document.querySelector('#footerBrand').textContent = profile.name || 'Cleaning Network'; document.querySelector('#headerBrandName').textContent = profile.name || 'Cleaning Network';
  const initials = String(profile.name || 'Cleaning Network').split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  const brandMark = document.querySelector('#headerBrandMark'); brandMark.replaceChildren();
  if (profile.logoUrl) { const logo = document.createElement('img'); logo.src = profile.logoUrl; logo.alt = ''; brandMark.append(logo); } else { brandMark.textContent = initials || 'CN'; }
  const eyebrow = document.querySelector('#serviceAreaEyebrow'); eyebrow.textContent = profile.serviceArea ? `Cleaning in ${profile.serviceArea}` : 'Simple local cleaning requests';
  const contact = document.querySelector('#partnerContact'); contact.replaceChildren(); const links = [];
  if (profile.publicPhone) { const phoneLink = document.createElement('a'); phoneLink.href = `tel:${String(profile.publicPhone).replace(/[^+\d]/g, '')}`; phoneLink.textContent = profile.publicPhone; links.push(phoneLink); }
  if (profile.website) { const websiteLink = document.createElement('a'); websiteLink.href = profile.website; websiteLink.rel = 'noopener noreferrer'; websiteLink.textContent = 'Company website'; links.push(websiteLink); }
  links.forEach((link, index) => { if (index) { const separator = document.createElement('span'); separator.setAttribute('aria-hidden', 'true'); separator.textContent = '·'; contact.append(separator); } contact.append(link); }); contact.hidden = links.length === 0;
}
async function loadPartner() { try { const response = await fetch(`/api/trial?kind=cleaning-partner&partner=${encodeURIComponent(requestedPartner)}`); const profile = await response.json(); if (response.ok) updatePartner(profile); } catch { resolvedPartner = 'network'; } }
function attribution() { return { pageUrl: window.location.href, referrer: document.referrer, utmSource: params.get('utm_source') || '', utmMedium: params.get('utm_medium') || '', utmCampaign: params.get('utm_campaign') || '' }; }
async function postForm(form, statusNode, kind, extra = {}) {
  const data = Object.fromEntries(new FormData(form).entries()); const button = form.querySelector('button[type="submit"]'); button.disabled = true; setStatus(statusNode, 'Sending…');
  try { const response = await fetch('/api/trial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, ...extra, kind, ...attribution() }) }); const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || 'Could not send this request.'); form.reset(); if (form === leadForm) { document.querySelector('#preferredDate').min = todayLocal(); form.querySelector('details')?.removeAttribute('open'); syncServiceSelection(''); } const reference = result.requestId ? ` Reference: ${result.requestId}.` : ''; setStatus(statusNode, `Sent successfully.${reference}`, 'success'); return result; }
  catch (error) { setStatus(statusNode, error.message || 'Could not send this request. Please try again.', 'error'); return null; } finally { button.disabled = false; }
}
leadForm.addEventListener('submit', async event => { event.preventDefault(); const data = new FormData(leadForm); const contact = String(data.get('contact') || '').trim(); if (!contact) { setStatus(leadStatus, 'Add a phone or email.', 'error'); return; } const contactField = contact.includes('@') ? { email: contact } : { phone: contact }; await postForm(leadForm, leadStatus, 'cleaning-lead', { ...contactField, partner: resolvedPartner, source: `cleaning-network:${resolvedPartner}` }); });
if (partnerForm) partnerForm.addEventListener('submit', async event => { event.preventDefault(); await postForm(partnerForm, partnerStatus, 'cleaning-partner-interest', { source: 'cleaning-network:partner-interest' }); });
loadPartner();
