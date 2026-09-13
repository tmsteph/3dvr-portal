import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createWorkItem } from '../src/operator-runtime/work-item.js';
import {
  normalizeQueueRecordForWorkboard,
  queueRecordToWorkItem,
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
