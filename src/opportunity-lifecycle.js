export const CANONICAL_OPPORTUNITY_STATUSES = Object.freeze([
  'discovered',
  'ready',
  'contacted',
  'conversation',
  'offered',
  'booking-pending',
  'booked',
  'passed',
  'rejected',
  'expired',
  'closed',
]);

const SOURCE_MAPS = Object.freeze({
  engine: Object.freeze({
    new: 'discovered',
    'response-ready': 'ready',
    experimenting: 'ready',
    reviewing: 'conversation',
    contacted: 'contacted',
    won: 'booked',
    passed: 'passed',
    expired: 'expired',
  }),
  freelance: Object.freeze({
    found: 'discovered',
    ready: 'ready',
    applied: 'contacted',
    interview: 'conversation',
    offered: 'offered',
    booked: 'booked',
    passed: 'passed',
    rejected: 'rejected',
  }),
  'work-agent': Object.freeze({
    lead: 'discovered',
    drafted: 'ready',
    awaiting_approval: 'ready',
    sent: 'contacted',
    replied: 'conversation',
    negotiating: 'conversation',
    awaiting_booking_approval: 'booking-pending',
    booked: 'booked',
    declined: 'passed',
    closed: 'closed',
  }),
});

const TARGET_MAPS = Object.freeze({
  engine: Object.freeze({
    discovered: 'new',
    ready: 'response-ready',
    contacted: 'contacted',
    conversation: 'reviewing',
    offered: 'reviewing',
    'booking-pending': 'reviewing',
    booked: 'won',
    passed: 'passed',
    rejected: 'passed',
    expired: 'expired',
    closed: 'passed',
  }),
  freelance: Object.freeze({
    discovered: 'Found',
    ready: 'Ready',
    contacted: 'Applied',
    conversation: 'Interview',
    offered: 'Offered',
    'booking-pending': 'Offered',
    booked: 'Booked',
    passed: 'Passed',
    rejected: 'Rejected',
    expired: 'Passed',
    closed: 'Passed',
  }),
  'work-agent': Object.freeze({
    discovered: 'lead',
    ready: 'drafted',
    contacted: 'sent',
    conversation: 'replied',
    offered: 'negotiating',
    'booking-pending': 'awaiting_booking_approval',
    booked: 'booked',
    passed: 'declined',
    rejected: 'closed',
    expired: 'closed',
    closed: 'closed',
  }),
});

function normalized(value = '') {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
}

export function normalizeCanonicalOpportunityStatus(value = '') {
  const status = normalized(value).replace(/_/g, '-');
  return CANONICAL_OPPORTUNITY_STATUSES.includes(status) ? status : '';
}

export function toCanonicalOpportunityStatus(value = '', source = 'auto') {
  const direct = normalizeCanonicalOpportunityStatus(value);
  if (direct) return direct;

  const key = normalized(value);
  if (!key) return 'discovered';

  if (source !== 'auto') {
    return SOURCE_MAPS[source]?.[key] || 'discovered';
  }

  for (const map of Object.values(SOURCE_MAPS)) {
    if (map[key]) return map[key];
  }
  return 'discovered';
}

export function projectOpportunityStatus(canonicalStatus, target) {
  const canonical = normalizeCanonicalOpportunityStatus(canonicalStatus) || 'discovered';
  return TARGET_MAPS[target]?.[canonical] || canonical;
}

export function opportunityLifecycleView(record = {}, source = 'auto') {
  const canonicalStatus = normalizeCanonicalOpportunityStatus(record.canonicalStatus)
    || toCanonicalOpportunityStatus(record.status, source);
  return {
    canonicalStatus,
    sourceStatus: String(record.status || '').trim(),
    isOpen: !['booked', 'passed', 'rejected', 'expired', 'closed'].includes(canonicalStatus),
    isActionable: ['discovered', 'ready', 'contacted', 'conversation', 'offered', 'booking-pending'].includes(canonicalStatus),
  };
}
