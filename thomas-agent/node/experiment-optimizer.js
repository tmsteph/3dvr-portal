function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeVariantList(value) {
  const variants = Array.isArray(value)
    ? value
    : String(value || 'a,b').split(/[,;\s]+/);
  return [...new Set(variants.map((item) => normalizeText(item).toLowerCase()).filter(Boolean))];
}

function campaignEntries(entries = [], campaignId = '') {
  const id = normalizeText(campaignId);
  return entries.filter((entry) => !id || normalizeText(entry.experiment || entry.experimentId) === id);
}

function summarizeVariantResults(entries = [], { campaignId = '', variants = ['a', 'b'] } = {}) {
  const ids = normalizeVariantList(variants);
  const rows = new Map(ids.map((id) => [id, {
    variant: id,
    attempts: 0,
    replies: 0,
    closed: 0,
    failures: 0,
    replyRate: 0,
  }]));

  for (const entry of campaignEntries(entries, campaignId)) {
    const variant = normalizeText(entry.variant).toLowerCase();
    if (!rows.has(variant)) continue;
    const row = rows.get(variant);
    const status = normalizeText(entry.status).toLowerCase();
    if (status === 'sent' || status === 'submitted') row.attempts += 1;
    if (status === 'replied' || status === 'reply') row.replies += 1;
    if (status === 'closed') row.closed += 1;
    if (status.includes('fail') || status === 'bounced') row.failures += 1;
  }

  for (const row of rows.values()) {
    row.replyRate = row.attempts ? row.replies / row.attempts : 0;
  }
  return [...rows.values()];
}

function chooseExperimentVariant(entries = [], options = {}) {
  const variants = normalizeVariantList(options.variants);
  if (!variants.length) return { variant: '', phase: 'off', rows: [] };
  const rows = summarizeVariantResults(entries, { ...options, variants });
  const minSampleSize = Math.max(1, Number.parseInt(String(options.minSampleSize || 8), 10) || 8);
  const minimumReplies = Math.max(1, Number.parseInt(String(options.minimumReplies || 2), 10) || 2);
  const minimumLift = Math.max(0, Number.parseFloat(String(options.minimumLift || 0.05)) || 0.05);
  const underSampled = rows.filter((row) => row.attempts < minSampleSize);

  if (underSampled.length) {
    const next = underSampled.slice().sort((left, right) => (
      left.attempts - right.attempts || left.variant.localeCompare(right.variant)
    ))[0];
    return { variant: next.variant, phase: 'explore', rows, reason: `balancing until each variant has ${minSampleSize} attempts` };
  }

  const ranked = rows.slice().sort((left, right) => (
    right.replyRate - left.replyRate
    || right.closed - left.closed
    || left.variant.localeCompare(right.variant)
  ));
  const best = ranked[0];
  const runnerUp = ranked[1];
  const totalReplies = rows.reduce((total, row) => total + row.replies, 0);
  const lift = runnerUp ? best.replyRate - runnerUp.replyRate : best.replyRate;

  if (totalReplies < minimumReplies || lift < minimumLift) {
    const next = rows.slice().sort((left, right) => (
      left.attempts - right.attempts || left.variant.localeCompare(right.variant)
    ))[0];
    return { variant: next.variant, phase: 'learn', rows, reason: 'not enough reply evidence to select a winner' };
  }

  return { variant: best.variant, phase: 'exploit', rows, winner: best.variant, reason: 'minimum sample and lift thresholds reached' };
}

module.exports = {
  chooseExperimentVariant,
  normalizeVariantList,
  summarizeVariantResults,
};
