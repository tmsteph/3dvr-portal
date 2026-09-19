import {
  MESSAGE_REVIEW_STORAGE_KEY,
  createMessageReviewItem
} from './messageReview.js';

function clean(value = '') {
  return String(value || '').trim();
}

function safeStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function queueId(email = '') {
  return `campaign-lead-${clean(email).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

export function readCampaignReviewQueue(storage = safeStorage()) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(MESSAGE_REVIEW_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function queueCampaignLeads({
  leads = [],
  subject = '',
  body = '',
  offer = '',
  senderName = '',
  storage = safeStorage(),
  now = new Date()
} = {}) {
  if (!storage) return { queued: 0, total: 0, items: [] };

  const existing = readCampaignReviewQueue(storage);
  const byId = new Map(existing.map(item => [item.id, item]));
  let queued = 0;

  for (const lead of Array.isArray(leads) ? leads : []) {
    const email = clean(lead?.email).toLowerCase();
    if (!email) continue;

    const id = queueId(email);
    const previous = byId.get(id);
    const item = createMessageReviewItem({
      id,
      leadId: `campaign:${email}`,
      leadName: clean(lead?.name) || email,
      leadContact: email,
      leadTemperature: 'cold',
      relationship: 'public-business-contact',
      messageType: 'cold-outreach',
      commercial: true,
      offer: clean(offer) || '3DVR service offer',
      subject: clean(subject),
      body: clean(body),
      whyGenerated: [
        '3DVR Campaigns found a public business contact for the current offer.',
        clean(lead?.sourceUrl) ? `Source: ${clean(lead.sourceUrl)}` : ''
      ].filter(Boolean).join(' '),
      whyLeadRelevant: clean(lead?.whyFit || lead?.evidence)
        || 'Public business appears to match the selected customer profile.',
      offerConnection: clean(offer)
        ? `Matches the selected offer: ${clean(offer)}`
        : 'Matches the current Campaigns offer.',
      hasOptOut: true,
      accurateSenderIdentity: Boolean(clean(senderName)),
      status: previous?.status === 'sent' ? 'sent' : 'queued',
      createdAt: previous?.createdAt || now.toISOString(),
      updatedAt: now.toISOString()
    });

    byId.set(id, {
      ...previous,
      ...item,
      status: previous?.status === 'sent' ? 'sent' : item.status
    });
    if (!previous) queued += 1;
  }

  const items = [...byId.values()];
  storage.setItem(MESSAGE_REVIEW_STORAGE_KEY, JSON.stringify(items));
  return { queued, total: items.length, items };
}

export function markCampaignLeadStatus(
  email,
  status,
  storage = safeStorage(),
  now = new Date()
) {
  if (!storage) return false;
  const id = queueId(email);
  const items = readCampaignReviewQueue(storage);
  const index = items.findIndex(item => item.id === id);
  if (index < 0) return false;

  items[index] = {
    ...items[index],
    status: clean(status) || items[index].status,
    updatedAt: now.toISOString()
  };
  storage.setItem(MESSAGE_REVIEW_STORAGE_KEY, JSON.stringify(items));
  return true;
}
