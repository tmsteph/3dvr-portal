import { createWorkItem, transitionWorkItem } from './work-item.js';

export const BUSINESS_ROLES = Object.freeze([
  Object.freeze({ id: 'business-manager', name: 'Business Manager', mission: 'Choose the next highest-value bounded action and coordinate handoffs.' }),
  Object.freeze({ id: 'research', name: 'Research', mission: 'Find and qualify real opportunities with evidence.' }),
  Object.freeze({ id: 'sales', name: 'Sales', mission: 'Move qualified opportunities toward a clear next step or paid ask.' }),
  Object.freeze({ id: 'marketing', name: 'Marketing', mission: 'Create useful demand signals, offers, and reusable campaign assets.' }),
  Object.freeze({ id: 'operations', name: 'Operations', mission: 'Keep CRM, follow-ups, schedules, evidence, and handoffs clean.' }),
  Object.freeze({ id: 'engineering', name: 'Engineering', mission: 'Build or repair the smallest product/tool needed to complete the loop.' })
]);

export const REVENUE_STAGES = Object.freeze([
  'research',
  'qualify',
  'outreach',
  'waiting_reply',
  'follow_up',
  'proposal',
  'payment',
  'won',
  'lost'
]);

const TRANSITIONS = Object.freeze({
  research: Object.freeze({ research_complete: ['qualify', 'ready'] }),
  qualify: Object.freeze({ qualified: ['outreach', 'ready'], disqualified: ['lost', 'done'] }),
  outreach: Object.freeze({ outreach_sent: ['waiting_reply', 'waiting_external'], closed_lost: ['lost', 'done'] }),
  waiting_reply: Object.freeze({ reply_received: ['proposal', 'ready'], follow_up_due: ['follow_up', 'ready'], closed_lost: ['lost', 'done'] }),
  follow_up: Object.freeze({ follow_up_sent: ['waiting_reply', 'waiting_external'], reply_received: ['proposal', 'ready'], closed_lost: ['lost', 'done'] }),
  proposal: Object.freeze({ proposal_sent: ['payment', 'waiting_external'], closed_lost: ['lost', 'done'] }),
  payment: Object.freeze({ payment_received: ['won', 'done'], closed_lost: ['lost', 'done'] }),
  won: Object.freeze({}),
  lost: Object.freeze({})
});

function normalizeRelationship(value) {
  return ['fresh', 'known', 'unknown'].includes(value) ? value : 'unknown';
}

export function getOutboundDecision({
  relationship = 'unknown',
  channel = 'email',
  localHour,
  sensitiveAction = false,
  campaignAllowed = true
} = {}) {
  if (sensitiveAction) {
    return { decision: 'approval', reason: 'Sensitive actions require a human checkpoint.' };
  }

  const relation = normalizeRelationship(relationship);
  if (relation === 'known') {
    return { decision: 'approval', reason: 'Known contacts stay behind a human send checkpoint.' };
  }
  if (relation === 'unknown') {
    return { decision: 'approval', reason: 'Relationship is unknown; classify it before autonomous outreach.' };
  }
  if (channel !== 'email') {
    return { decision: 'approval', reason: 'Autonomous outbound is currently limited to direct email.' };
  }
  if (!campaignAllowed) {
    return { decision: 'defer', reason: 'Campaign caps or policy currently block this send.' };
  }
  if (!Number.isFinite(localHour) || localHour < 8 || localHour >= 18) {
    return { decision: 'defer', reason: 'Fresh-lead email should wait for the 08:00–18:00 local business window.' };
  }

  // Sending is an identity-bound side effect. A campaign/time window is not
  // a per-message human approval receipt, so never authorize it here.
  return { decision: 'approval', reason: 'Every outbound message requires a human approval checkpoint before sending.' };
}

export function createRevenueLeadWorkItem(input = {}) {
  const leadName = typeof input.leadName === 'string' ? input.leadName.trim() : '';
  const title = input.title || `Revenue opportunity${leadName ? ` · ${leadName}` : ''}`;
  const now = input.now || new Date().toISOString();

  return createWorkItem({
    id: input.id,
    title,
    intent: input.intent || 'Turn a real customer need into a verified next step or paid result.',
    domain: 'revenue',
    workflow: 'lead-to-sale',
    priority: input.priority || 'normal',
    state: input.state || 'ready',
    risk: input.risk || 'low',
    owner: input.owner || 'revenue-manager',
    dependencies: input.dependencies,
    requiredCapabilities: input.requiredCapabilities || ['crm-read'],
    identityLease: input.identityLease,
    humanCheckpoint: input.humanCheckpoint,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    evidence: input.evidence,
    result: input.result,
    metadata: {
      ...(input.metadata || {}),
      stage: input.stage || 'research',
      leadName: leadName || null,
      relationship: normalizeRelationship(input.relationship),
      campaign: input.campaign || null,
      nextFollowUpAt: input.nextFollowUpAt || null
    }
  });
}

