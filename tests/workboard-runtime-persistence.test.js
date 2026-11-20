import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createWorkItem } from '../src/operator-runtime/work-item.js';
import {
  normalizeQueueRecordForWorkboard,
  queueRecordToWorkItem,
  workItemStateFromQueueRecord,
  workItemToAgentQueueRecord,
  workItemToQueueSummary
} from '../src/operator-runtime/task-queue-adapter.js';
import {
  mergeQueueRuntimeRecord,
  workItemToRuntimeSidecar
} from '../src/operator-runtime/runtime-sidecar.js';

const NOW = '2026-09-12T20:00:00.000Z';

function sampleWorkItem() {
  return createWorkItem({
    id: 'work-runtime-1',
    title: 'Qualify Acme lead',
    intent: 'Confirm fit and the next useful action for Acme.',
    domain: 'revenue',
    workflow: 'lead-to-sale',
    state: 'queued',
    risk: 'low',
    owner: 'sales',
    requiredCapabilities: ['crm-read'],
    createdAt: NOW,
    updatedAt: NOW,
    evidence: [{ type: 'crm', id: 'lead-1' }],
    metadata: {
      workerLane: 'read-1',
      verificationStatus: 'pending'
    }
  });
}

test('shared work item serializes into the existing Agent Ops worker contract', () => {
  const item = sampleWorkItem();
  const record = workItemToAgentQueueRecord(item, {
    backend: 'codex',
    requiredCapabilities: 'crm-read,codex',
    tenantId: 'portal:operator',
    tenantAlias: 'tester'
  });
  const summary = workItemToQueueSummary(record);

  assert.equal(record.id, item.id);
  assert.equal(record.status, 'queued');
  assert.equal(record.backend, 'codex');
  assert.equal(record.requiredCapabilities, 'crm-read,codex');
  assert.equal(record.runtimeWorkflow, 'lead-to-sale');
  assert.equal(record.runtimeOwner, 'sales');
  assert.equal(record.evidenceCount, 1);
  assert.equal(summary.runtimeWorkflow, 'lead-to-sale');
  assert.equal(summary.runtimeState, 'queued');
});

test('runtime sidecar survives worker queue normalization and restores Workboard context', () => {
  const item = sampleWorkItem();
  const initial = workItemToAgentQueueRecord(item, { backend: 'codex' });
  const sidecar = workItemToRuntimeSidecar(item);

  const workerLatest = {
    id: item.id,
    status: 'running',
    task: initial.task,
    tenantId: initial.tenantId,
    tenantAlias: initial.tenantAlias,
    riskClass: initial.riskClass,
    approvalStatus: initial.approvalStatus,
    requiredCapabilities: initial.requiredCapabilities,
    workerDeviceId: 'worker-ovh-1',
    updatedAt: '2026-09-12T20:05:00.000Z'
  };

  const merged = mergeQueueRuntimeRecord(workerLatest, sidecar);
  const workItem = queueRecordToWorkItem(merged);
  const display = normalizeQueueRecordForWorkboard(merged);

  assert.equal(workItem.state, 'running');
  assert.equal(workItem.workflow, 'lead-to-sale');
  assert.equal(workItem.owner, 'sales');
  assert.equal(display.workflow, 'lead-to-sale');
  assert.equal(display.workerLane, 'read-1');
  assert.equal(display.workerDeviceId, 'worker-ovh-1');
  assert.equal(display.verificationStatus, 'pending');
  assert.equal(display.evidenceCount, 1);
});


test('queued worker record cannot inherit a stale completed or failed runtime state', () => {
  const base = sampleWorkItem();
  for (const staleState of ['running', 'verifying', 'done', 'failed', 'cancelled']) {
    const staleSidecar = workItemToRuntimeSidecar({ ...base, state: staleState });
    const merged = mergeQueueRuntimeRecord({
      id: base.id,
      task: base.intent,
      status: 'queued',
      updatedAt: '2026-09-12T21:00:00.000Z'
    }, staleSidecar);
    assert.equal(queueRecordToWorkItem(merged).state, 'queued', staleState);
    assert.equal(normalizeQueueRecordForWorkboard(merged).status, 'queued', staleState);
  }

  // A new ready work item intentionally serializes to a queued worker record.
  // Keep that distinction, but never let a stale terminal sidecar override it.
  const ready = workItemToAgentQueueRecord({ ...base, state: 'ready' });
  assert.equal(queueRecordToWorkItem(ready).state, 'ready');
  assert.equal(normalizeQueueRecordForWorkboard(ready).status, 'ready');
});

