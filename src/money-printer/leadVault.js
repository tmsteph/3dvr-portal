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

export function leadVaultStatusRank(status = '') {
  return {
    discovered: 0,
    selected: 1,
    'send-failed': 2,
    sent: 3,
    replied: 4,
    customer: 5
  }[clean(status)] ?? 0;
}

function recordTime(record = {}) {
  const value = record.updatedAt || record.lastSeenAt || record.firstSeenAt || '';
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function earliestIso(...values) {
  const parsed = values
    .filter(Boolean)
    .map(value => ({ value, time: Date.parse(value) }))
    .filter(item => Number.isFinite(item.time))
    .sort((a, b) => a.time - b.time);
  return parsed[0]?.value || '';
}

function latestIso(...values) {
  const parsed = values
    .filter(Boolean)
    .map(value => ({ value, time: Date.parse(value) }))
    .filter(item => Number.isFinite(item.time))
    .sort((a, b) => b.time - a.time);
  return parsed[0]?.value || '';
}

export function writeLeadVault(leads = [], storage = safeStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(LEAD_VAULT_STORAGE_KEY, JSON.stringify(
      Array.isArray(leads) ? leads.slice(0, 1000) : []
    ));
    return true;
  } catch {
    return false;
  }
}

export function mergeLeadVaultRecords(localLeads = [], remoteLeads = []) {
  const byId = new Map();

  for (const record of [...localLeads, ...remoteLeads]) {
    const id = idForEmail(record?.id || record?.email);
    if (!id) continue;
    const incoming = { ...record, id, email: id };
    const current = byId.get(id);
    if (!current) {
      byId.set(id, incoming);
      continue;
    }

    const incomingIsNewer = recordTime(incoming) >= recordTime(current);
    const newer = incomingIsNewer ? incoming : current;
    const older = incomingIsNewer ? current : incoming;
    const status = leadVaultStatusRank(incoming.status) >= leadVaultStatusRank(current.status)
      ? incoming.status
      : current.status;

    byId.set(id, {
      ...older,
      ...newer,
      id,
      email: id,
      status: status || 'discovered',
      firstSeenAt: earliestIso(current.firstSeenAt, incoming.firstSeenAt)
        || newer.firstSeenAt || older.firstSeenAt,
      lastSeenAt: latestIso(current.lastSeenAt, incoming.lastSeenAt)
        || newer.lastSeenAt || older.lastSeenAt,
      updatedAt: latestIso(
        current.updatedAt,
        incoming.updatedAt,
        current.lastSeenAt,
        incoming.lastSeenAt
      ),
      selectedAt: earliestIso(current.selectedAt, incoming.selectedAt) || undefined,
      sentAt: earliestIso(current.sentAt, incoming.sentAt) || undefined
    });
  }

  return [...byId.values()]
    .sort((a, b) => recordTime(b) - recordTime(a))
    .slice(0, 1000);
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
      lastSeenAt: seenAt,
      updatedAt: seenAt
    };
    byId.set(email, next);
    if (!previous) added += 1;
  }

  const saved = [...byId.values()]
    .sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)))
    .slice(0, 1000);
  writeLeadVault(saved, storage);
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
  const nextStatus = leadVaultStatusRank(status) >= leadVaultStatusRank(current.status)
    ? clean(status)
    : current.status;

  leads[index] = {
    ...current,
    status: nextStatus,
    updatedAt: now.toISOString(),
    ...(nextStatus === 'selected' ? { selectedAt: current.selectedAt || now.toISOString() } : {}),
    ...(nextStatus === 'sent' ? { sentAt: current.sentAt || now.toISOString() } : {})
  };
  writeLeadVault(leads, storage);
  return true;
}