// These are records of externally observable events, not intentions or drafts.
// A structured receipt reference is necessary but does not replace provider read-back.
const RECEIPT_EVENTS = new Set(['outreach_sent', 'follow_up_sent', 'proposal_sent', 'reply_received', 'payment_received']);
const SEND_EVENTS = new Set(['outreach_sent', 'follow_up_sent', 'proposal_sent']);
// A receipt from a different kind of event cannot establish that a message
// was sent or that a reply arrived. Provider verification remains mandatory.
const SEND_RECEIPT_TYPES = new Set(['email', 'sms', 'whatsapp', 'message']);
const REPLY_RECEIPT_TYPES = new Set(['reply', 'email_reply', 'sms_reply', 'whatsapp_reply']);

function hasReceipt(evidence) {
  return evidence && typeof evidence === 'object' && !Array.isArray(evidence)
    && typeof evidence.type === 'string' && Boolean(evidence.type.trim())
    && typeof evidence.id === 'string' && Boolean(evidence.id.trim());
}

function hasApprovedCheckpoint(checkpoint) {
  return checkpoint && typeof checkpoint === 'object' && checkpoint.status === 'approved'
    && typeof checkpoint.id === 'string' && Boolean(checkpoint.id.trim());
}

export function advanceRevenueLead(item, event, options = {}) {
  const stage = item?.metadata?.stage;
  if (!REVENUE_STAGES.includes(stage)) throw new TypeError(`unknown revenue stage: ${stage || 'missing'}`);

  const transition = TRANSITIONS[stage]?.[event];
  if (!transition) throw new TypeError(`event ${event} is not valid from revenue stage ${stage}`);

  if (RECEIPT_EVENTS.has(event) && !hasReceipt(options.evidence)) {
    throw new TypeError(`${event} requires a typed external receipt reference (type and id)`);
  }
  if (SEND_EVENTS.has(event) && !SEND_RECEIPT_TYPES.has(options.evidence.type)) {
    throw new TypeError(`${event} requires an outbound message receipt type`);
  }
  if (event === 'reply_received' && !REPLY_RECEIPT_TYPES.has(options.evidence.type)) {
    throw new TypeError('reply_received requires an inbound reply receipt type');
  }
  // Reusing the same provider event for another stage is not new execution
  // evidence. This protects per-lead history; provider read-back is still required.
  if (RECEIPT_EVENTS.has(event) && (item.evidence || []).some(receipt =>
    receipt?.type === options.evidence.type && receipt?.id === options.evidence.id)) {
    throw new TypeError(`${event} cannot reuse an existing external receipt`);
  }
  const sendCheckpoint = options.humanCheckpoint ?? item.humanCheckpoint;
  // Check the entire per-lead history, not only the most recent send. A -> B -> A
  // must not permit reuse of approval A for a third external message.
  const usedApprovalIds = item.metadata?.usedOutboundApprovalIds;
  if (SEND_EVENTS.has(event) && (
      (usedApprovalIds !== undefined && (!Array.isArray(usedApprovalIds) ||
        usedApprovalIds.some(id => typeof id !== 'string' || !id.trim()))) ||
      !hasApprovedCheckpoint(sendCheckpoint) ||
      sendCheckpoint.id === item.metadata?.lastOutboundApprovalId ||
      (Array.isArray(usedApprovalIds) && usedApprovalIds.includes(sendCheckpoint.id)))) {
    throw new TypeError(`${event} requires a fresh traceable approved human checkpoint`);
  }
  if (event === 'payment_received' &&
      (options.evidence.type !== 'payment' || !Number.isFinite(options.result?.amount) || options.result.amount <= 0)) {
    throw new TypeError('payment_received requires a payment receipt and positive numeric amount');
  }

  const [nextStage, nextState] = transition;
  const evidence = [...(item.evidence || [])];
  if (options.evidence) evidence.push(options.evidence);

  return transitionWorkItem(item, nextState, {
    now: options.now,
    evidence,
    result: options.result ?? item.result,
    humanCheckpoint: options.humanCheckpoint ?? item.humanCheckpoint,
    metadata: {
      stage: nextStage,
      lastEvent: event,
      ...(SEND_EVENTS.has(event) ? {
        lastOutboundApprovalId: sendCheckpoint.id,
        usedOutboundApprovalIds: [...new Set([...(Array.isArray(usedApprovalIds) ? usedApprovalIds : []),
          item.metadata?.lastOutboundApprovalId, sendCheckpoint.id].filter(Boolean))]
      } : {}),
      nextFollowUpAt: options.nextFollowUpAt ?? item.metadata?.nextFollowUpAt ?? null,
      lastTransitionAt: options.now || new Date().toISOString()
    }
  });
}

export function revenueStage(item) {
  return item?.metadata?.stage || null;
}