test('a queued retry cannot display a stale paid result from an earlier attempt', () => {
  const lead = sampleWorkItem();
  const completed = workItemToRuntimeSidecar({
    ...lead,
    state: 'done',
    result: { summary: 'Paid invoice from an earlier attempt' }
  });
  // Both a finished sidecar and a leftover worker result can survive a retry.
  const queued = mergeQueueRuntimeRecord({
    id: lead.id,
    task: lead.intent,
    status: 'queued',
    resultSummary: 'Old paid invoice',
    updatedAt: '2026-09-12T21:00:00.000Z'
  }, completed);

  assert.equal(queueRecordToWorkItem(queued).state, 'queued');
  assert.equal(queueRecordToWorkItem(queued).result, null);
  assert.equal(normalizeQueueRecordForWorkboard(queued).resultSummary, '');

  const ready = { ...queued, status: 'ready' };
  assert.equal(queueRecordToWorkItem(ready).result, null);
  assert.equal(normalizeQueueRecordForWorkboard(ready).resultSummary, '');

  // Do not discard a result when the authoritative worker reports completion.
  const finished = { ...queued, status: 'completed', resultSummary: 'Worker confirmed completion' };
  assert.equal(queueRecordToWorkItem(finished).result, 'Worker confirmed completion');
  assert.equal(normalizeQueueRecordForWorkboard(finished).resultSummary, 'Worker confirmed completion');
});

test('queued retry hides old worker attribution until a new worker claims the task', () => {
  const lead = sampleWorkItem();
  const stale = workItemToRuntimeSidecar({
    ...lead, state: 'done', metadata: { workerLane: 'revenue-worker' }
  });
  const queued = mergeQueueRuntimeRecord({
    id: lead.id,
    task: lead.intent,
    status: 'queued',
    workerDeviceId: 'worker-from-prior-attempt',
    updatedAt: '2026-09-12T21:10:00.000Z'
  }, stale);

  assert.equal(queueRecordToWorkItem(queued).state, 'queued');
  assert.equal(queueRecordToWorkItem(queued).metadata.workerDeviceId, '');
  assert.equal(normalizeQueueRecordForWorkboard(queued).workerDeviceId, '',
    'the unclaimed retry must not display the old worker');

  const ready = { ...queued, runtimeState: 'ready' };
  assert.equal(queueRecordToWorkItem(ready).state, 'ready');
  assert.equal(normalizeQueueRecordForWorkboard(ready).workerDeviceId, '');

  // Once the queue actually reports an active/terminal attempt, its own
  // worker ID remains useful attribution. Never use the sidecar as an ID.
  const claimed = { ...queued, status: 'running', workerDeviceId: 'worker-current' };
  assert.equal(normalizeQueueRecordForWorkboard(claimed).workerDeviceId, 'worker-current');
  const completed = { ...claimed, status: 'completed' };
  assert.equal(normalizeQueueRecordForWorkboard(completed).workerDeviceId, 'worker-current');
});

