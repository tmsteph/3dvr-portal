export const LEAD_VAULT_STORAGE_KEY = '3dvr.moneyPrinter.leadVault.v1';

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

function idForEmail(email = '') {
  return clean(email).toLowerCase();
}

function statusRank(status = '') {
  return {
    discovered: 0,
    selected: 1,
    'send-failed': 2,
    sent: 3,
    replied: 4,
    customer: 5
  }[clean(status)] ?? 0;
}

export function readLeadVault(storage = safeStorage()) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(LEAD_VAULT_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDiscoveredLeads({
  leads = [],
  offer = '',
  location = '',
  campaignDraft = null,
  storage = safeStorage(),
  now = new Date()
} = {}) {
  if (!storage) return { added: 0, total: 0, leads: [] };

  const existing = readLeadVault(storage);
  const byId = new Map(existing.map(item => [item.id, item]));
  let added = 0;

  for (const lead of Array.isArray(leads) ? leads : []) {
    const email = idForEmail(lead?.email);
    if (!email) continue;
    const previous = byId.get(email);
    const seenAt = now.toISOString();
    const next = {
      ...previous,
      id: email,
      email,
      name: clean(lead?.name) || previous?.name || email,
      website: clean(lead?.website) || previous?.website || '',
      location: clean(lead?.location) || clean(location) || previous?.location || '',
      whyFit: clean(lead?.whyFit) || previous?.whyFit || '',
      evidence: clean(lead?.evidence) || previous?.evidence || '',
      sourceUrl: clean(lead?.sourceUrl) || previous?.sourceUrl || '',
      offer: clean(offer) || previous?.offer || '',
      draftSubject: clean(campaignDraft?.subject) || previous?.draftSubject || '',
      draftBody: clean(campaignDraft?.body) || previous?.draftBody || '',
      status: previous?.status || 'discovered',
      firstSeenAt: previous?.firstSeenAt || seenAt,
      lastSeenAt: seenAt
    };
    byId.set(email, next);
    if (!previous) added += 1;
  }

  const saved = [...byId.values()]
    .sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)))
    .slice(0, 1000);
  storage.setItem(LEAD_VAULT_STORAGE_KEY, JSON.stringify(saved));
  return { added, total: saved.length, leads: saved };
}

export function markLeadVaultStatus(
  email,
  status,
  storage = safeStorage(),
  now = new Date()
) {
  if (!storage) return false;
  const id = idForEmail(email);
  const leads = readLeadVault(storage);
  const index = leads.findIndex(item => item.id === id);
  if (index < 0) return false;

  const current = leads[index];
  const nextStatus = statusRank(status) >= statusRank(current.status)
    ? clean(status)
    : current.status;

  leads[index] = {
    ...current,
    status: nextStatus,
    updatedAt: now.toISOString(),
    ...(nextStatus === 'selected' ? { selectedAt: current.selectedAt || now.toISOString() } : {}),
    ...(nextStatus === 'sent' ? { sentAt: current.sentAt || now.toISOString() } : {})
  };
  storage.setItem(LEAD_VAULT_STORAGE_KEY, JSON.stringify(leads));
  return true;
}
