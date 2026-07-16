function normalizeText(value) {
  return String(value || '').trim();
}

function parseLimit(value, fallback = 0) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function successfulOutreach(entry = {}) {
  return ['sent', 'submitted'].includes(normalizeText(entry.status).toLowerCase());
}

function entryDate(entry = {}) {
  return normalizeText(entry.timestamp).slice(0, 10);
}

function campaignIsActive({ start = '', end = '', today = new Date().toISOString().slice(0, 10) } = {}) {
  const date = normalizeText(today);
  const first = normalizeText(start);
  const last = normalizeText(end);
  if (first && date < first) return false;
  if (last && date > last) return false;
  return true;
}

function getCampaignAllowance(entries = [], options = {}) {
  const today = normalizeText(options.today) || new Date().toISOString().slice(0, 10);
  const campaignId = normalizeText(options.campaignId);
  const dailyLimit = parseLimit(options.dailyLimit, 5);
  const totalLimit = parseLimit(options.totalLimit, 0);
  const active = campaignIsActive({ start: options.start, end: options.end, today });
  const successful = entries.filter(successfulOutreach);
  const dailySent = successful.filter((entry) => entryDate(entry) === today).length;
  const campaignSent = successful.filter((entry) => (
    !campaignId || normalizeText(entry.experiment || entry.experimentId) === campaignId
  )).length;
  const dailyRemaining = Math.max(0, dailyLimit - dailySent);
  const totalRemaining = totalLimit > 0 ? Math.max(0, totalLimit - campaignSent) : Number.POSITIVE_INFINITY;

  return {
    active,
    today,
    campaignId,
    dailyLimit,
    totalLimit,
    dailySent,
    campaignSent,
    dailyRemaining,
    totalRemaining,
    allowed: active ? Math.max(0, Math.min(dailyRemaining, totalRemaining)) : 0,
  };
}

function successfulRecipientKeys(entries = []) {
  const keys = new Set();
  for (const entry of entries) {
    if (!successfulOutreach(entry)) continue;
    const name = normalizeText(entry.name).toLowerCase();
    const contact = normalizeText(entry.contact).toLowerCase();
    if (name) keys.add(`name:${name}`);
    if (contact) keys.add(`contact:${contact}`);
  }
  return keys;
}

module.exports = {
  campaignIsActive,
  getCampaignAllowance,
  parseLimit,
  successfulOutreach,
  successfulRecipientKeys,
};
