import { opportunityLifecycleView, projectOpportunityStatus, toCanonicalOpportunityStatus } from './opportunity-lifecycle.js';

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

const NEXT_CANONICAL_STATUS = Object.freeze({
  discovered: 'contacted',
  ready: 'contacted',
  contacted: 'conversation',
  conversation: 'offered',
  offered: 'booked',
  'booking-pending': 'booked',
});

const STAGE_PRIORITY = new Map([
  ['offered', 70],
  ['booking-pending', 70],
  ['conversation', 60],
  ['ready', 50],
  ['discovered', 40],
  ['contacted', 30],
  ['booked', 20],
]);

function text(value) {
  return String(value || '').trim();
}
export function normalizeFreelanceOpportunity(record = {}) {
  const score = Number(record.fitScore);
  const status = text(record.status) || 'Found';
  const canonicalStatus = opportunityLifecycleView({
    status,
    canonicalStatus: record.canonicalStatus,
  }, 'freelance').canonicalStatus;
  return {
    ...record,
    id: text(record.id),
    company: text(record.company),
    title: text(record.title),
    location: text(record.location),
    sourceUrl: text(record.sourceUrl),
    compensation: text(record.compensation),
    status,
    canonicalStatus,
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
  return opportunityLifecycleView(record, 'freelance').isOpen;
}
export function getOpportunityPriority(record = {}) {
  const opportunity = normalizeFreelanceOpportunity(record);
  const stage = STAGE_PRIORITY.get(opportunity.canonicalStatus) || 0;
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
  const ready = open.filter(item => ['discovered', 'ready'].includes(item.canonicalStatus));
  const applied = open.filter(item => item.canonicalStatus === 'contacted');
  const conversations = open.filter(item => ['conversation', 'offered', 'booking-pending'].includes(item.canonicalStatus));
  const booked = all.filter(item => item.canonicalStatus === 'booked');

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
  const current = record.canonicalStatus
    ? toCanonicalOpportunityStatus(record.canonicalStatus)
    : toCanonicalOpportunityStatus(record.status, 'freelance');
  const next = NEXT_CANONICAL_STATUS[current];
  return next ? projectOpportunityStatus(next, 'freelance') : '';
}