test('non-completed worker states cannot display old successful or paid results', () => {
  const lead = sampleWorkItem();
  const oldSuccess = workItemToRuntimeSidecar({
    ...lead,
    state: 'done',
    result: { summary: 'Payment succeeded on an earlier attempt' }
  });
  for (const status of [
    'queued', 'ready', 'running', 'claimed', 'verifying', 'review',
    'waiting', 'blocked', 'failed', 'cancelled', 'unknown-worker-status'
  ]) {
    // A retry may be claimed or even failed before stale metadata is removed.
    const merged = mergeQueueRuntimeRecord({
      id: lead.id, task: lead.intent, status,
      resultSummary: 'Old invoice paid',
      error: status === 'failed' ? 'Worker retry failed' : '',
      updatedAt: '2026-09-12T21:30:00.000Z'
    }, oldSuccess);
    const item = queueRecordToWorkItem(merged);
    const display = normalizeQueueRecordForWorkboard(merged);
    assert.equal(item.result, null, status);
    assert.equal(display.resultSummary, '', status);
    if (status === 'failed') assert.equal(display.error, 'Worker retry failed');
  }
  // Worker completion is the only state that may display its successful result.
  const confirmed = mergeQueueRuntimeRecord({
    id: lead.id, task: lead.intent, status: 'completed',
    resultSummary: 'New worker completion',
    updatedAt: '2026-09-12T21:40:00.000Z'
  }, oldSuccess);
  assert.equal(queueRecordToWorkItem(confirmed).result, 'New worker completion');
  assert.equal(normalizeQueueRecordForWorkboard(confirmed).resultSummary, 'New worker completion');
});

test('completed worker record without a current result cannot revive a previous paid sidecar', () => {
  const lead = sampleWorkItem();
  const oldSidecar = workItemToRuntimeSidecar({
    ...lead,
    state: 'done',
    result: { summary: 'Earlier paid invoice that does not belong to this completion' }
  });

  // Worker finished the current attempt but supplied no result summary. The
  // stale sidecar is still joined; it is not evidence of this completion.
  const current = mergeQueueRuntimeRecord({
    id: lead.id, task: lead.intent, status: 'completed',
    resultSummary: '',
    updatedAt: '2026-09-12T22:00:00.000Z'
  }, oldSidecar);
  assert.equal(queueRecordToWorkItem(current).state, 'done');
  assert.equal(queueRecordToWorkItem(current).result, null);
  assert.equal(normalizeQueueRecordForWorkboard(current).resultSummary, '');

  // A new summary recorded by the actual queue still surfaces normally.
  const withWorkerReceipt = { ...current, resultSummary: 'Current worker result' };
  assert.equal(queueRecordToWorkItem(withWorkerReceipt).result, 'Current worker result');
  assert.equal(normalizeQueueRecordForWorkboard(withWorkerReceipt).resultSummary, 'Current worker result');
});

test('unknown worker status cannot inherit stale successful runtime sidecar', () => {
  const work = sampleWorkItem();
  const completedSidecar = workItemToRuntimeSidecar({ ...work, state: 'done' });
  const unknownQueue = mergeQueueRuntimeRecord({
    id: work.id,
    task: work.intent,
    status: 'worker-status-not-recognized',
    updatedAt: '2026-09-12T21:00:00.000Z'
  }, completedSidecar);

  assert.equal(workItemStateFromQueueRecord(unknownQueue), 'blocked');
  assert.equal(queueRecordToWorkItem(unknownQueue).state, 'blocked');
  assert.equal(normalizeQueueRecordForWorkboard(unknownQueue).status, 'blocked');
  // A missing queue status is also not a completion receipt.
  assert.equal(workItemStateFromQueueRecord({ runtimeState: 'done' }), 'blocked');
});

test('partial worker latest without status cannot inherit stale sidecar success', () => {
  const lead = sampleWorkItem();
  const paidSidecar = workItemToRuntimeSidecar({
    ...lead, state: 'done', result: { summary: 'Prior invoice paid' },
    metadata: { stage: 'won' }
  });
  const merged = mergeQueueRuntimeRecord({
    id: lead.id, task: lead.intent, updatedAt: '2026-09-12T22:15:00.000Z',
    resultSummary: 'Prior invoice paid'
    // status deliberately missing: no authoritative queue completion
  }, paidSidecar);
  assert.equal(merged.status, 'blocked');
  assert.equal(queueRecordToWorkItem(merged).state, 'blocked');
  assert.equal(queueRecordToWorkItem(merged).result, null);
  const shown = normalizeQueueRecordForWorkboard(merged);
  assert.equal(shown.status, 'blocked');
  assert.equal(shown.resultSummary, '');

  // A real queue terminal event remains sufficient for status display.
  const confirmed = mergeQueueRuntimeRecord({
    id: lead.id, task: lead.intent, status: 'completed',
    resultSummary: 'Current worker completed', updatedAt: '2026-09-12T22:16:00.000Z'
  }, paidSidecar);
  assert.equal(queueRecordToWorkItem(confirmed).state, 'done');
  assert.equal(normalizeQueueRecordForWorkboard(confirmed).resultSummary, 'Current worker completed');
});

