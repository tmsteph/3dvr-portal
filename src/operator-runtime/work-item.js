export const WORK_ITEM_STATES = Object.freeze([
  'queued',
  'ready',
  'running',
  'waiting_human',
  'waiting_external',
  'blocked',
  'verifying',
  'done',
  'failed',
  'cancelled'
]);

export const WORK_ITEM_RISKS = Object.freeze(['low', 'medium', 'high']);
export const WORK_ITEM_PRIORITIES = Object.freeze(['low', 'normal', 'high', 'urgent']);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function list(value) {
  return Array.isArray(value) ? [...new Set(value.map(text).filter(Boolean))] : [];
}

function requireValue(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new TypeError(`${label} must be one of: ${allowed.join(', ')}`);
  }
  return value;
}

function timestamp(value) {
  if (value) return value;
  return new Date().toISOString();
}

export function createWorkItem(input = {}) {
  const title = text(input.title);
  const domain = text(input.domain);
  if (!title) throw new TypeError('work item title is required');
  if (!domain) throw new TypeError('work item domain is required');

  const createdAt = timestamp(input.createdAt || input.now);
  const state = requireValue(input.state || 'queued', WORK_ITEM_STATES, 'state');
  const risk = requireValue(input.risk || 'low', WORK_ITEM_RISKS, 'risk');
  const priority = requireValue(input.priority || 'normal', WORK_ITEM_PRIORITIES, 'priority');
  const id = text(input.id) || `work-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    title,
    intent: text(input.intent) || title,
    domain,
    workflow: text(input.workflow) || null,
    priority,
    state,
    risk,
    owner: text(input.owner) || null,
    dependencies: list(input.dependencies),
    requiredCapabilities: list(input.requiredCapabilities),
    identityLease: input.identityLease || null,
    humanCheckpoint: input.humanCheckpoint || null,
    createdAt,
    updatedAt: timestamp(input.updatedAt || createdAt),
    evidence: Array.isArray(input.evidence) ? [...input.evidence] : [],
    result: input.result ?? null,
    metadata: input.metadata && typeof input.metadata === 'object' ? { ...input.metadata } : {}
  };
}

export function transitionWorkItem(item, nextState, patch = {}) {
  if (!item || typeof item !== 'object') throw new TypeError('work item is required');
  requireValue(nextState, WORK_ITEM_STATES, 'state');

  return {
    ...item,
    ...patch,
    id: item.id,
    createdAt: item.createdAt,
    state: nextState,
    updatedAt: timestamp(patch.updatedAt || patch.now),
    dependencies: patch.dependencies ? list(patch.dependencies) : [...(item.dependencies || [])],
    requiredCapabilities: patch.requiredCapabilities
      ? list(patch.requiredCapabilities)
      : [...(item.requiredCapabilities || [])],
    evidence: patch.evidence ? [...patch.evidence] : [...(item.evidence || [])],
    metadata: patch.metadata ? { ...(item.metadata || {}), ...patch.metadata } : { ...(item.metadata || {}) }
  };
}
