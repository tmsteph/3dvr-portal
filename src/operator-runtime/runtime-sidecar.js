import { createWorkItem } from './work-item.js';
import { AGENT_QUEUE_RUNTIME_VERSION } from './task-queue-adapter.js';

function text(value, max = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function checkpointStatus(checkpoint) {
  if (!checkpoint) return 'not_required';
  if (typeof checkpoint === 'string') return text(checkpoint, 80) || 'required';
  if (typeof checkpoint === 'object') return text(checkpoint.status, 80) || 'required';
  return 'required';
}

export function workItemToRuntimeSidecar(input = {}, overrides = {}) {
  const item = createWorkItem(input);
  const workerLane = text(overrides.workerLane || item.metadata?.workerLane || item.identityLease?.lane, 120);
  const verificationStatus = text(
    overrides.verificationStatus || item.metadata?.verificationStatus || (item.state === 'verifying' ? 'pending' : ''),
    80
  ) || 'not_started';
  const humanCheckpointStatus = text(overrides.humanCheckpointStatus, 80) || checkpointStatus(item.humanCheckpoint);

  return {
    id: item.id,
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
    evidenceCount: item.evidence.length,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

export function mergeQueueRuntimeRecord(queueRecord = {}, runtimeRecord = {}) {
  if (!runtimeRecord || typeof runtimeRecord !== 'object') return { ...queueRecord };
  // A sidecar for another task cannot supply workflow, evidence, or CRM context
  // for this queue item. Preserve legacy records with a missing identity.
  const queueId = text(queueRecord.id, 240);
  const runtimeId = text(runtimeRecord.id, 240);
  if (queueId && runtimeId && queueId !== runtimeId) return { ...queueRecord };
  // The sidecar supplies runtime presentation context, not worker policy.
  // Never let extra sidecar keys replace tenant, approval, capabilities,
  // risk class, request owner or other authoritative queue fields.
  const runtimeFields = [
    'runtimeVersion', 'runtimeWorkItemJson', 'runtimeState', 'runtimeDomain',
    'runtimeWorkflow', 'runtimeOwner', 'runtimePriority', 'runtimeRisk',
    'workerLane', 'verificationStatus', 'humanCheckpointStatus',
    'evidenceCount', 'createdAt'
  ];
  const runtimeContext = Object.fromEntries(runtimeFields
    .filter(key => Object.hasOwn(runtimeRecord, key))
    .map(key => [key, runtimeRecord[key]]));
  return {
    ...queueRecord,
    ...runtimeContext,
    id: text(queueRecord.id, 240) || text(runtimeRecord.id, 240),
    // Only the worker queue's own status is authoritative. A partial latest
    // record with no status must not inherit stale sidecar success or payment.
    status: text(queueRecord.status, 80) || 'blocked',
    task: text(queueRecord.task, 8000) || '',
    updatedAt: text(queueRecord.updatedAt, 80) || text(runtimeRecord.updatedAt, 80),
    resultSummary: text(queueRecord.resultSummary, 2000),
    error: text(queueRecord.error, 2000),
    workerDeviceId: text(queueRecord.workerDeviceId, 200)
  };
}
