import {
  createAnalyticsSessionId,
  createFreePageAnalyticsClient
} from '../src/analytics/freePage.js';

const form = document.querySelector('#freePageBrief');
const mailtoLink = document.querySelector('#mailtoLink');
const handoffCopy = document.querySelector('#handoffCopy');
const shareButton = document.querySelector('#shareFreePage');
const copyButton = document.querySelector('#copyFreePage');
const shareStatus = document.querySelector('#shareStatus');

const email = '3dvr.tech@gmail.com';
const CRM_NODE = '3dvr-crm';
const TOUCH_LOG_NODE = 'crm-touch-log';
const sessionKey = '3dvr-free-page-analytics-session';
const analyticsClient = createFreePageAnalyticsClient();
const crmGun = typeof Gun === 'function'
  ? Gun(window.__GUN_PEERS__ || ['wss://gun-relay-3dvr.fly.dev/gun'])
  : null;
const crmRoot = crmGun?.get(CRM_NODE) || null;
const touchLogRoot = crmGun?.get('3dvr-portal')?.get(TOUCH_LOG_NODE) || null;

function analyticsSessionId() {
  try {
    const existing = sessionStorage.getItem(sessionKey);
    if (existing) return existing;
    const created = createAnalyticsSessionId();
    sessionStorage.setItem(sessionKey, created);
    return created;
  } catch (_error) {
    return createAnalyticsSessionId();
  }
}

const sessionId = analyticsSessionId();
const shareUrl = `${window.location.origin}/free-page/`;

function setShareStatus(message) {
  if (shareStatus) shareStatus.textContent = message;
}

function trackFirstPartyEvent(eventType) {
  if (!analyticsClient) return Promise.resolve();
  return analyticsClient.track(eventType, { sessionId }).catch(error => {
    console.info('First-party analytics unavailable.', error.message);
  });
}

function valueFor(formData, key, fallback) {
  const value = String(formData.get(key) || '').trim();
  return value || fallback;
}

function slug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'lead';
}

function putGun(node, payload) {
  return new Promise(resolve => {
    if (!node || typeof node.put !== 'function') {
      resolve(false);
      return;
    }
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(false), 1800);
    node.put(payload, ack => {
      window.clearTimeout(timer);
      finish(!ack?.err);
    });
  });
}

async function saveBriefToCrm(formData) {
  const name = valueFor(formData, 'name', 'New business launch lead');
  const leadEmail = valueFor(formData, 'email', '');
  const offer = valueFor(formData, 'offer', 'Needs a clear first website.');
  const audience = valueFor(formData, 'audience', 'Not specified');
  const action = valueFor(formData, 'action', 'Contact me');
  const contact = valueFor(formData, 'contact', 'Will provide contact link.');
  const now = new Date().toISOString();
  const id = `lead-free-page-${slug(leadEmail || name)}`;
  const record = {
    id,
    recordType: 'person',
    name,
    email: leadEmail,
    company: name,
    role: 'Founder / operator',
    tags: ['free-page', 'new-business', 'inbound'],
    status: 'new',
    warmth: 'warm',
    source: 'free-page',
    offerAmount: '$5/month starter; $20/month launch lane',
    nextBestAction: 'Review the brief and prepare the first-page draft.',
    nextFollowUp: now.slice(0, 10),
    activityCount: 1,
    created: now,
    updated: now,
    notes: [`Inbound free-page brief`, `Offer/project: ${offer}`, `Audience: ${audience}`, `Main action: ${action}`, `Best contact link: ${contact}`].join('\n')
  };
  const touch = {
    id: `touch-free-page-${slug(leadEmail || name)}-${Date.now()}`,
    recordId: id,
    contactName: name,
    contactEmail: leadEmail,
    type: 'inbound',
    channel: 'free-page',
    source: 'free-page',
    summary: 'Inbound request for a free first website draft.',
    outcome: 'Lead captured; draft requested.',
    message: JSON.stringify({ name, email: leadEmail, offer, audience, action, contact }),
    created: now,
    updated: now
  };
  const [recordSaved, touchSaved] = await Promise.all([
    putGun(crmRoot?.get(id), record),
    putGun(touchLogRoot?.get(touch.id), touch)
  ]);
  return recordSaved && touchSaved;
}

function buildMailto(formData) {
  const name = valueFor(formData, 'name', 'A new 3DVR page');
  const offer = valueFor(formData, 'offer', 'I want help turning this into a simple one-page website.');
  const audience = valueFor(formData, 'audience', 'People who might hire, book, buy, or understand this.');
  const action = valueFor(formData, 'action', 'Contact me');
  const contact = valueFor(formData, 'contact', 'I will send the best contact link next.');
  const leadEmail = valueFor(formData, 'email', '');

  const subject = `Free 3DVR one-page website for ${name}`;
  const body = [
    'I want a free one-page 3DVR website draft.',
    '',
    `Name/business: ${name}`,
    `Offer/project: ${offer}`,
    `Audience: ${audience}`,
    `Main action button: ${action}`,
    `Best contact link: ${contact}`,
    `Best email for reply: ${leadEmail}`,
    '',
    'If I like it, I am open to keeping it live for $5/month.'
  ].join('\n');

  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function trackLeadIntent() {
  if (typeof window.gtag === 'function') {
    window.gtag('event', 'generate_lead', {
      method: 'mailto_brief'
    });
  }
  return trackFirstPartyEvent('generate_lead');
}

trackFirstPartyEvent('page_view');

shareButton?.addEventListener('click', async () => {
  const shareData = {
    title: 'A free first website from 3DVR',
    text: 'Starting a business or side hustle? Get a clean first website for free.',
    url: shareUrl
  };
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share(shareData);
      setShareStatus('Shared.');
      return;
    }
    await navigator.clipboard.writeText(shareUrl);
    setShareStatus('Link copied.');
  } catch (error) {
    if (error?.name !== 'AbortError') setShareStatus('Copy the link below to share it.');
  }
});

copyButton?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(shareUrl);
    setShareStatus('Link copied.');
  } catch (_error) {
    setShareStatus(shareUrl);
  }
});

if (form && mailtoLink && handoffCopy) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(form);
    const href = buildMailto(formData);
    mailtoLink.href = href;
    handoffCopy.textContent = 'Your brief is saved to our follow-up desk. Review the email, add links or photos, and send.';
    await Promise.race([
      saveBriefToCrm(formData),
      trackLeadIntent(),
      new Promise(resolve => setTimeout(resolve, 800))
    ]);
    window.location.href = href;
  });

  form.addEventListener('input', () => {
    mailtoLink.href = buildMailto(new FormData(form));
  });
}
