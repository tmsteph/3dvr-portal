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
const analyticsClient = createFreePageAnalyticsClient();

function clean(value, limit) {
  return String(value || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, limit);
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

const claimButton = document.querySelector('#claimButton');
const subject = `Claiming the free one-page draft for ${business}`;
const body = `Hi Thomas,\n\nI'd like to claim the free one-page draft for ${business}.\n\nPreview reference: ${recipientId || 'not provided'}`;
claimButton.href = `mailto:3dvr.tech@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
claimButton.addEventListener('click', () => track('claim_intent'));

track('preview_view');
