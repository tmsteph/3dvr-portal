import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkItem, transitionWorkItem } from '../src/operator-runtime/work-item.js';
import { createWorker, findEligibleWorkers } from '../src/operator-runtime/worker-registry.js';
import {
  BUSINESS_ROLES,
  advanceRevenueLead,
  createRevenueLeadWorkItem,
  getOutboundDecision,
  revenueStage
} from '../src/operator-runtime/revenue-workflow.js';

test('work item implements the shared operator contract', () => {
  const item = createWorkItem({
    id: 'work-1',
    title: 'Qualify ACME',
    domain: 'revenue',
    state: 'ready',
    risk: 'medium',
    priority: 'high',
    requiredCapabilities: ['crm-read', 'web-research', 'crm-read'],
    now: '2026-09-12T18:00:00.000Z'
  });

  assert.equal(item.id, 'work-1');
  assert.equal(item.intent, 'Qualify ACME');
  assert.equal(item.state, 'ready');
  assert.deepEqual(item.requiredCapabilities, ['crm-read', 'web-research']);
  assert.deepEqual(item.evidence, []);
  assert.equal(item.kernelPolicy.positiveSumEligible, true);
  assert.equal(item.createdAt, '2026-09-12T18:00:00.000Z');

  const running = transitionWorkItem(item, 'running', { now: '2026-09-12T18:01:00.000Z' });
  assert.equal(running.state, 'running');
  assert.equal(running.createdAt, item.createdAt);
  assert.equal(running.updatedAt, '2026-09-12T18:01:00.000Z');
  assert.equal(running.kernelPolicy.positiveSumEligible, true);
});

test('worker registry selects only workers with capacity and capabilities', () => {
  const item = createWorkItem({
    id: 'work-2',
    title: 'Research lead',
    domain: 'revenue',
    state: 'ready',
    requiredCapabilities: ['crm-read', 'web-research'],
    now: '2026-09-12T18:00:00.000Z'
  });

  const workers = [
    createWorker({ id: 'research-1', name: 'Research 1', class: 'read', capabilities: ['crm-read', 'web-research'] }),
    createWorker({ id: 'sales-1', name: 'Sales 1', class: 'action', capabilities: ['crm-read', 'email-send'] }),
    createWorker({ id: 'busy-1', name: 'Busy', class: 'read', capabilities: ['crm-read', 'web-research'], activeCount: 1, maxConcurrent: 1 })
  ];

  assert.deepEqual(findEligibleWorkers(workers, item).map(worker => worker.id), ['research-1']);
});

test('worker registry refuses only explicitly blocked kernel-policy work', () => {
  const worker = createWorker({
    id: 'action-1',
    name: 'Action 1',
    class: 'action',
    capabilities: ['project-update']
  });
  const ordinary = createWorkItem({
    id: 'work-safe',
    title: 'Update project notes',
    domain: 'projects',
    state: 'ready',
    requiredCapabilities: ['project-update']
  });
  const blocked = createWorkItem({
    id: 'work-blocked',
    title: 'Exploit users with a coercive flow',
    domain: 'projects',
    state: 'ready',
    requiredCapabilities: ['project-update'],
    positiveSum: {
      agencyScore: 10,
      sharedValueScore: 5,
      opennessScore: 5,
      harmRiskScore: 90,
      lockInRiskScore: 100
    }
  });

  assert.deepEqual(findEligibleWorkers([worker], ordinary).map(item => item.id), ['action-1']);
  assert.equal(blocked.kernelPolicy.positiveSumEligible, false);
  assert.deepEqual(blocked.kernelPolicy.blockedReasons, ['harm-risk', 'agency-loss', 'extreme-lock-in']);
  assert.deepEqual(findEligibleWorkers([worker], blocked), []);
});

test('fresh email can run in business hours while known or late sends pause', () => {
  assert.equal(getOutboundDecision({ relationship: 'fresh', channel: 'email', localHour: 10 }).decision, 'auto');
  assert.equal(getOutboundDecision({ relationship: 'fresh', channel: 'email', localHour: 22 }).decision, 'defer');
  assert.equal(getOutboundDecision({ relationship: 'known', channel: 'email', localHour: 10 }).decision, 'approval');
  assert.equal(getOutboundDecision({ relationship: 'unknown', channel: 'email', localHour: 10 }).decision, 'approval');
  assert.equal(getOutboundDecision({ relationship: 'fresh', channel: 'sms', localHour: 10 }).decision, 'approval');
});

test('revenue workflow carries a lead from research to verified payment', () => {
  let item = createRevenueLeadWorkItem({
    id: 'lead-1',
    leadName: 'ACME',
    relationship: 'fresh',
    now: '2026-09-12T18:00:00.000Z'
  });

  assert.equal(revenueStage(item), 'research');
  item = advanceRevenueLead(item, 'research_complete', { now: '2026-09-12T18:01:00.000Z' });
  assert.equal(revenueStage(item), 'qualify');
  item = advanceRevenueLead(item, 'qualified', { now: '2026-09-12T18:02:00.000Z' });
  assert.equal(revenueStage(item), 'outreach');
  item = advanceRevenueLead(item, 'outreach_sent', { now: '2026-09-12T18:03:00.000Z', evidence: { type: 'email', id: 'msg-1' } });
  assert.equal(revenueStage(item), 'waiting_reply');
  assert.equal(item.state, 'waiting_external');
  item = advanceRevenueLead(item, 'reply_received', { now: '2026-09-12T18:04:00.000Z' });
  assert.equal(revenueStage(item), 'proposal');
  item = advanceRevenueLead(item, 'proposal_sent', { now: '2026-09-12T18:05:00.000Z' });
  assert.equal(revenueStage(item), 'payment');
  item = advanceRevenueLead(item, 'payment_received', { now: '2026-09-12T18:06:00.000Z', result: { amount: 1200 } });
  assert.equal(revenueStage(item), 'won');
  assert.equal(item.state, 'done');
  assert.equal(item.result.amount, 1200);
  assert.equal(item.evidence.length, 1);
});

test('business team keeps one manager plus bounded functional roles', () => {
  assert.deepEqual(BUSINESS_ROLES.map(role => role.id), [
    'business-manager',
    'research',
    'sales',
    'marketing',
    'operations',
    'engineering'
  ]);
});
