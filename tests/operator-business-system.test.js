import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkItem, transitionWorkItem } from '../src/operator-runtime/work-item.js';
import { workItemStateFromQueueRecord, queueRecordToWorkItem, normalizeQueueRecordForWorkboard } from '../src/operator-runtime/task-queue-adapter.js';
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

test('worker registry never schedules non-queueable work for a second execution', () => {
  const worker = createWorker({
    id: 'read-worker',
    name: 'Read Worker',
    class: 'read',
    capabilities: ['crm-read']
  });
  for (const state of ['running', 'waiting_human', 'waiting_external',
    'blocked', 'verifying', 'done', 'failed', 'cancelled']) {
    const item = createWorkItem({
      id: `synthetic-${state}`,
      title: 'Synthetic CRM task',
      domain: 'revenue',
      state,
      requiredCapabilities: ['crm-read']
    });
    assert.deepEqual(findEligibleWorkers([worker], item), [], `${state} work must not be leased again`);
  }
  for (const state of ['queued', 'ready']) {
    const item = createWorkItem({
      id: `synthetic-${state}`,
      title: 'Synthetic CRM task',
      domain: 'revenue',
      state,
      requiredCapabilities: ['crm-read']
    });
    assert.deepEqual(findEligibleWorkers([worker], item).map(item => item.id),
      ['read-worker'], `${state} work remains eligible`);
  }
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

test('fresh email requires human approval even in business hours; policy defers disallowed windows', () => {
  assert.equal(getOutboundDecision({ relationship: 'fresh', channel: 'email', localHour: 10 }).decision, 'approval');
  assert.equal(getOutboundDecision({ relationship: 'fresh', channel: 'email', localHour: 22 }).decision, 'defer');
  assert.equal(getOutboundDecision({ relationship: 'known', channel: 'email', localHour: 10 }).decision, 'approval');
  assert.equal(getOutboundDecision({ relationship: 'unknown', channel: 'email', localHour: 10 }).decision, 'approval');
  assert.equal(getOutboundDecision({ relationship: 'fresh', channel: 'sms', localHour: 10 }).decision, 'approval');
});

test('revenue lead creation cannot forge a paid stage before provider verification', () => {
  for (const input of [
    { id: 'fake-paid-stage', stage: 'won' },
    { id: 'fake-paid-complete', stage: 'won', state: 'done', result: { amountCents: 50000, currency: 'USD' } },
  ]) {
    assert.throws(() => createRevenueLeadWorkItem(input), /authenticated payment provider adapter/);
  }
  const awaitingPayment = createRevenueLeadWorkItem({
    id: 'real-awaiting-payment', stage: 'payment', state: 'waiting_external'
  });
  assert.equal(revenueStage(awaitingPayment), 'payment');
  assert.equal(awaitingPayment.state, 'waiting_external');
});

test('new revenue leads reject unknown pipeline stages and forged completed states', () => {
  for (const stage of ['not-a-stage', 'paid', '']) {
    if (!stage) continue;
    assert.throws(
      () => createRevenueLeadWorkItem({ id: 'invalid-stage', stage }),
      /unknown revenue stage/,
      'unknown stage must not enter the queue or CRM',
    );
  }
  for (const stage of [undefined, 'research', 'outreach', 'waiting_reply', 'payment']) {
    assert.throws(
      () => createRevenueLeadWorkItem({ id: 'false-completion', stage, state: 'done',
        result: { amountCents: 50000, currency: 'USD' } }),
      /verified terminal stage/,
      'completed wrapper must not masquerade as a paid lead',
    );
  }
  const closed = createRevenueLeadWorkItem({ id: 'closed-not-paid', stage: 'lost', state: 'done' });
  assert.equal(closed.metadata.stage, 'lost');
  assert.equal(closed.state, 'done');
  const active = createRevenueLeadWorkItem({ id: 'awaiting-review', stage: 'payment', state: 'waiting_external' });
  assert.equal(active.metadata.stage, 'payment');
  assert.equal(active.state, 'waiting_external');
});

test('revenue workflow records sent/reply receipts but cannot claim paid without a provider adapter', () => {
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
  item = advanceRevenueLead(item, 'reply_received', { now: '2026-09-12T18:04:00.000Z', evidence: { type: 'provider_reply', id: 'reply-1', provider: 'gmail', inReplyToId: 'msg-1' } });
  assert.equal(revenueStage(item), 'proposal');
  item = advanceRevenueLead(item, 'proposal_sent', { now: '2026-09-12T18:05:00.000Z', evidence: { type: 'email', id: 'msg-2' } });
  assert.equal(revenueStage(item), 'payment');
  assert.throws(() => advanceRevenueLead(item, 'payment_received', {
    now: '2026-09-12T18:06:00.000Z',
    result: { amountCents: 120000, currency: 'USD' },
    // Even plausible provider fields can be invented by a caller. A verified
    // webhook adapter must be implemented before this may become "won".
    evidence: { type: 'provider_payment', id: 'evt-1', provider: 'stripe',
      invoiceId: 'inv-1', leadId: item.id, amountCents: 120000, currency: 'USD' }
  }), /authenticated payment provider adapter/);
  assert.equal(revenueStage(item), 'payment');
  assert.notEqual(item.state, 'done');
  assert.equal(item.evidence.length, 3, 'no unverified payment receipt is recorded');
});


test('revenue events cannot claim sent messages or payments without attributable receipts', () => {
  let item = createRevenueLeadWorkItem({ id: 'lead-guard', leadName: 'Synthetic lead' });
  item = advanceRevenueLead(item, 'research_complete');
  item = advanceRevenueLead(item, 'qualified');
  assert.throws(() => advanceRevenueLead(item, 'outreach_sent'), /requires an external receipt/);
  item = advanceRevenueLead(item, 'outreach_sent', { evidence: { type: 'email', id: 'msg-guard' } });
  assert.throws(() => advanceRevenueLead(item, 'reply_received'), /requires an external receipt/);
  assert.throws(() => advanceRevenueLead(item, 'reply_received', {
    evidence: { type: 'provider_reply', id: 'unlinked-reply', provider: 'gmail', inReplyToId: 'unknown-message' }
  }), /linked to an earlier send/);
  assert.throws(() => advanceRevenueLead(item, 'reply_received', {
    evidence: { type: 'email', id: 'fake-reply', inReplyToId: 'msg-guard' }
  }), /linked to an earlier send/);
  item = advanceRevenueLead(item, 'reply_received', {
    evidence: { type: 'provider_reply', id: 'reply-guard', provider: 'gmail', inReplyToId: 'msg-guard' }
  });
  assert.throws(() => advanceRevenueLead(item, 'proposal_sent'), /requires an external receipt/);
  assert.throws(() => advanceRevenueLead(item, 'proposal_sent', { evidence: { type: 'email', id: 'msg-guard' } }), /already been recorded/);
  item = advanceRevenueLead(item, 'proposal_sent', { evidence: { type: 'email', id: 'proposal-guard' } });
  const receipt = { type: 'provider_payment', id: 'evt-guard', provider: 'stripe', invoiceId: 'inv-guard', leadId: item.id, amountCents: 5000, currency: 'USD' };
  const result = { amountCents: 5000, currency: 'USD' };
  assert.throws(() => advanceRevenueLead(item, 'payment_received', { result }), /requires an external receipt/);
  assert.throws(() => advanceRevenueLead(item, 'payment_received', { evidence: { ...receipt, leadId: 'different-lead' }, result }), /requires a matching provider receipt/);
  assert.throws(() => advanceRevenueLead(item, 'payment_received', { evidence: { ...receipt, amountCents: -1 }, result }), /requires a matching provider receipt/);
  assert.throws(() => advanceRevenueLead(item, 'payment_received', { evidence: receipt, result: { amountCents: 1, currency: 'USD' } }), /requires a matching provider receipt/);
  assert.equal(item.metadata.stage, 'payment', 'rejected claims do not mutate the source work item');
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

test('replies, completed follow-ups and terminal outcomes clear stale sales follow-up reminders', () => {
  const oldReminder = '2026-11-20T18:00:00.000Z';
  let replied = createRevenueLeadWorkItem({
    id: 'followup-reply', leadName: 'Synthetic reply', stage: 'waiting_reply',
    state: 'waiting_external', nextFollowUpAt: oldReminder,
    evidence: [{ type: 'email', id: 'synthetic-outreach-reply' }]
  });
  replied = advanceRevenueLead(replied, 'reply_received', {
    evidence: { type: 'provider_reply', id: 'synthetic-inbound-reply', provider: 'gmail', inReplyToId: 'synthetic-outreach-reply' }
  });
  assert.equal(revenueStage(replied), 'proposal');
  assert.equal(replied.metadata.nextFollowUpAt, null, 'a reply consumes the pending follow-up');

  let due = createRevenueLeadWorkItem({
    id: 'followup-due', leadName: 'Synthetic reminder', stage: 'waiting_reply',
    state: 'waiting_external', nextFollowUpAt: oldReminder
  });
  due = advanceRevenueLead(due, 'follow_up_due', { now: '2026-11-21T18:00:00.000Z' });
  assert.equal(due.metadata.nextFollowUpAt, null, 'due reminder is not left to fire again');
  due = advanceRevenueLead(due, 'follow_up_sent', { evidence: { type: 'email', id: 'synthetic-msg-1' } });
  assert.equal(due.metadata.nextFollowUpAt, null, 'sent follow-up does not inherit the expired reminder');
  const rescheduled = advanceRevenueLead(createRevenueLeadWorkItem({
    id: 'followup-rescheduled', stage: 'follow_up', state: 'ready'
  }), 'follow_up_sent', {
    evidence: { type: 'email', id: 'synthetic-msg-rescheduled' },
    nextFollowUpAt: '2026-11-25T18:00:00.000Z'
  });
  assert.equal(rescheduled.metadata.nextFollowUpAt, '2026-11-25T18:00:00.000Z', 'explicit new scheduling is preserved on an open lead');

  let lost = createRevenueLeadWorkItem({
    id: 'followup-lost', stage: 'outreach', nextFollowUpAt: oldReminder
  });
  lost = advanceRevenueLead(lost, 'closed_lost', {
    nextFollowUpAt: '2026-12-01T18:00:00.000Z'
  });
  assert.equal(revenueStage(lost), 'lost');
  assert.equal(lost.metadata.nextFollowUpAt, null, 'closed leads never keep a sales follow-up');

  let paid = advanceRevenueLead(replied, 'proposal_sent', {
    evidence: { type: 'email', id: 'synthetic-proposal-1' },
    nextFollowUpAt: '2026-11-23T18:00:00.000Z'
  });
  assert.equal(paid.metadata.nextFollowUpAt, '2026-11-23T18:00:00.000Z');
  assert.throws(() => advanceRevenueLead(paid, 'payment_received', {
    evidence: {
      type: 'provider_payment', id: 'synthetic-payment-1', provider: 'test',
      invoiceId: 'synthetic-invoice', leadId: paid.id, amountCents: 100,
      currency: 'USD'
    },
    result: { amountCents: 100, currency: 'USD' },
    nextFollowUpAt: '2026-12-01T18:00:00.000Z'
  }), /authenticated payment provider adapter/);
  assert.equal(revenueStage(paid), 'payment', 'unverified payment cannot close a lead');
  assert.equal(paid.metadata.nextFollowUpAt, '2026-11-23T18:00:00.000Z',
    'rejected payment cannot edit existing scheduling or turn off review');
});

 
test('revenue follow-ups cannot become due early or without a prior reminder', () => {
  const now = '2026-11-20T18:00:00.000Z';
  const noSchedule = createRevenueLeadWorkItem({
    id: 'followup-unscheduled', stage: 'waiting_reply', state: 'waiting_external'
  });
  assert.throws(() => advanceRevenueLead(noSchedule, 'follow_up_due', { now }), /previously scheduled reminder/);
  assert.throws(() => advanceRevenueLead(noSchedule, 'follow_up_due', {
    now, nextFollowUpAt: '2026-11-19T18:00:00.000Z'
  }), /previously scheduled reminder/, 'a new date cannot retroactively create a due reminder');

  // Invalid schedules are now rejected before they ever enter the queue;
  // an already persisted legacy corrupt reminder still cannot become due.
  assert.throws(() => createRevenueLeadWorkItem({
    id: 'followup-invalid', stage: 'waiting_reply', state: 'waiting_external',
    nextFollowUpAt: 'not-a-date'
  }), /nextFollowUpAt/);
  const legacyInvalidSchedule = createRevenueLeadWorkItem({
    id: 'legacy-followup-invalid', stage: 'waiting_reply', state: 'waiting_external'
  });
  legacyInvalidSchedule.metadata.nextFollowUpAt = 'not-a-date';
  assert.throws(() => advanceRevenueLead(legacyInvalidSchedule, 'follow_up_due', { now }), /previously scheduled reminder/);

  const scheduled = createRevenueLeadWorkItem({
    id: 'followup-early', stage: 'waiting_reply', state: 'waiting_external',
    nextFollowUpAt: now
  });
  assert.throws(() => advanceRevenueLead(scheduled, 'follow_up_due', {
    now: '2026-11-20T17:59:59.999Z'
  }), /previously scheduled reminder/);
  assert.equal(scheduled.metadata.stage, 'waiting_reply', 'rejected transitions leave the source untouched');
  const due = advanceRevenueLead(scheduled, 'follow_up_due', { now });
  assert.equal(due.metadata.stage, 'follow_up');
  assert.equal(due.metadata.nextFollowUpAt, null, 'a real due transition consumes its reminder');
});


test('outbound revenue stages reject non-send evidence before claiming external delivery', () => {
  for (const [stage, event] of [
    ['outreach', 'outreach_sent'],
    ['follow_up', 'follow_up_sent'],
    ['proposal', 'proposal_sent']
  ]) {
    const item = createRevenueLeadWorkItem({
      id: `synthetic-${stage}-receipt`, stage, state: 'ready', leadName: 'Synthetic test only'
    });
    for (const type of ['provider_reply', 'provider_payment', 'research', undefined]) {
      assert.throws(() => advanceRevenueLead(item, event, {
        evidence: { id: `fake-${stage}-${type}`, type }
      }), /requires a provider send receipt/);
    }
    assert.equal(item.metadata.stage, stage, 'invalid receipt leaves the original lead unchanged');
    const next = advanceRevenueLead(item, event, {
      evidence: { id: `sent-${stage}`, type: 'provider_send' }
    });
    assert.equal(next.evidence.length, 1, 'a correctly typed synthetic send receipt still advances');
  }
});


test('revenue follow-up dates must be absolute and valid; closed leads cannot retain reminders', () => {
  for (const invalid of ['tomorrow', '2026-11-23', '2026-11-23T18:00:00', '2026-02-30T18:00:00Z', 42]) {
    assert.throws(() => createRevenueLeadWorkItem({
      id: 'bad-reminder', nextFollowUpAt: invalid
    }), /nextFollowUpAt/, String(invalid));
  }

  const waiting = createRevenueLeadWorkItem({
    id: 'valid-reminder', stage: 'waiting_reply', state: 'waiting_external',
    nextFollowUpAt: '2026-11-23T18:00:00Z'
  });
  assert.throws(() => advanceRevenueLead(waiting, 'follow_up_due', {
    now: '2026-11-24T18:00:00Z', nextFollowUpAt: 'next week'
  }), /nextFollowUpAt/);
  assert.equal(waiting.metadata.nextFollowUpAt, '2026-11-23T18:00:00Z',
    'invalid update must not mutate the source lead');

  const rescheduled = advanceRevenueLead(waiting, 'follow_up_due', {
    now: '2026-11-24T18:00:00Z', nextFollowUpAt: '2026-11-25T10:00:00-08:00'
  });
  assert.equal(rescheduled.metadata.nextFollowUpAt, '2026-11-25T10:00:00-08:00');

  const closed = createRevenueLeadWorkItem({
    id: 'closed-reminder', stage: 'lost',
    nextFollowUpAt: '2026-11-25T18:00:00Z'
  });
  assert.equal(closed.metadata.nextFollowUpAt, null);
});

test('signed queue completion via runtime-state fallback still requires worker attribution', () => {
  for (const status of ['queued', '', 'unknown', undefined, 'completed']) {
    const record = { id: 'operator-http-synthetic', task: 'Synthetic prospect research',
      status, runtimeState: 'done', resultSummary: 'Claimed completion' };
    assert.equal(workItemStateFromQueueRecord(record), 'verifying');
    const item = queueRecordToWorkItem(record);
    assert.equal(item.state, 'verifying');
    assert.equal(item.result, null);
    assert.equal(item.metadata.verificationStatus, 'missing_worker_attribution');
    const board = normalizeQueueRecordForWorkboard(record);
    assert.equal(board.status, 'verifying');
    assert.match(board.resultSummary, /no worker identity/);
    assert.equal(workItemStateFromQueueRecord({ ...record, workerDeviceId: 'synthetic-worker' }), 'done');
  }
  assert.equal(workItemStateFromQueueRecord({ id: 'legacy-task', status: 'completed' }), 'done');
  assert.equal(workItemStateFromQueueRecord({ id: 'operator-http-synthetic', status: 'running', runtimeState: 'done' }), 'running');
  assert.equal(workItemStateFromQueueRecord({ id: 'legacy-task', source: 'operator-http', runtimeState: 'done' }), 'verifying');
});

test('persisted reminders and event clocks must be absolute valid calendar timestamps', () => {
  const now = '2026-11-24T20:00:00Z';
  const make = () => createRevenueLeadWorkItem({
    id: 'legacy-absolute-followup', stage: 'waiting_reply', state: 'waiting_external',
    nextFollowUpAt: '2026-11-24T12:00:00-05:00'
  });
  for (const invalid of ['2026-11-24', '2026-11-24T12:00:00', '2026-02-30T12:00:00Z', '', null]) {
    const legacy = make();
    legacy.metadata.nextFollowUpAt = invalid;
    assert.throws(() => advanceRevenueLead(legacy, 'follow_up_due', { now }), /previously scheduled reminder/);
    assert.equal(legacy.metadata.stage, 'waiting_reply');
  }
  for (const invalid of ['2026-11-25', '2026-11-25T20:00:00', '2026-11-31T20:00:00Z', '']) {
    assert.throws(() => advanceRevenueLead(make(), 'follow_up_due', { now: invalid }), /previously scheduled reminder/);
  }
  const due = advanceRevenueLead(make(), 'follow_up_due', { now });
  assert.equal(due.metadata.stage, 'follow_up');
  assert.equal(due.metadata.nextFollowUpAt, null);
});
