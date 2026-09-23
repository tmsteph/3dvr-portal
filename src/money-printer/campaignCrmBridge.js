'use strict';

function clean(value = '') {
  return String(value || '').trim();
}

export function normalizeCampaignCrmEmail(value = '') {
  return clean(value).toLowerCase();
}

function stableHash(value = '') {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function campaignCrmRecordId(email = '') {
  const normalized = normalizeCampaignCrmEmail(email);
  if (!normalized) return '';
  const slug = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 54);
  return `campaign-${slug || 'lead'}-${stableHash(normalized)}`;
}

function mergeTags(...values) {
  const seen = new Set();
  const output = [];
  values
    .flatMap(value => Array.isArray(value) ? value : String(value || '').split(','))
    .map(value => clean(value))
    .filter(Boolean)
    .forEach(value => {
      const key = value.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      output.push(value);
    });
  return output.join(', ');
}

function iso(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function buildCampaignCrmRecord({
  recipient = {},
  existing = {},
  subject = '',
  offer = '',
  sentAt = new Date(),
} = {}) {
  const email = normalizeCampaignCrmEmail(recipient.email || existing.email);
  if (!email) return null;
  const timestamp = iso(sentAt);
  const id = clean(existing.id) || campaignCrmRecordId(email);
  const name = clean(existing.name) || clean(recipient.name) || email;

  return {
    ...existing,
    id,
    recordType: clean(existing.recordType) || 'person',
    name,
    email,
    tags: mergeTags(existing.tags, 'source/campaigns', 'channel/email'),
    status: clean(existing.status) || 'Prospect',
    warmth: clean(existing.warmth) || 'cold',
    source: clean(existing.source) || '3DVR Campaigns',
    created: clean(existing.created) || timestamp,
    updated: timestamp,
    lastContacted: timestamp,
    activityCount: numeric(existing.activityCount, 0) + 1,
    nextBestAction: clean(existing.nextBestAction) || 'Watch for a reply and follow up if needed.',
    lastSignal: clean(subject)
      ? `Outreach sent from Campaigns: ${clean(subject)}`
      : 'Outreach sent from 3DVR Campaigns',
    campaignOffer: clean(offer) || clean(existing.campaignOffer),
  };
}

export function buildCampaignCrmTouch({
  record = {},
  subject = '',
  senderEmail = '',
  gmailMessageId = '',
  sentAt = new Date(),
  participantId = '',
  loggedBy = '',
} = {}) {
  const timestamp = iso(sentAt);
  const recordId = clean(record.id);
  const suffix = clean(gmailMessageId) || `${Date.parse(timestamp)}-${stableHash(`${recordId}:${subject}:${timestamp}`)}`;
  return {
    id: `${recordId || 'campaign'}-${suffix}`,
    recordId: clean(record.contactId) || recordId,
    crmRecordId: recordId,
    contactId: clean(record.contactId),
    contactName: clean(record.name) || clean(record.email) || 'Unnamed contact',
    timestamp,
    followUp: clean(record.nextFollowUp),
    note: clean(subject) ? `Email sent: ${clean(subject)}` : 'Email sent from 3DVR Campaigns.',
    touchType: 'outreach-sent',
    touchTypeLabel: 'Outreach sent',
    source: '3DVR Campaigns',
    statusAfter: clean(record.status),
    participantId: clean(participantId),
    loggedBy: clean(loggedBy),
    senderEmail: normalizeCampaignCrmEmail(senderEmail),
    gmailMessageId: clean(gmailMessageId),
  };
}

export function buildCampaignCrmInboxUpdate({
  existing = {},
  eventType = 'replied',
  subject = '',
  messageId = '',
  occurredAt = new Date(),
} = {}) {
  const timestamp = iso(occurredAt);
  const type = clean(eventType).toLowerCase();
  const replied = type === 'replied';
  const suppressed = type === 'suppressed';
  const bounced = type === 'bounced';
  const status = replied ? 'Warm - Discovery' : (suppressed || bounced) ? 'Lost' : clean(existing.status) || 'Prospect';
  const warmth = replied ? 'warm' : clean(existing.warmth) || 'cold';
  return {
    ...existing,
    status,
    warmth,
    updated: timestamp,
    activityCount: numeric(existing.activityCount, 0) + 1,
    replyCount: replied ? numeric(existing.replyCount, 0) + 1 : numeric(existing.replyCount, 0),
    lastReplyAt: replied ? timestamp : clean(existing.lastReplyAt),
    nextBestAction: replied
      ? 'Review the reply and respond.'
      : suppressed
        ? 'Do not contact.'
        : bounced
          ? 'Verify or replace the email address.'
          : clean(existing.nextBestAction),
    lastSignal: clean(subject)
      ? `${type}: ${clean(subject)}`
      : type,
    campaignInboxMessageId: clean(messageId) || clean(existing.campaignInboxMessageId),
  };
}

export function buildCampaignCrmInboxTouch({
  record = {},
  eventType = 'replied',
  subject = '',
  messageId = '',
  occurredAt = new Date(),
  participantId = '',
  loggedBy = '',
} = {}) {
  const timestamp = iso(occurredAt);
  const type = clean(eventType).toLowerCase();
  const touchType = type === 'replied' ? 'reply-received' : type === 'suppressed' ? 'not-a-fit' : 'message';
  const label = type === 'replied' ? 'Reply received' : type === 'suppressed' ? 'Not a fit' : type === 'bounced' ? 'Delivery bounced' : 'Message';
  const recordId = clean(record.id);
  const suffix = clean(messageId) || `${Date.parse(timestamp)}-${stableHash(`${recordId}:${type}:${subject}`)}`;
  return {
    id: `${recordId || 'campaign'}-${suffix}`,
    recordId: clean(record.contactId) || recordId,
    crmRecordId: recordId,
    contactId: clean(record.contactId),
    contactName: clean(record.name) || clean(record.email) || 'Unnamed contact',
    timestamp,
    followUp: clean(record.nextFollowUp),
    note: clean(subject) ? `${label}: ${clean(subject)}` : label,
    touchType,
    touchTypeLabel: label,
    source: '3DVR Campaigns',
    statusAfter: clean(record.status),
    participantId: clean(participantId),
    loggedBy: clean(loggedBy),
    gmailMessageId: clean(messageId),
  };
}

function putGun(node, value, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('crm-write-timeout'));
    }, timeoutMs);

    node.put(value, ack => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ack?.err) {
        reject(new Error(String(ack.err)));
        return;
      }
      resolve(value);
    });
  });
}

