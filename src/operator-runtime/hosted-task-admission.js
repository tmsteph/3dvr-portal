const REPO = /^[a-zA-Z0-9_.-]{1,100}\/[a-zA-Z0-9_.-]{1,100}$/;
const KEY = /^[a-zA-Z0-9_-]{8,128}$/;
const MAX_ACTIVE = 2;

export function admitHostedTask({ tenantId, request, existing = [], limits = {} }) {
  if (typeof tenantId !== 'string' || !/^[a-zA-Z0-9:._-]{1,256}$/.test(tenantId)) {
    return { ok: false, reason: 'unauthenticated' };
  }
  if (!request || request.kind !== 'repo-status' || !REPO.test(request.repository || '') ||
      request.repository.includes('..') || !KEY.test(request.idempotencyKey || '')) {
    return { ok: false, reason: 'invalid_request' };
  }
  const owned = existing.filter(item => item.tenantId === tenantId);
  const prior = owned.find(item => item.idempotencyKey === request.idempotencyKey);
  if (prior) {
    if (prior.kind !== request.kind || prior.repository !== request.repository) {
      return { ok: false, reason: 'idempotency_conflict' };
    }
    return { ok: true, duplicate: true, task: prior };
  }
  const active = owned.filter(item => ['queued', 'running', 'waiting_approval'].includes(item.status)).length;
  const cap = Number.isSafeInteger(limits.maxActive) && limits.maxActive >= 0
    ? Math.min(limits.maxActive, MAX_ACTIVE) : MAX_ACTIVE;
  if (active >= cap) return { ok: false, reason: 'concurrency_limit' };
  // Missing, malformed, and exhausted budgets must not authorize new work.
  if (!Number.isSafeInteger(limits.remainingCents) || limits.remainingCents <= 0) {
    return { ok: false, reason: 'budget_exhausted' };
  }
  return { ok: true, duplicate: false, task: {
    tenantId, kind: 'repo-status', repository: request.repository,
    idempotencyKey: request.idempotencyKey, status: 'queued'
  } };
}

export function taskVisibleToTenant(task, tenantId) {
  return Boolean(task && typeof tenantId === 'string' && tenantId.length > 0 &&
    task.tenantId === tenantId);
}
