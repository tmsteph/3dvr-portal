export const FREELANCE_OPPORTUNITY_STATUSES = Object.freeze([
  'Found',
  'Ready',
  'Applied',
  'Interview',
  'Offered',
  'Booked',
  'Passed',
  'Rejected',
]);

const CLOSED_STATUSES = new Set(['passed', 'rejected']);
const NEXT_STATUS = Object.freeze({
  found: 'Applied',
  ready: 'Applied',
  applied: 'Interview',
  interview: 'Offered',
  offered: 'Booked',
});

const STAGE_PRIORITY = new Map([
  ['offered', 70],
  ['interview', 60],
  ['ready', 50],
  ['found', 40],
  ['applied', 30],
  ['booked', 20],
]);

function text(value) {
  return String(value || '').trim();
}
export function normalizeFreelanceOpportunity(record = {}) {
  const score = Number(record.fitScore);
  return {
    ...record,
    id: text(record.id),
    company: text(record.company),
    title: text(record.title),
    location: text(record.location),
    sourceUrl: text(record.sourceUrl),
    compensation: text(record.compensation),
    status: text(record.status) || 'Found',
    fitScore: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0,
    availability: text(record.availability) || 'unknown',
    requirements: text(record.requirements),
    notes: text(record.notes),
    foundAt: text(record.foundAt),
    appliedAt: text(record.appliedAt),
    updatedAt: text(record.updatedAt),
  };
}

export function isOpportunityOpen(record = {}) {
  const status = text(record.status).toLowerCase();
  return !CLOSED_STATUSES.has(status);
}
export function getOpportunityPriority(record = {}) {
  const opportunity = normalizeFreelanceOpportunity(record);
  const stage = STAGE_PRIORITY.get(opportunity.status.toLowerCase()) || 0;
  const availabilityBoost = opportunity.availability === 'clear' ? 12 : 0;
  const conflictPenalty = opportunity.availability === 'conflict' ? 80 : 0;
  return opportunity.fitScore + stage + availabilityBoost - conflictPenalty;
}

export function buildOpportunityPipeline(opportunities = []) {
  const all = opportunities
    .map(normalizeFreelanceOpportunity)
    .filter(opportunity => opportunity.id && opportunity.title)
    .sort((a, b) => getOpportunityPriority(b) - getOpportunityPriority(a));

  const open = all.filter(isOpportunityOpen);
  const ready = open.filter(item => ['found', 'ready'].includes(item.status.toLowerCase()));
  const applied = open.filter(item => item.status.toLowerCase() === 'applied');
  const conversations = open.filter(item => ['interview', 'offered'].includes(item.status.toLowerCase()));
  const booked = all.filter(item => item.status.toLowerCase() === 'booked');

  return {
    all,
    open,
    ready,
    applied,
    conversations,
    booked,
    metrics: {
      open: open.length,
      ready: ready.length,
      applied: applied.length,
      conversations: conversations.length,
      booked: booked.length,
    },
  };
}

export function getNextOpportunityStatus(record = {}) {
  const status = text(record.status).toLowerCase();
  return NEXT_STATUS[status] || '';
}