test('runtime sidecar with a different task ID cannot contaminate CRM work attribution', () => {
  const current = sampleWorkItem();
  const foreign = createWorkItem({
    ...current,
    id: 'work-runtime-foreign',
    title: 'Foreign paid prospect',
    owner: 'other-sales',
    state: 'done',
    evidence: [{ id: 'foreign-payment', type: 'provider_payment' }],
    metadata: { stage: 'won', workerLane: 'other-lane' }
  });
  const queueLatest = {
    id: current.id,
    task: current.intent,
    status: 'queued',
    updatedAt: '2026-09-12T21:00:00.000Z'
  };

  const merged = mergeQueueRuntimeRecord(queueLatest, workItemToRuntimeSidecar(foreign));
  assert.deepEqual(merged, queueLatest, 'a foreign sidecar must be ignored completely');

  const display = normalizeQueueRecordForWorkboard(merged);
  assert.equal(display.status, 'queued');
  assert.equal(display.task, current.intent);
  assert.equal(display.evidenceCount, 0);
  assert.notEqual(display.owner, 'other-sales');
  assert.notEqual(display.workerLane, 'other-lane');
});

test('nested work-item JSON cannot attribute another prospect to a queue task', () => {
  const current = sampleWorkItem();
  const foreign = createWorkItem({
    id: 'work-runtime-foreign-paid',
    title: 'Foreign prospect marked paid',
    domain: 'revenue',
    state: 'done',
    owner: 'other-sales',
    metadata: { stage: 'won', paymentStatus: 'paid' },
    evidence: [{ type: 'payment', id: 'not-this-lead' }],
    createdAt: NOW,
    updatedAt: NOW
  });
  const disguisedSidecar = {
    ...workItemToRuntimeSidecar(current),
    // Outer task ID matches, but its embedded work item belongs to someone else.
    runtimeWorkItemJson: JSON.stringify(foreign)
  };
  const merged = mergeQueueRuntimeRecord({
    id: current.id,
    task: current.intent,
    status: 'queued',
    updatedAt: '2026-09-12T21:00:00.000Z'
  }, disguisedSidecar);
  const restored = queueRecordToWorkItem(merged);
  const display = normalizeQueueRecordForWorkboard(merged);

  assert.equal(restored.id, current.id);
  assert.equal(restored.state, 'queued');
  assert.equal(restored.owner, 'sales', 'use the matching envelope owner, not foreign JSON');
  assert.notEqual(restored.title, foreign.title);
  assert.notEqual(restored.metadata.stage, 'won');
  assert.notEqual(restored.metadata.paymentStatus, 'paid');
  assert.equal(display.status, 'queued');
  assert.notEqual(display.title, foreign.title);
  assert.notEqual(display.owner, 'other-sales');
});

test('active retry cannot inherit a completed sidecar payment stage or evidence', () => {
  const current = sampleWorkItem();
  const previousCompletion = workItemToRuntimeSidecar({
    ...current,
    state: 'done',
    evidence: [{ type: 'provider_payment', id: 'prior-payment' }],
    metadata: { stage: 'won', paymentStatus: 'paid', lastEvent: 'payment_received' },
    result: 'Earlier invoice paid'
  });
  for (const status of ['queued', 'running', 'claimed', 'verifying', 'blocked']) {
    const record = mergeQueueRuntimeRecord({
      id: current.id,
      task: current.intent,
      status,
      evidenceCount: 1,
      updatedAt: '2026-09-12T23:00:00.000Z'
    }, previousCompletion);
    const item = queueRecordToWorkItem(record);
    const display = normalizeQueueRecordForWorkboard(record);
    assert.equal(item.state === 'done', false, status);
    assert.deepEqual(item.evidence, [], status);
    assert.equal(item.metadata.stage, undefined, status);
    assert.equal(item.metadata.paymentStatus, undefined, status);
    assert.equal(item.metadata.lastEvent, undefined, status);
    assert.equal(item.metadata.evidenceCount, 0, status);
    assert.equal(display.evidenceCount, 0, status);
  }
  const completed = mergeQueueRuntimeRecord({
    id: current.id, task: current.intent, status: 'completed',
    evidenceCount: 1, resultSummary: 'Current worker completed'
  }, previousCompletion);
  assert.equal(queueRecordToWorkItem(completed).metadata.stage, 'won',
    'terminal sidecar details remain inspectable for completed work, but are not payment verification');
  assert.equal(normalizeQueueRecordForWorkboard(completed).evidenceCount, 1);
});

