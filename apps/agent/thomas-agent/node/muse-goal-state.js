'use strict';

// Pure goal-state transitions. Persistence and execution remain the responsibility
// of the existing Operator runtime. No side effects are performed here.
const crypto = require('node:crypto');
const STATES = new Set(['queued', 'working', 'needs_approval', 'paused', 'complete', 'failed']);
const SENSITIVE = new Set(['message_person', 'destructive', 'credentials', 'financial', 'production_change']);

function createGoal({ title, steps, id = crypto.randomUUID(), now = new Date().toISOString() }) {
  if (typeof title !== 'string' || !title.trim()) throw new Error('title required');
  if (!Array.isArray(steps) || !steps.length) throw new Error('steps required');
  const normalized = steps.map((step, index) => {
    if (!step || typeof step.kind !== 'string' || typeof step.description !== 'string')
      throw new Error('invalid step');
    return { id: step.id || String(index + 1), kind: step.kind, description: step.description, status: 'queued' };
  });
  if (new Set(normalized.map(s => s.id)).size !== normalized.length) throw new Error('duplicate step id');
  return { id, title: title.trim(), status: 'queued', steps: normalized, cursor: 0,
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
      next.status = 'queued'; append('resumed'); break;
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
      if (!event.evidence || typeof event.evidence !== 'string') throw new Error('evidence required');
      step.status = 'complete'; step.evidence = event.evidence;
      append('step_completed', { evidence: event.evidence });
      next.cursor++;
      next.status = next.cursor === next.steps.length ? 'complete' : 'queued';
      break;
    case 'fail':
      if (next.status !== 'working') throw new Error('not working');
      next.status = 'failed'; append('failed', { reason: String(event.reason || 'unknown') }); break;
    default: throw new Error('unknown event');
  }
  next.revision++; next.updatedAt = now;
  return next;
}
module.exports = { createGoal, transition, SENSITIVE };