export function createBrowserCampaignCrmBridge({
  GunCtor = globalThis.Gun,
  peers = globalThis.__GUN_PEERS__ || ['wss://gun-relay-3dvr.fly.dev/gun'],
  lookupWaitMs = 650,
} = {}) {
  if (typeof GunCtor !== 'function') {
    return { available: false, reason: 'gun-unavailable' };
  }

  const gun = GunCtor(peers);
  const crmRecords = gun.get('3dvr-crm');
  const touchLogRoot = gun.get('3dvr-portal').get('crm-touch-log');
  const byEmail = new Map();

  try {
    crmRecords.map().on((data, id) => {
      const email = normalizeCampaignCrmEmail(data?.email);
      if (!email || !data) return;
      byEmail.set(email, { ...data, id: clean(data.id) || clean(id) });
    });
  } catch {
    return { available: false, reason: 'crm-listener-failed' };
  }

  async function findExisting(email) {
    const normalized = normalizeCampaignCrmEmail(email);
    if (!normalized) return null;
    if (byEmail.has(normalized)) return byEmail.get(normalized);

    return new Promise(resolve => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(byEmail.get(normalized) || null);
      }, lookupWaitMs);

      try {
        crmRecords.map().once((data, id) => {
          const candidateEmail = normalizeCampaignCrmEmail(data?.email);
          if (!candidateEmail || !data) return;
          const record = { ...data, id: clean(data.id) || clean(id) };
          byEmail.set(candidateEmail, record);
          if (!settled && candidateEmail === normalized) {
            settled = true;
            clearTimeout(timer);
            resolve(record);
          }
        });
      } catch {
        clearTimeout(timer);
        resolve(null);
      }
    });
  }

  async function recordSend({
    recipient = {},
    subject = '',
    offer = '',
    senderEmail = '',
    gmailMessageId = '',
    sentAt = new Date(),
  } = {}) {
    const email = normalizeCampaignCrmEmail(recipient.email);
    if (!email) throw new Error('crm-recipient-email-required');
    const existing = await findExisting(email);
    const record = buildCampaignCrmRecord({ recipient, existing: existing || {}, subject, offer, sentAt });
    await putGun(crmRecords.get(record.id), record);
    byEmail.set(email, record);

    const touch = buildCampaignCrmTouch({
      record,
      subject,
      senderEmail,
      gmailMessageId,
      sentAt,
      participantId: clean(globalThis.localStorage?.getItem?.('alias')),
      loggedBy: clean(globalThis.localStorage?.getItem?.('username') || globalThis.localStorage?.getItem?.('alias')),
    });
    await putGun(touchLogRoot.get(touch.id), touch);
    return { record, touch, created: !existing };
  }

  async function recordInboxEvent({
    email = '',
    eventType = 'replied',
    subject = '',
    messageId = '',
    occurredAt = new Date(),
  } = {}) {
    const normalized = normalizeCampaignCrmEmail(email);
    if (!normalized) throw new Error('crm-recipient-email-required');
    const existing = await findExisting(normalized);
    if (!existing?.id) throw new Error('crm-record-not-found');
    const record = buildCampaignCrmInboxUpdate({ existing, eventType, subject, messageId, occurredAt });
    await putGun(crmRecords.get(record.id), record);
    byEmail.set(normalized, record);
    const touch = buildCampaignCrmInboxTouch({
      record,
      eventType,
      subject,
      messageId,
      occurredAt,
      participantId: clean(globalThis.localStorage?.getItem?.('alias')),
      loggedBy: clean(globalThis.localStorage?.getItem?.('username') || globalThis.localStorage?.getItem?.('alias')),
    });
    await putGun(touchLogRoot.get(touch.id), touch);
    return { record, touch };
  }

  return {
    available: true,
    recordSend,
    recordInboxEvent,
  };
}