test('human checkpoints remain visible through the sidecar', () => {
  const item = createWorkItem({
    id: 'work-known-contact',
    title: 'Reply to known contact',
    domain: 'revenue',
    workflow: 'lead-to-sale',
    state: 'waiting_human',
    risk: 'medium',
    owner: 'sales',
    humanCheckpoint: { status: 'required', reason: 'Known contact send' },
    createdAt: NOW,
    updatedAt: NOW
  });
  const record = workItemToAgentQueueRecord(item, { status: 'review' });
  const runtime = workItemToRuntimeSidecar(item);
  const display = normalizeQueueRecordForWorkboard(mergeQueueRuntimeRecord(record, runtime));

  assert.equal(display.status, 'waiting_human');
  assert.equal(display.humanCheckpointStatus, 'required');
});

test('queue approval gate overrides stale human-checkpoint sidecars', () => {
  const lead = sampleWorkItem();
  const staleNotRequired = workItemToRuntimeSidecar(lead, {
    humanCheckpointStatus: 'not_required'
  });
  const review = mergeQueueRuntimeRecord({
    id: lead.id, task: lead.intent, status: 'review',
    approvalStatus: 'required',
    updatedAt: '2026-09-12T23:20:00.000Z'
  }, staleNotRequired);
  assert.equal(queueRecordToWorkItem(review).metadata.humanCheckpointStatus, 'required');
  assert.equal(normalizeQueueRecordForWorkboard(review).humanCheckpointStatus, 'required',
    'required queue approval cannot disappear behind a stale not_required sidecar');

  const staleRequired = workItemToRuntimeSidecar({
    ...lead, humanCheckpoint: { status: 'required' }
  });
  const approved = mergeQueueRuntimeRecord({
    id: lead.id, task: lead.intent, status: 'running',
    approvalStatus: 'approved',
    updatedAt: '2026-09-12T23:21:00.000Z'
  }, staleRequired);
  assert.equal(normalizeQueueRecordForWorkboard(approved).humanCheckpointStatus, 'approved',
    'the current queue approval display should not be overridden by an older checkpoint');
});

test('Workboard and Operator use the shared runtime persistence bridge', async () => {
  const [workboard, template, operatorQueue, docs] = await Promise.all([
    readFile(new URL('../workboard/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../workboard/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../operator/agent-edit-queue.js', import.meta.url), 'utf8'),
    readFile(new URL('../docs/operator-business-system.md', import.meta.url), 'utf8')
  ]);

  assert.match(workboard, /get\('agentOps'\).*get\(AGENT_OWNER_ALIAS\).*get\('taskQueue'\)/s);
  assert.match(workboard, /get\('runtime'\)\.map\(\)\.on/);
  assert.match(workboard, /mergeQueueRuntimeRecord/);
  assert.match(workboard, /normalizeQueueRecordForWorkboard/);
  assert.match(template, /class="runtime-meta"/);
  assert.match(operatorQueue, /workItemToRuntimeSidecar/);
  assert.match(operatorQueue, /taskQueue\.get\('runtime'\)\.get\(id\)/);
  assert.match(docs, /Phase 1 — persist and see shared work/);
  assert.match(docs, /compatibility bridge, not the final private store/);
});
