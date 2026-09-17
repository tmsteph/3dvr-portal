export const WORK_ITEM_STATES = Object.freeze([
  'queued', 'ready', 'running', 'waiting_human', 'waiting_external',
  'blocked', 'verifying', 'done', 'failed', 'cancelled'
]);

export const WORK_ITEM_RISKS = Object.freeze(['low', 'medium', 'high']);

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const cleanList = (value, max = 20) => [...new Set((Array.isArray(value) ? value : [])
  .map(item => clean(item, 160)).filter(Boolean))].slice(0, max);

function normalizePriority(value) {
  const priority = Number(value);
  return Number.isFinite(priority) ? Math.max(0, Math.min(100, Math.round(priority))) : 50;
}

function normalizeIdentityLease(value = null) {
  if (!value || typeof value !== 'object') return null;
  return {
    required: Boolean(value.required),
    lane: clean(value.lane, 80),
    account: clean(value.account, 160),
    purpose: clean(value.purpose, 300),
    riskClass: WORK_ITEM_RISKS.includes(value.riskClass) ? value.riskClass : 'medium',
    expiresAt: clean(value.expiresAt, 80)
  };
}

function normalizeHumanCheckpoint(value = null) {
  if (!value || typeof value !== 'object') return null;
  return {
    required: Boolean(value.required),
    reason: clean(value.reason, 300),
    requestedAt: clean(value.requestedAt, 80),
    resolvedAt: clean(value.resolvedAt, 80),
    resolution: clean(value.resolution, 500)
  };
}

export function normalizeWorkItem(record = {}, options = {}) {
  const now = clean(options.now || new Date().toISOString(), 80);
  const state = WORK_ITEM_STATES.includes(record.state) ? record.state : 'queued';
  const risk = WORK_ITEM_RISKS.includes(record.risk) ? record.risk : 'low';
  const id = clean(record.id || options.id, 160);
  const title = clean(record.title, 240);
  if (!id) throw new Error('Work item id is required.');
  if (!title) throw new Error('Work item title is required.');

  return {
    id,
    title,
    intent: clean(record.intent || title, 1200),
    domain: clean(record.domain || 'general', 100) || 'general',
    priority: normalizePriority(record.priority),
    state,
    risk,
    owner: clean(record.owner, 160),
    dependencies: cleanList(record.dependencies),
    requiredCapabilities: cleanList(record.requiredCapabilities),
    identityLease: normalizeIdentityLease(record.identityLease),
    humanCheckpoint: normalizeHumanCheckpoint(record.humanCheckpoint),
    createdAt: clean(record.createdAt || now, 80),
    updatedAt: clean(record.updatedAt || now, 80),
    evidence: Array.isArray(record.evidence) ? record.evidence.slice(0, 50) : [],
    result: record.result ?? null
  };
}

export function workItemNeedsHuman(item = {}) {
  return item.state === 'waiting_human' || Boolean(item.humanCheckpoint?.required && !item.humanCheckpoint?.resolvedAt);
}

export function workItemIsTerminal(item = {}) {
  return ['done', 'failed', 'cancelled'].includes(item.state);
}
