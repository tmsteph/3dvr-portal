import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeWorkItem,
  workItemIsTerminal,
  workItemNeedsHuman
} from '../src/operator-runtime/work-item.js';
import {
  normalizeWorker,
  workerCanRun,
  workerIsStale
} from '../src/operator-runtime/worker-registry.js';

const NOW = '2026-09-17T18:00:00.000Z';

test('work items normalize into one durable queue contract', () => {
  const item = normalizeWorkItem({
    id: 'booking-1',
    title: 'Sync Lighthouse booking to IATSE',
    domain: 'work',
    priority: 120,
    state: 'waiting_human',
    requiredCapabilities: ['lighthouse', 'iatse', 'iatse'],
    humanCheckpoint: { required: true, reason: 'Captcha' }
  }, { now: NOW });

  assert.equal(item.priority, 100);
  assert.deepEqual(item.requiredCapabilities, ['lighthouse', 'iatse']);
  assert.equal(item.createdAt, NOW);
  assert.equal(workItemNeedsHuman(item), true);
  assert.equal(workItemIsTerminal(item), false);
});

test('identity work only routes to a capable identity worker', () => {
  const item = normalizeWorkItem({
    id: 'encore-1',
    title: 'Request Encore time off',
    risk: 'high',
    requiredCapabilities: ['encore'],
    identityLease: { required: true, lane: 'identity', account: 'encore' }
  }, { now: NOW });

  const actionWorker = normalizeWorker({
    id: 'action-1', executionClass: 'action', capabilities: ['encore']
  }, { now: NOW });
  const identityWorker = normalizeWorker({
    id: 'identity-1', executionClass: 'identity', capabilities: ['encore'],
    resourceBudget: { maxConcurrentTasks: 1 }
  }, { now: NOW });

  assert.equal(workerCanRun(actionWorker, item), false);
  assert.equal(workerCanRun(identityWorker, item), true);
});

test('workers stop accepting work when saturated, unhealthy, or stale', () => {
  const item = normalizeWorkItem({ id: 'task-1', title: 'Inspect schedule' }, { now: NOW });
  const worker = normalizeWorker({
    id: 'reader-1',
    capabilities: [],
    currentWorkItemIds: ['existing'],
    resourceBudget: { maxConcurrentTasks: 1 },
    health: { state: 'running', lastHeartbeatAt: '2026-09-17T17:00:00.000Z' }
  }, { now: NOW });

  assert.equal(workerCanRun(worker, item), false);
  assert.equal(workerIsStale(worker, { now: Date.parse(NOW), staleAfterMs: 5 * 60_000 }), true);
});
