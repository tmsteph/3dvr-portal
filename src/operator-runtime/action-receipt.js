export const ACTION_RECEIPT_STATUSES = Object.freeze([
  'queued',
  'running',
  'waiting',
  'blocked',
  'succeeded',
  'failed',
  'cancelled'
]);

export const ACTION_VERIFICATION_STATUSES = Object.freeze([
  'not_started',
  'pending',
  'verified',
  'failed',
  'unknown'
]);

function text(value, max = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function list(value) {
  return Array.isArray(value) ? value.slice(0, 50) : [];
}

function timestamp(value, fallback = '') {
  const normalized = text(value, 80);
  if (normalized) return normalized;
  return fallback || new Date().toISOString();
}

export function normalizeActionReceiptStatus(value = '') {
  const status = text(value, 80).toLowerCase();
  if (['completed', 'complete', 'done', 'succeeded', 'success'].includes(status)) return 'succeeded';
  if (['running', 'started', 'working', 'verifying'].includes(status)) return 'running';
  if (['review', 'waiting', 'waiting_human', 'waiting_external', 'approval_required'].includes(status)) return 'waiting';
  if (status === 'blocked') return 'blocked';
  if (['failed', 'failure', 'rejected', 'error'].includes(status)) return 'failed';
  if (['cancelled', 'canceled', 'skipped'].includes(status)) return 'cancelled';
  return 'queued';
}

export function normalizeActionVerificationStatus(value = '', actionStatus = 'queued') {
  const status = text(value, 80).toLowerCase();
  if (['verified', 'passed', 'pass'].includes(status)) return 'verified';
  if (['failed', 'failure', 'rejected'].includes(status)) return 'failed';
  if (['pending', 'verifying', 'in_progress'].includes(status)) return 'pending';
  if (status === 'unknown') return 'unknown';
  if (['not_started', 'unverified', 'none'].includes(status)) return 'not_started';
  return normalizeActionReceiptStatus(actionStatus) === 'succeeded' ? 'pending' : 'not_started';
}

function safeIdPart(value = '') {
  return text(value, 240)
    .replace(/[^a-z0-9._:-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180) || 'unknown';
}

export function createActionReceipt(input = {}) {
  const actionId = text(input.actionId || input.id, 240);
  if (!actionId) throw new TypeError('action receipt actionId is required');

  const status = normalizeActionReceiptStatus(input.status);
  const verificationStatus = normalizeActionVerificationStatus(input.verificationStatus, status);
  const createdAt = timestamp(input.createdAt || input.requestedAt);
  const updatedAt = timestamp(input.updatedAt, createdAt);
  const terminal = ['succeeded', 'failed', 'cancelled'].includes(status);

  return {
    id: text(input.receiptId, 240) || 'receipt-' + safeIdPart(input.kind || input.workflow || input.source) + '-' + safeIdPart(actionId),
    actionId,
    kind: text(input.kind, 80) || 'action',
    source: text(input.source, 120) || '3dvr',
    title: text(input.title, 240) || 'Operator action',
    intent: text(input.intent, 4000),
    domain: text(input.domain, 120) || 'operator',
    workflow: text(input.workflow, 160),
    status,
    terminal,
    verificationStatus,
    verified: status === 'succeeded' && verificationStatus === 'verified',
    actor: text(input.actor, 240),
    workerId: text(input.workerId, 240),
    workerLane: text(input.workerLane, 120),
    resultSummary: text(input.resultSummary, 2000),
    error: text(input.error, 2000),
    url: text(input.url, 1000),
    evidence: list(input.evidence),
    createdAt,
    startedAt: text(input.startedAt, 80),
    updatedAt,
    completedAt: terminal ? timestamp(input.completedAt, updatedAt) : text(input.completedAt, 80),
    metadata: input.metadata && typeof input.metadata === 'object' ? { ...input.metadata } : {}
  };
}

export function actionReceiptFromRuntimeRecord(record = {}, context = {}) {
  const actionId = text(context.actionId || record.id || record.requestId, 240);
  return createActionReceipt({
    actionId,
    kind: context.kind || record.kind,
    source: context.source || 'portal-operator',
    title: context.title || record.title || 'Operator action',
    intent: context.intent || record.intent || record.task || '',
    domain: context.domain || record.domain || 'operator',
    workflow: context.workflow || record.workflow || context.kind || '',
    status: record.status || record.state || record.runtimeState || context.status || 'queued',
    verificationStatus: record.verificationStatus || record.runtimeVerificationStatus || context.verificationStatus,
    actor: record.requestedBy || context.actor,
    workerId: record.workerDeviceId || context.workerId,
    workerLane: record.workerLane || context.workerLane,
    resultSummary: record.resultSummary || context.resultSummary,
    error: record.error || context.error,
    url: context.url || record.url,
    evidence: record.evidence || context.evidence || [],
    createdAt: record.createdAt || context.createdAt,
    startedAt: record.startedAt || context.startedAt,
    updatedAt: record.updatedAt || context.updatedAt,
    completedAt: record.completedAt || context.completedAt,
    metadata: {
      ...(context.metadata || {}),
      runtimeVersion: record.runtimeVersion || '',
      riskClass: record.riskClass || '',
      approvalStatus: record.approvalStatus || ''
    }
  });
}
