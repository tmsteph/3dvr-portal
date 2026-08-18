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
  const name = valueFor(formData, 'name', 'New free website lead');
  const leadEmail = valueFor(formData, 'email', '');
  const offer = valueFor(formData, 'offer', 'Needs a simple first website.');
  const now = new Date().toISOString();
  const id = `lead-free-site-${slug(leadEmail || name)}`;
  const record = {
    id,
    recordType: 'person',
    name,
    email: leadEmail,
    company: name,
    role: 'Founder / operator',
    tags: ['free-site', 'inbound', 'automated-build'],
    status: 'new',
    warmth: 'warm',
    source: 'free-page',
    offerAmount: 'Free one-page site on a 3DVR-hosted address; optional paid upgrades',
    nextBestAction: 'Build and publish the smallest useful one-page website, then email the live URL.',
    nextFollowUp: now.slice(0, 10),
    activityCount: 1,
    created: now,
    updated: now,
    notes: [`Inbound free website request`, `Offer/project: ${offer}`].join('\n')
  };
  const touch = {
    id: `touch-free-site-${slug(leadEmail || name)}-${Date.now()}`,
    recordId: id,
    contactName: name,
    contactEmail: leadEmail,
    type: 'inbound',
    channel: 'free-page',
    source: 'free-page',
    summary: 'Inbound request for a free live 3DVR-hosted website.',
    outcome: 'Lead captured for automated build and email delivery.',
    message: JSON.stringify({ name, email: leadEmail, offer }),
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
  const name = valueFor(formData, 'name', 'A new 3DVR website');
  const offer = valueFor(formData, 'offer', 'I need a simple website that explains what I do and how to contact me.');
  const leadEmail = valueFor(formData, 'email', '');

  const subject = `Free 3DVR website request — ${name}`;
  const body = [
    'I want a free live one-page website on a 3DVR-hosted address.',
    '',
    `Name/business: ${name}`,
    `Best email for the live link: ${leadEmail}`,
    '',
    'What the website should explain:',
    offer,
    '',
    'Please build the smallest useful version and email me the live URL.',
    '',
    'Optional: I can reply with my current website, social profile, logo, photos, phone number, booking link, or other details if needed.'
  ].join('\n');

  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function trackLeadIntent() {
  if (typeof window.gtag === 'function') {
    window.gtag('event', 'generate_lead', {
      method: 'free_live_site_email'
    });
  }
  return trackFirstPartyEvent('generate_lead');
}

trackFirstPartyEvent('page_view');

shareButton?.addEventListener('click', async () => {
  const shareData = {
    title: 'Get a free live website from 3DVR',
    text: '3DVR will build a simple one-page site, publish it on a 3DVR-hosted address, and email you the live link for free.',
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
    handoffCopy.textContent = 'Your request is in the 3DVR follow-up desk. Send the prepared email so the automated build queue can return a live site link.';
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
