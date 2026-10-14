'use strict';

// Pure goal-state transitions. Persistence and execution remain the responsibility
// of the existing Operator runtime. No side effects are performed here.
const crypto = require('node:crypto');
const STATES = new Set(['queued', 'working', 'needs_approval', 'paused', 'verifying', 'complete', 'failed']);
const SENSITIVE = new Set(['message_person', 'destructive', 'credentials', 'financial', 'production_change']);

function createGoal({ title, steps, acceptanceChecks = [], id = crypto.randomUUID(), now = new Date().toISOString() }) {
  if (typeof title !== 'string' || !title.trim()) throw new Error('title required');
  if (!Array.isArray(steps) || !steps.length) throw new Error('steps required');
  if (!Array.isArray(acceptanceChecks) || acceptanceChecks.some(check =>
    !check || typeof check.id !== 'string' || !check.id.trim()
    || typeof check.description !== 'string' || !check.description.trim())) throw new Error('invalid acceptance checks');
  if (new Set(acceptanceChecks.map(check => check.id)).size !== acceptanceChecks.length) throw new Error('duplicate acceptance check');
  const checks = acceptanceChecks.map(check => ({ id: check.id, description: check.description, status: 'pending' }));
  const normalized = steps.map((step, index) => {
    if (!step || typeof step.kind !== 'string' || typeof step.description !== 'string')
      throw new Error('invalid step');
    return { id: step.id || String(index + 1), kind: step.kind, description: step.description, status: 'queued' };
  });
  if (new Set(normalized.map(s => s.id)).size !== normalized.length) throw new Error('duplicate step id');
  return { id, title: title.trim(), status: 'queued', steps: normalized, acceptanceChecks: checks, cursor: 0,
    revision: 0, createdAt: now, updatedAt: now, history: [] };
}

function transition(goal, event, now = new Date().toISOString()) {
  if (!goal || !STATES.has(goal.status)) throw new Error('invalid goal');
  if (!event || typeof event.type !== 'string') throw new Error('invalid event');
  const next = structuredClone(goal);
  const step = next.steps[next.cursor];
  const append = (type, details = {}) => next.history.push({ type, at: now, stepId: step?.id || null, ...details });
  switch (event.type) {
    case 'pause':
      if (['complete', 'failed'].includes(next.status)) throw new Error('terminal goal');
      next.status = 'paused'; append('paused'); break;
    case 'resume':
      if (!['paused', 'failed'].includes(next.status)) throw new Error('not resumable');
      next.status = next.cursor === next.steps.length ? 'verifying' : 'queued'; append('resumed'); break;
    case 'start':
      if (next.status !== 'queued' || !step) throw new Error('not queued');
      if (SENSITIVE.has(step.kind)) { next.status = 'needs_approval'; append('approval_requested'); }
      else { next.status = 'working'; step.status = 'working'; append('started'); }
      break;
    case 'approve':
      if (next.status !== 'needs_approval' || !step) throw new Error('no approval pending');
      if (!event.approver || !event.approvalId) throw new Error('approval evidence required');
      next.status = 'working'; step.status = 'working';
      append('approved', { approver: event.approver, approvalId: event.approvalId }); break;
    case 'reject':
      if (next.status !== 'needs_approval') throw new Error('no approval pending');
      next.status = 'paused'; append('rejected'); break;
    case 'complete_step':
      if (next.status !== 'working' || !step) throw new Error('step not working');
      if (typeof event.evidence !== 'string' || !event.evidence.trim()) throw new Error('evidence required');
      step.status = 'complete'; step.evidence = event.evidence;
      append('step_completed', { evidence: event.evidence });
      next.cursor++;
      next.status = next.cursor === next.steps.length ? (next.acceptanceChecks?.length ? 'verifying' : 'complete') : 'queued';
      break;
    case 'verify_check': {
      if (next.status !== 'verifying') throw new Error('not verifying');
      const check = next.acceptanceChecks.find(item => item.id === event.checkId);
      if (!check || typeof event.evidence !== 'string' || !event.evidence.trim()
        || typeof event.passed !== 'boolean') throw new Error('verification evidence required');
      check.status = event.passed ? 'passed' : 'failed';
      check.evidence = event.evidence;
      append('check_verified', { checkId: check.id, passed: event.passed, evidence: event.evidence });
      break;
    }
    case 'complete_goal':
      if (next.status !== 'verifying' || !next.acceptanceChecks?.length
        || !next.acceptanceChecks.every(check => check.status === 'passed' && check.evidence?.trim()))
        throw new Error('acceptance checks not passed');
      next.status = 'complete'; append('goal_verified'); break;
    case 'fail':
      if (next.status !== 'working') throw new Error('not working');
      next.status = 'failed'; append('failed', { reason: String(event.reason || 'unknown') }); break;
    default: throw new Error('unknown event');
  }
  next.revision++; next.updatedAt = now;
  return next;
}
module.exports = { createGoal, transition, SENSITIVE };
