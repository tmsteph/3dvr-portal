import { createWorkItem } from './work-item.js';

export const AGENT_QUEUE_RUNTIME_VERSION = 'work-item-v1';

const STATE_TO_QUEUE_STATUS = Object.freeze({
  queued: 'queued',
  ready: 'queued',
  running: 'running',
  waiting_human: 'review',
  waiting_external: 'waiting',
  blocked: 'blocked',
  verifying: 'verifying',
  done: 'completed',
  failed: 'failed',
  cancelled: 'cancelled'
});

const QUEUE_STATUS_TO_STATE = Object.freeze({
  queued: 'queued',
  ready: 'ready',
  claimed: 'running',
  working: 'running',
  running: 'running',
  in_progress: 'running',
  review: 'waiting_human',
  waiting_human: 'waiting_human',
  waiting: 'waiting_external',
  waiting_external: 'waiting_external',
  blocked: 'blocked',
  verifying: 'verifying',
  completed: 'done',
  complete: 'done',
  done: 'done',
  success: 'done',
  succeeded: 'done',
  failed: 'failed',
  error: 'failed',
  skipped: 'blocked',
  cancelled: 'cancelled',
  canceled: 'cancelled'
});

function text(value, max = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function csv(value) {
  if (Array.isArray(value)) return value.map(item => text(item, 120)).filter(Boolean).join(',');
  return text(value, 1000);
}

function resultSummary(result) {
  if (typeof result === 'string') return text(result, 2000);
  if (result && typeof result === 'object') return text(result.summary || result.message || '', 2000);
  return '';
}

function checkpointStatus(checkpoint) {
  if (!checkpoint) return 'not_required';
  if (typeof checkpoint === 'string') return text(checkpoint, 80) || 'required';
  if (typeof checkpoint === 'object') return text(checkpoint.status, 80) || 'required';
  return 'required';
}

function riskClassFor(item, override) {
  if (override) return text(override, 80);
  if (item.risk === 'high') return 'external_write';
  if (item.risk === 'medium') return 'workspace_write';
  return 'draft';
}

export function queueStatusFromWorkItemState(state = 'queued') {
  return STATE_TO_QUEUE_STATUS[state] || 'queued';
}

export function workItemStateFromQueueRecord(record = {}) {
  const status = text(record.status, 80).toLowerCase().replace(/[\s-]+/g, '_');
  if (status && status !== 'queued') return QUEUE_STATUS_TO_STATE[status] || text(record.runtimeState, 80) || 'queued';
  return text(record.runtimeState, 80) || QUEUE_STATUS_TO_STATE[status] || 'queued';
}

export function workItemToAgentQueueRecord(input = {}, overrides = {}) {
  const item = createWorkItem(input);
  const workerLane = text(overrides.workerLane || item.metadata?.workerLane || item.identityLease?.lane, 120);
  const verificationStatus = text(
    overrides.verificationStatus || item.metadata?.verificationStatus || (item.state === 'verifying' ? 'pending' : ''),
    80
  ) || 'not_started';
  const humanCheckpointStatus = text(overrides.humanCheckpointStatus, 80) || checkpointStatus(item.humanCheckpoint);
  const capabilities = csv(overrides.requiredCapabilities ?? item.requiredCapabilities);
  const now = text(overrides.updatedAt, 80) || item.updatedAt;

  return {
    id: item.id,
    task: text(overrides.task, 8000) || item.intent,
    tenantId: text(overrides.tenantId, 200) || 'portal:operator',
    tenantAlias: text(overrides.tenantAlias, 200) || 'portal-operator',
    tenantPlan: text(overrides.tenantPlan, 80) || 'builder',
    backend: text(overrides.backend, 80) || 'auto',
    repo: text(overrides.repo, 200),
    model: text(overrides.model, 120),
    thinking: text(overrides.thinking, 80),
    unsafe: Boolean(overrides.unsafe),
    riskClass: riskClassFor(item, overrides.riskClass),
    approvalStatus: text(overrides.approvalStatus, 80) || (humanCheckpointStatus === 'not_required' ? 'not_required' : 'required'),
    requiredCapabilities: capabilities,
    maxRuntimeMs: Number.isFinite(overrides.maxRuntimeMs) ? overrides.maxRuntimeMs : 0,
    status: text(overrides.status, 80) || queueStatusFromWorkItemState(item.state),
    requestedBy: text(overrides.requestedBy, 120) || 'operator-runtime',
    createdAt: item.createdAt,
    updatedAt: now,
    resultSummary: text(overrides.resultSummary, 2000) || resultSummary(item.result),
    error: text(overrides.error, 2000),
    workerDeviceId: text(overrides.workerDeviceId, 200),
    runtimeVersion: AGENT_QUEUE_RUNTIME_VERSION,
    runtimeWorkItemJson: JSON.stringify(item),
    runtimeState: item.state,
    runtimeDomain: item.domain,
    runtimeWorkflow: item.workflow || '',
    runtimeOwner: item.owner || '',
    runtimePriority: item.priority,
    runtimeRisk: item.risk,
    workerLane,
    verificationStatus,
    humanCheckpointStatus,
    evidenceCount: item.evidence.length
  };
}

export function workItemToQueueSummary(record = {}) {
  return {
    id: text(record.id, 240),
    status: text(record.status, 80),
    task: text(record.task, 8000),
    tenantId: text(record.tenantId, 200),
    tenantAlias: text(record.tenantAlias, 200),
    tenantPlan: text(record.tenantPlan, 80),
    riskClass: text(record.riskClass, 80),
    approvalStatus: text(record.approvalStatus, 80),
    requiredCapabilities: text(record.requiredCapabilities, 1000),
    updatedAt: text(record.updatedAt, 80),
    runtimeVersion: text(record.runtimeVersion, 80),
    runtimeState: text(record.runtimeState, 80),
    runtimeDomain: text(record.runtimeDomain, 120),
    runtimeWorkflow: text(record.runtimeWorkflow, 160),
    runtimeOwner: text(record.runtimeOwner, 120),
    runtimePriority: text(record.runtimePriority, 80),
    runtimeRisk: text(record.runtimeRisk, 80),
    workerLane: text(record.workerLane, 120),
    verificationStatus: text(record.verificationStatus, 80),
    humanCheckpointStatus: text(record.humanCheckpointStatus, 80),
    evidenceCount: Number.parseInt(record.evidenceCount || 0, 10) || 0,
    workerDeviceId: text(record.workerDeviceId, 200),
    resultSummary: text(record.resultSummary, 2000),
    error: text(record.error, 2000)
  };
}

export function queueRecordToWorkItem(record = {}) {
  let parsed = null;
  if (record.runtimeWorkItemJson) {
    try {
      parsed = JSON.parse(record.runtimeWorkItemJson);
    } catch (_error) {
      parsed = null;
    }
  }

  const source = parsed || {
    id: record.id,
    title: text(record.title, 240) || text(record.task, 160) || 'Agent task',
    intent: text(record.task, 8000) || 'Agent task',
    domain: text(record.runtimeDomain, 120) || 'agent',
    workflow: text(record.runtimeWorkflow, 160) || null,
    priority: text(record.runtimePriority, 80) || 'normal',
    state: workItemStateFromQueueRecord(record),
    risk: text(record.runtimeRisk, 80) || 'low',
    owner: text(record.runtimeOwner, 120) || text(record.requestedBy, 120) || null,
    requiredCapabilities: csv(record.requiredCapabilities).split(',').filter(Boolean),
    createdAt: record.createdAt || record.updatedAt,
    updatedAt: record.updatedAt,
    evidence: [],
    result: record.resultSummary || null,
    metadata: {}
  };

  return createWorkItem({
    ...source,
    id: text(record.id, 240) || source.id,
    state: workItemStateFromQueueRecord(record),
    updatedAt: text(record.updatedAt, 80) || source.updatedAt,
    result: record.resultSummary || source.result || null,
    metadata: {
      ...(source.metadata || {}),
      queueStatus: text(record.status, 80),
      workerLane: text(record.workerLane, 120) || source.metadata?.workerLane || '',
      verificationStatus: text(record.verificationStatus, 80) || source.metadata?.verificationStatus || 'not_started',
      humanCheckpointStatus: text(record.humanCheckpointStatus, 80) || source.metadata?.humanCheckpointStatus || 'not_required',
      evidenceCount: Number.parseInt(record.evidenceCount || source.evidence?.length || 0, 10) || 0,
      workerDeviceId: text(record.workerDeviceId, 200)
    }
  });
}

export function normalizeQueueRecordForWorkboard(record = {}) {
  const item = queueRecordToWorkItem(record);
  return {
    ...record,
    title: item.title,
    task: item.intent,
    status: item.state,
    owner: item.owner || text(record.tenantAlias, 120) || 'unassigned',
    domain: item.domain,
    workflow: item.workflow || '',
    priority: item.priority,
    risk: item.risk,
    workerLane: item.metadata?.workerLane || '',
    verificationStatus: item.metadata?.verificationStatus || 'not_started',
    humanCheckpointStatus: item.metadata?.humanCheckpointStatus || 'not_required',
    evidenceCount: item.metadata?.evidenceCount || item.evidence.length,
    workerDeviceId: item.metadata?.workerDeviceId || text(record.workerDeviceId, 200),
    runtimeVersion: text(record.runtimeVersion, 80),
    updatedAt: item.updatedAt,
    createdAt: item.createdAt,
    resultSummary: text(record.resultSummary, 2000) || resultSummary(item.result)
  };
}
