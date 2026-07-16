import {
  createAnalyticsSessionId,
  createFreePageAnalyticsClient
} from '../../src/analytics/freePage.js';

const params = new URLSearchParams(window.location.search);
const recipientId = clean(params.get('r'), 80);
const business = clean(params.get('name'), 80) || 'your business';
const focus = clean(params.get('focus'), 180)
  || 'A focused page can make your main service and best contact path obvious.';
const action = clean(params.get('action'), 40) || 'Get in touch';
const fragment = new URLSearchParams(window.location.hash.slice(1));
const contactEmail = validEmail(fragment.get('email'));
const analyticsClient = createFreePageAnalyticsClient();

function clean(value, limit) {
  return String(value || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, limit);
}

function validEmail(value) {
  const email = clean(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function sessionId() {
  const key = '3dvr-free-page-preview-session';
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const created = createAnalyticsSessionId();
    sessionStorage.setItem(key, created);
    return created;
  } catch (_error) {
    return createAnalyticsSessionId();
  }
}

function track(eventType) {
  if (!analyticsClient || !recipientId) return Promise.resolve();
  return analyticsClient.track(eventType, {
    recipientId,
    sessionId: sessionId()
  }).catch(error => console.info('Preview analytics unavailable.', error.message));
}

document.querySelectorAll('[data-business]').forEach(node => { node.textContent = business; });
document.querySelector('[data-host]').textContent = `${slug(business) || 'your-business'}.com`;
document.querySelector('[data-headline]').textContent = `${business}, made easier to understand and contact.`;
document.querySelector('[data-focus]').textContent = focus;
document.querySelector('[data-action]').textContent = action;
document.title = `${business} website preview | 3DVR`;

const contactButton = document.querySelector('#contactButton');
if (contactEmail) {
  const contactSubject = `Website inquiry for ${business}`;
  const contactBody = `Hi,\n\nI'm interested in learning more about ${business}.`;
  contactButton.href = `mailto:${contactEmail}?subject=${encodeURIComponent(contactSubject)}&body=${encodeURIComponent(contactBody)}`;
  contactButton.setAttribute('aria-label', `${action} by email`);
  document.querySelector('#contactNote').textContent = 'The contact button above opens an email to you. Reply to Thomas to adjust the copy, colors, or next step before anything goes public.';
} else {
  contactButton.classList.add('is-preview-only');
  contactButton.setAttribute('aria-disabled', 'true');
  contactButton.setAttribute('title', 'Preview button');
}

const claimButton = document.querySelector('#claimButton');
const subject = `Claiming the free one-page draft for ${business}`;
const body = `Hi Thomas,\n\nI'd like to claim the free one-page draft for ${business}.\n\nPreview reference: ${recipientId || 'not provided'}`;
claimButton.href = `mailto:3dvr.tech@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
claimButton.addEventListener('click', () => track('claim_intent'));

track('preview_view');
