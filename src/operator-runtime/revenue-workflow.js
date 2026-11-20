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
  // Never authorize an external send from lead classification or business hours alone.
  // A separate send adapter must verify a recorded, message-specific human approval.
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

  return { decision: 'approval', reason: 'Fresh direct-email outreach requires recorded human approval before sending.' };
}

export function createRevenueLeadWorkItem(input = {}) {
  const leadName = typeof input.leadName === 'string' ? input.leadName.trim() : '';
  const title = input.title || `Revenue opportunity${leadName ? ` · ${leadName}` : ''}`;
  const now = input.now || new Date().toISOString();

  // No trusted payment-provider adapter exists to authenticate a won result.
  // A freshly constructed item must not bypass the payment_received guard by
  // claiming a paid stage directly; historical paid imports need verification.
  if (input.stage === 'won') {
    throw new TypeError('won revenue stage requires an authenticated payment provider adapter');
  }

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

export function advanceRevenueLead(item, event, options = {}) {
  const stage = item?.metadata?.stage;
  if (!REVENUE_STAGES.includes(stage)) throw new TypeError(`unknown revenue stage: ${stage || 'missing'}`);

  const transition = TRANSITIONS[stage]?.[event];
  if (!transition) throw new TypeError(`event ${event} is not valid from revenue stage ${stage}`);

  // A follow-up cannot become due merely because an agent says it is due,
  // or because it supplies a new due date in the transition call. Require an
  // already scheduled reminder that has actually reached its due time.
  // Callers that supply a test clock must be trusted by their event adapter.
  if (event === 'follow_up_due') {
    const scheduledAt = item.metadata?.nextFollowUpAt;
    const observedAt = options.now ?? new Date().toISOString();
    if (typeof scheduledAt !== 'string' || !Number.isFinite(Date.parse(scheduledAt))
      || typeof observedAt !== 'string' || !Number.isFinite(Date.parse(observedAt))
      || Date.parse(scheduledAt) > Date.parse(observedAt)) {
      throw new TypeError('follow_up_due requires a previously scheduled reminder at or before now');
    }
  }

  const [nextStage, nextState] = transition;
  const evidence = [...(item.evidence || [])];
  // External actions are records of things that happened, not requested actions.
  // Require a distinct receipt before marking a message sent, a reply received,
  // or a lead won. Adapters must authenticate external provider evidence.
  // Receipt structure does not verify signatures: provider/webhook adapters must
  // authenticate their inputs before calling this state transition.
  if (['outreach_sent', 'follow_up_sent', 'proposal_sent', 'reply_received', 'payment_received'].includes(event)) {
    const receipt = options.evidence;
    if (!receipt || typeof receipt !== 'object' || typeof receipt.id !== 'string' || !receipt.id.trim()) {
      throw new TypeError(`${event} requires an external receipt with a stable id`);
    }
    if (evidence.some(prior => prior?.id === receipt.id)) {
      throw new TypeError('external receipt id has already been recorded for this lead');
    }
    // A generic note, research artifact, inbound reply or payment intent is
    // not evidence that a provider sent an external message. This is a shape
    // check only; sender adapters must still authenticate provider receipts.
    if (['outreach_sent', 'follow_up_sent', 'proposal_sent'].includes(event)
      && !['email', 'provider_send'].includes(receipt.type)) {
      throw new TypeError(`${event} requires a provider send receipt`);
    }
    if (event === 'reply_received') {
      // A proposed reply must refer to a message already recorded as sent for
      // this lead. Never turn an unverified narrative into a CRM reply event.
      // The provider adapter, not this pure state machine, authenticates it.
      const validReply = receipt.type === 'provider_reply'
        && typeof receipt.provider === 'string' && Boolean(receipt.provider.trim())
        && typeof receipt.inReplyToId === 'string' && Boolean(receipt.inReplyToId.trim())
        && evidence.some(prior => prior?.id === receipt.inReplyToId
          && ['email', 'provider_send'].includes(prior?.type));
      if (!validReply) {
        throw new TypeError('reply_received requires a provider reply receipt linked to an earlier send');
      }
    }
    if (event === 'payment_received') {
      const valid = receipt.type === 'provider_payment'
        && typeof receipt.provider === 'string' && receipt.provider.trim()
        && typeof receipt.invoiceId === 'string' && receipt.invoiceId.trim()
        && receipt.leadId === item.id
        && Number.isSafeInteger(receipt.amountCents) && receipt.amountCents > 0
        && typeof receipt.currency === 'string' && /^[A-Z]{3}$/.test(receipt.currency)
        && options.result?.amountCents === receipt.amountCents
        && options.result?.currency === receipt.currency;
      if (!valid) throw new TypeError('payment_received requires a matching provider receipt, lead and amount');
      // Shape checks are not payment authentication. No trusted payment webhook
      // adapter currently supplies a non-forgeable completion receipt here.
      // Do not mark a lead won from caller-authored fields until such an
      // adapter is implemented and separately verified.
      throw new TypeError('payment_received requires an authenticated payment provider adapter');
    }
  }
  if (options.evidence) evidence.push(options.evidence);

  // A reply, consumed due reminder, or sent follow-up supersedes the prior
  // reminder. Closed and paid leads must never retain a stale sales nudge,
  // even when a caller passes a new date with the terminal event.
  const nextFollowUpAt = ['won', 'lost'].includes(nextStage)
    ? null
    : Object.hasOwn(options, 'nextFollowUpAt')
      ? options.nextFollowUpAt
      : ['reply_received', 'follow_up_due', 'follow_up_sent'].includes(event)
        ? null
        : item.metadata?.nextFollowUpAt ?? null;

  return transitionWorkItem(item, nextState, {
    now: options.now,
    evidence,
    result: options.result ?? item.result,
    humanCheckpoint: options.humanCheckpoint ?? item.humanCheckpoint,
    metadata: {
      stage: nextStage,
      lastEvent: event,
      nextFollowUpAt,
      lastTransitionAt: options.now || new Date().toISOString()
    }
  });
}

export function revenueStage(item) {
  return item?.metadata?.stage || null;
}
