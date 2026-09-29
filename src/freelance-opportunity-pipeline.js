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

const LIFECYCLE_PROGRESS = new Map([
  ['discovered', 10],
  ['ready', 20],
  ['contacted', 30],
  ['conversation', 40],
  ['offered', 50],
  ['booking-pending', 60],
  ['passed', 90],
  ['rejected', 90],
  ['expired', 90],
  ['closed', 90],
  ['booked', 100],
]);

function chooseWorkflowState(existing, candidate) {
  const existingStatus = opportunityLifecycleView(existing, 'freelance').canonicalStatus;
  const candidateStatus = opportunityLifecycleView(candidate, 'freelance').canonicalStatus;
  const existingProgress = LIFECYCLE_PROGRESS.get(existingStatus) || 0;
  const candidateProgress = LIFECYCLE_PROGRESS.get(candidateStatus) || 0;

  if (candidateProgress !== existingProgress) {
    return candidateProgress > existingProgress ? candidate : existing;
  }
  return recordTimestamp(candidate) >= recordTimestamp(existing) ? candidate : existing;
}

function text(value) {
  return String(value || '').trim();
}

function normalizedKeyPart(value) {
  return text(value).toLowerCase().replace(/\s+/g, ' ');
}

function canonicalSourceUrl(value) {
  const raw = text(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.hash = '';
    [...url.searchParams.keys()].forEach(key => {
      if (/^(utm_|fbclid$|gclid$|mc_)/i.test(key)) url.searchParams.delete(key);
    });
    url.searchParams.sort();
    return url.href.replace(/\/$/, '');
  } catch {
    return raw.replace(/#.*$/, '').replace(/\/$/, '');
  }
}

function recordTimestamp(record = {}) {
  const value = Date.parse(record.updatedAt || record.foundAt || record.appliedAt || '');
  return Number.isFinite(value) ? value : 0;
}

function richness(record = {}) {
  return [
    record.company,
    record.location,
    record.sourceUrl,
    record.compensation,
    record.requirements,
    record.notes,
    record.startsAt,
    record.endsAt,
    record.source,
    record.externalId,
  ].filter(value => text(value)).length;
}

export function getOpportunityDedupeKey(record = {}) {
  const source = normalizedKeyPart(record.source);
  const externalId = normalizedKeyPart(record.externalId);
  if (source && externalId) return `external:${source}:${externalId}`;

  const sourceUrl = canonicalSourceUrl(record.sourceUrl);
  if (sourceUrl) return `url:${sourceUrl}`;

  const startsAt = normalizedKeyPart(record.startsAt || record.startDate || record.date);
  const company = normalizedKeyPart(record.company || record.client);
  const title = normalizedKeyPart(record.title || record.role);
  const location = normalizedKeyPart(record.location);
  if (startsAt && title && (company || location || source)) {
    return `shape:${source}|${company}|${title}|${startsAt}|${location}`;
  }

  return '';
}

function mergeDuplicateOpportunity(existing, candidate) {
  const existingTime = recordTimestamp(existing);
  const candidateTime = recordTimestamp(candidate);
  const newer = candidateTime >= existingTime ? candidate : existing;
  const older = newer === candidate ? existing : candidate;
  const merged = { ...older, ...newer };
  const workflow = chooseWorkflowState(existing, candidate);
  merged.canonicalStatus = opportunityLifecycleView(workflow, 'freelance').canonicalStatus;
  merged.status = projectOpportunityStatus(merged.canonicalStatus, 'freelance');
  if (workflow.appliedAt) merged.appliedAt = workflow.appliedAt;

  for (const [key, value] of Object.entries(older)) {
    if (!text(merged[key]) && text(value)) merged[key] = value;
  }

  if (richness(older) > richness(newer)) {
    for (const key of ['company', 'location', 'sourceUrl', 'compensation', 'requirements', 'notes', 'startsAt', 'endsAt', 'source', 'externalId']) {
      if (!text(merged[key]) && text(older[key])) merged[key] = older[key];
    }
  }

  const duplicateIds = new Set([
    ...(existing.duplicateIds || []),
    ...(candidate.duplicateIds || []),
    existing.id,
    candidate.id,
  ].filter(Boolean));

  return {
    ...merged,
    duplicateIds: [...duplicateIds],
    duplicateCount: duplicateIds.size,
  };
}

export function dedupeFreelanceOpportunities(opportunities = []) {
  const byKey = new Map();
  const unique = [];

  opportunities.forEach(record => {
    const opportunity = normalizeFreelanceOpportunity(record);
    const key = getOpportunityDedupeKey(opportunity);
    if (!key) {
      unique.push(opportunity);
      return;
    }
    const existing = byKey.get(key);
    if (!existing) {
      const first = { ...opportunity, dedupeKey: key, duplicateIds: [opportunity.id].filter(Boolean), duplicateCount: 1 };
      byKey.set(key, first);
      unique.push(first);
      return;
    }
    const merged = { ...mergeDuplicateOpportunity(existing, opportunity), dedupeKey: key };
    byKey.set(key, merged);
    const index = unique.indexOf(existing);
    if (index >= 0) unique[index] = merged;
  });

  return unique;
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
    source: text(record.source),
    externalId: text(record.externalId),
    sourceUrl: canonicalSourceUrl(record.sourceUrl),
    compensation: text(record.compensation),
    startsAt: text(record.startsAt || record.startDate || record.date),
    endsAt: text(record.endsAt || record.endDate),
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
export function getOpportunityPriorityBreakdown(record = {}) {
  const opportunity = normalizeFreelanceOpportunity(record);
  const stage = STAGE_PRIORITY.get(opportunity.canonicalStatus) || 0;
  const availabilityBoost = opportunity.availability === 'clear' ? 12 : 0;
  const conflictPenalty = opportunity.availability === 'conflict' ? 80 : 0;
  const score = opportunity.fitScore + stage + availabilityBoost - conflictPenalty;
  const reasons = [`${opportunity.fitScore}% fit`];

  if (stage) reasons.push(
    opportunity.canonicalStatus === 'offered' || opportunity.canonicalStatus === 'booking-pending'
      ? 'offer needs attention'
      : opportunity.canonicalStatus === 'conversation'
        ? 'active conversation'
        : opportunity.canonicalStatus === 'ready'
          ? 'ready to act'
          : opportunity.canonicalStatus === 'discovered'
            ? 'new lead'
            : opportunity.canonicalStatus === 'contacted'
              ? 'already contacted'
              : opportunity.canonicalStatus,
  );
  if (availabilityBoost) reasons.push('calendar clear');
  if (conflictPenalty) reasons.push('calendar conflict');

  return {
    score,
    fitScore: opportunity.fitScore,
    stage,
    availabilityBoost,
    conflictPenalty,
    reasons,
  };
}

export function getOpportunityPriority(record = {}) {
  return getOpportunityPriorityBreakdown(record).score;
}

export function buildOpportunityPipeline(opportunities = []) {
  const all = dedupeFreelanceOpportunities(opportunities)
    .filter(opportunity => opportunity.id && opportunity.title)
    .map(opportunity => {
      const priority = getOpportunityPriorityBreakdown(opportunity);
      return {
        ...opportunity,
        priority: priority.score,
        priorityReasons: priority.reasons,
      };
    })
    .sort((a, b) => b.priority - a.priority);

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
