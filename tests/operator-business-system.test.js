import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkItem, transitionWorkItem } from '../src/operator-runtime/work-item.js';

const approved = (leadId, event, draftId, id) => ({ status: 'approved', id, leadId, event, draftId });
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

test('all outbound requires approval, including fresh direct email in business hours', () => {
  assert.equal(getOutboundDecision({ relationship: 'fresh', channel: 'email', localHour: 10 }).decision, 'approval');
  assert.equal(getOutboundDecision({ relationship: 'fresh', channel: 'email', localHour: 22 }).decision, 'defer');
  assert.equal(getOutboundDecision({ relationship: 'known', channel: 'email', localHour: 10 }).decision, 'approval');
  assert.equal(getOutboundDecision({ relationship: 'unknown', channel: 'email', localHour: 10 }).decision, 'approval');
  assert.equal(getOutboundDecision({ relationship: 'fresh', channel: 'sms', localHour: 10 }).decision, 'approval');
  assert.equal(getOutboundDecision({ relationship: 'fresh', channel: 'email', localHour: 10, campaignAllowed: false }).decision, 'defer');
  assert.equal(getOutboundDecision({ relationship: 'fresh', channel: 'email', localHour: 10, sensitiveAction: true }).decision, 'approval');
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
  assert.throws(() => advanceRevenueLead(item, 'outreach_sent', { evidence: { type: 'email', id: 'msg-1' } }), /approved human checkpoint/);
  item = advanceRevenueLead(item, 'outreach_sent', {
    now: '2026-09-12T18:03:00.000Z',
    humanCheckpoint: approved('lead-1', 'outreach_sent', 'draft-1', 'approval-1'), draftId: 'draft-1',
    evidence: { type: 'email', id: 'msg-1' }
  });
  assert.equal(revenueStage(item), 'waiting_reply');
  assert.equal(item.state, 'waiting_external');
  item = advanceRevenueLead(item, 'reply_received', { now: '2026-09-12T18:04:00.000Z', evidence: { type: 'reply', id: 'reply-1' } });
  assert.equal(revenueStage(item), 'proposal');
  assert.throws(() => advanceRevenueLead(item, 'proposal_sent', {
    evidence: { type: 'email', id: 'proposal-1' }
  }), /fresh traceable approved human checkpoint/);
  item = advanceRevenueLead(item, 'proposal_sent', {
    now: '2026-09-12T18:05:00.000Z', evidence: { type: 'email', id: 'proposal-1' },
    humanCheckpoint: approved('lead-1', 'proposal_sent', 'draft-2', 'approval-2'), draftId: 'draft-2'
  });
  assert.equal(revenueStage(item), 'payment');
  item = advanceRevenueLead(item, 'payment_received', {
    now: '2026-09-12T18:06:00.000Z', result: { amount: 1200 }, evidence: { type: 'payment', id: 'payment-1' }
  });
  assert.equal(revenueStage(item), 'won');
  assert.equal(item.state, 'done');
  assert.equal(item.result.amount, 1200);
  assert.equal(item.evidence.length, 4);
  assert.equal(item.metadata.lastOutboundApprovalId, 'approval-2');
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


test('revenue events cannot assert sends, replies, or payments without receipts and approval', () => {
  const outreach = createRevenueLeadWorkItem({ id: 'outreach-1', stage: 'outreach' });
  assert.throws(() => advanceRevenueLead(outreach, 'outreach_sent'), /external receipt/);
  assert.throws(() => advanceRevenueLead(outreach, 'outreach_sent', {
    evidence: { type: 'email', id: 'msg-1' }, humanCheckpoint: { status: 'approved' }
  }), /approved human checkpoint/);
  const waiting = createRevenueLeadWorkItem({ id: 'waiting-1', stage: 'waiting_reply' });
  assert.throws(() => advanceRevenueLead(waiting, 'reply_received'), /external receipt/);
  const followUp = createRevenueLeadWorkItem({ id: 'follow-1', stage: 'follow_up' });
  assert.throws(() => advanceRevenueLead(followUp, 'follow_up_sent', {
    evidence: { type: 'email', id: 'msg-2' }
  }), /approved human checkpoint/);
  const proposal = createRevenueLeadWorkItem({ id: 'proposal-1', stage: 'proposal' });
  assert.throws(() => advanceRevenueLead(proposal, 'proposal_sent', {
    evidence: { type: 'email', id: 'msg-3' }
  }), /approved human checkpoint/);
  const payment = createRevenueLeadWorkItem({ id: 'payment-1', stage: 'payment' });
  assert.throws(() => advanceRevenueLead(payment, 'payment_received', { result: { amount: 100 } }), /external receipt/);
  assert.throws(() => advanceRevenueLead(payment, 'payment_received', {
    result: { amount: 100 }, evidence: { type: 'email', id: 'msg-4' }
  }), /payment receipt/);
  assert.throws(() => advanceRevenueLead(payment, 'payment_received', {
    result: { amount: 0 }, evidence: { type: 'payment', id: 'pay-1' }
  }), /positive numeric amount/);
  assert.throws(() => advanceRevenueLead(payment, 'payment_received', {
    result: { amount: '100' }, evidence: { type: 'payment', id: 'pay-1' }
  }), /positive numeric amount/);
  const won = advanceRevenueLead(payment, 'payment_received', {
    result: { amount: 100 }, evidence: { type: 'payment', id: 'pay-1' }
  });
  assert.equal(revenueStage(won), 'won');
  assert.equal(won.evidence[0].id, 'pay-1');
});



test('revenue approval is bound to one lead, event and exact draft', () => {
  const lead = createRevenueLeadWorkItem({ id: 'buyer-A', stage: 'outreach' });
  const evidence = { type: 'email', id: 'provider-message-A' };
  const checkpoint = approved('buyer-A', 'outreach_sent', 'draft-A', 'approval-A');
  for (const invalid of [
    { humanCheckpoint: approved('buyer-B', 'outreach_sent', 'draft-A', 'approval-A'), draftId: 'draft-A' },
    { humanCheckpoint: approved('buyer-A', 'proposal_sent', 'draft-A', 'approval-A'), draftId: 'draft-A' },
    { humanCheckpoint: checkpoint, draftId: 'draft-B' },
    { humanCheckpoint: checkpoint },
    { humanCheckpoint: { status: 'approved', id: 'approval-A' }, draftId: 'draft-A' }
  ]) {
    assert.throws(() => advanceRevenueLead(lead, 'outreach_sent', { evidence, ...invalid }),
      /fresh traceable approved human checkpoint/);
  }
  const sent = advanceRevenueLead(lead, 'outreach_sent', {
    evidence, humanCheckpoint: checkpoint, draftId: 'draft-A'
  });
  assert.equal(revenueStage(sent), 'waiting_reply');
  assert.equal(sent.metadata.lastOutboundApprovalId, 'approval-A');
});

test('outbound approvals cannot be reused after an intervening approval', () => {
  const item = createRevenueLeadWorkItem({
    id: 'approval-history-1', stage: 'follow_up',
    metadata: {
      lastOutboundApprovalId: 'approval-B',
      usedOutboundApprovalIds: ['approval-A', 'approval-B']
    }
  });
  assert.throws(() => advanceRevenueLead(item, 'follow_up_sent', {
    evidence: { type: 'email', id: 'message-C' },
    humanCheckpoint: approved('approval-history-1', 'follow_up_sent', 'draft-C', 'approval-A'), draftId: 'draft-C'
  }), /fresh traceable approved human checkpoint/);
  const sent = advanceRevenueLead(item, 'follow_up_sent', {
    evidence: { type: 'email', id: 'message-C' },
    humanCheckpoint: approved('approval-history-1', 'follow_up_sent', 'draft-C', 'approval-C'), draftId: 'draft-C'
  });
  assert.deepEqual(sent.metadata.usedOutboundApprovalIds, ['approval-A', 'approval-B', 'approval-C']);
  assert.equal(sent.metadata.lastOutboundApprovalId, 'approval-C');
  const malformed = createRevenueLeadWorkItem({
    id: 'approval-history-2', stage: 'outreach',
    metadata: { usedOutboundApprovalIds: 'not-an-audit-list' }
  });
  assert.throws(() => advanceRevenueLead(malformed, 'outreach_sent', {
    evidence: { type: 'email', id: 'message-D' },
    humanCheckpoint: approved('approval-history-2', 'outreach_sent', 'draft-D', 'approval-D'), draftId: 'draft-D'
  }), /fresh traceable approved human checkpoint/);
});


test('revenue events reject a previously recorded provider receipt', () => {
  const priorEmail = { type: 'email', id: 'provider-message-1' };
  const followUp = createRevenueLeadWorkItem({
    id: 'receipt-replay-send', stage: 'follow_up', evidence: [priorEmail]
  });
  assert.throws(() => advanceRevenueLead(followUp, 'follow_up_sent', {
    evidence: { ...priorEmail },
    humanCheckpoint: approved('receipt-replay-send', 'follow_up_sent', 'draft-fresh', 'fresh-approval'), draftId: 'draft-fresh'
  }), /cannot reuse an existing external receipt/);
  const freshSend = advanceRevenueLead(followUp, 'follow_up_sent', {
    evidence: { type: 'email', id: 'provider-message-2' },
    humanCheckpoint: approved('receipt-replay-send', 'follow_up_sent', 'draft-fresh', 'fresh-approval'), draftId: 'draft-fresh'
  });
  assert.equal(freshSend.evidence.length, 2);

  const priorReply = { type: 'reply', id: 'provider-reply-1' };
  const waiting = createRevenueLeadWorkItem({
    id: 'receipt-replay-reply', stage: 'waiting_reply', evidence: [priorReply]
  });
  assert.throws(() => advanceRevenueLead(waiting, 'reply_received', {
    evidence: { ...priorReply }
  }), /cannot reuse an existing external receipt/);

  const priorPayment = { type: 'payment', id: 'provider-payment-1' };
  const payment = createRevenueLeadWorkItem({
    id: 'receipt-replay-payment', stage: 'payment', evidence: [priorPayment]
  });
  assert.throws(() => advanceRevenueLead(payment, 'payment_received', {
    evidence: { ...priorPayment }, result: { amount: 200 }
  }), /cannot reuse an existing external receipt/);
});


test('revenue transitions reject receipts from the wrong event class', () => {
  const outreach = createRevenueLeadWorkItem({ id: 'typed-send', stage: 'outreach' });
  for (const type of ['reply', 'payment', 'unknown']) {
    assert.throws(() => advanceRevenueLead(outreach, 'outreach_sent', {
      evidence: { type, id: 'cross-class-send' },
      humanCheckpoint: approved('typed-send', 'outreach_sent', 'draft-typed', 'send-approved'), draftId: 'draft-typed'
    }), /outbound message receipt type/);
  }
  const sent = advanceRevenueLead(outreach, 'outreach_sent', {
    evidence: { type: 'email', id: 'provider-email-1' },
    humanCheckpoint: approved('typed-send', 'outreach_sent', 'draft-typed', 'send-approved'), draftId: 'draft-typed'
  });
  assert.equal(revenueStage(sent), 'waiting_reply');

  const waiting = createRevenueLeadWorkItem({ id: 'typed-reply', stage: 'waiting_reply' });
  for (const type of ['email', 'payment', 'unknown']) {
    assert.throws(() => advanceRevenueLead(waiting, 'reply_received', {
      evidence: { type, id: 'cross-class-reply' }
    }), /inbound reply receipt type/);
  }
  const replied = advanceRevenueLead(waiting, 'reply_received', {
    evidence: { type: 'reply', id: 'provider-reply-1' }
  });
  assert.equal(revenueStage(replied), 'proposal');
});

test('Growth Desk and Growth Operator never advertise automatic outbound sends', () => {
  const desk = readFileSync(new URL('../growth-desk/index.html', import.meta.url), 'utf8');
  const growth = readFileSync(new URL('../growth-operator/index.html', import.meta.url), 'utf8');
  assert.match(desk, /Every outbound message needs explicit human approval/);
  assert.match(growth, /each external message requires explicit human approval/);
  assert.doesNotMatch(desk, /Fresh direct-email leads can run|fresh-lead email can continue automatically/);
  assert.doesNotMatch(growth, /Most routine direct-email work is handled automatically|Routine sends are automatic/);
});

test('business runbook requires approval for every outbound message, not just known contacts', () => {
  const runbook = readFileSync(new URL('../docs/operator-business-system.md', import.meta.url), 'utf8');
  assert.match(runbook, /All external outreach \(including fresh direct email\) requires per-message human approval/);
  assert.match(runbook, /Stop at a fresh, identity-bound human checkpoint before \*\*every\*\* external message/);
  assert.doesNotMatch(runbook, /classified before autonomous outreach/);
});

test('follow-up due events require a persisted elapsed schedule and consume reminders', () => {
  const now = '2026-11-01T18:00:00.000Z';
  const future = '2026-11-03T18:00:00.000Z';
  const past = '2026-10-31T18:00:00.000Z';
  const withoutSchedule = createRevenueLeadWorkItem({ id: 'follow-no-date', stage: 'waiting_reply' });
  assert.throws(() => advanceRevenueLead(withoutSchedule, 'follow_up_due', { now }),
    /existing elapsed follow-up schedule/);
  const notYetDue = createRevenueLeadWorkItem({
    id: 'follow-future', stage: 'waiting_reply', nextFollowUpAt: future
  });
  assert.throws(() => advanceRevenueLead(notYetDue, 'follow_up_due', { now }),
    /existing elapsed follow-up schedule/);
  assert.throws(() => advanceRevenueLead(notYetDue, 'follow_up_due', {
    now, nextFollowUpAt: past
  }), /existing elapsed follow-up schedule/,
  'a caller cannot replace a future persisted schedule with an earlier one');
  const due = createRevenueLeadWorkItem({
    id: 'follow-due', stage: 'waiting_reply', nextFollowUpAt: past
  });
  const ready = advanceRevenueLead(due, 'follow_up_due', { now });
  assert.equal(revenueStage(ready), 'follow_up');
  const sent = advanceRevenueLead(ready, 'follow_up_sent', {
    now, draftId: 'draft-follow',
    humanCheckpoint: approved('follow-due', 'follow_up_sent', 'draft-follow', 'approval-follow'),
    evidence: { type: 'email', id: 'provider-follow' }
  });
  assert.equal(revenueStage(sent), 'waiting_reply');
  assert.equal(sent.metadata.nextFollowUpAt, null,
    'an old reminder cannot instantly schedule another follow-up');
  assert.throws(() => advanceRevenueLead(sent, 'follow_up_due', { now }),
    /existing elapsed follow-up schedule/);
  const rescheduled = advanceRevenueLead(ready, 'follow_up_sent', {
    now, draftId: 'draft-follow',
    humanCheckpoint: approved('follow-due', 'follow_up_sent', 'draft-follow', 'approval-follow'),
    evidence: { type: 'email', id: 'provider-follow' }, nextFollowUpAt: future
  });
  assert.equal(rescheduled.metadata.nextFollowUpAt, future,
    'a newly approved reminder may be explicitly scheduled');
  const replied = advanceRevenueLead(due, 'reply_received', {
    now, evidence: { type: 'reply', id: 'provider-reply' }
  });
  assert.equal(replied.metadata.nextFollowUpAt, null,
    'a received reply consumes the old unanswered-lead reminder');
});
