export const MESSAGE_RISK_LEVELS = Object.freeze({
  GREEN: 'GREEN',
  YELLOW: 'YELLOW',
  RED: 'RED'
});

export const REVIEW_ACTIONS = Object.freeze([
  'approve-send',
  'edit',
  'skip',
  'ban-lead',
  'save-later'
]);

const LOW_RISK_MESSAGE_TYPES = new Set([
  'thank-you',
  'reminder',
  'opt-in-confirmation',
  'existing-contact-follow-up'
]);

const LOW_RISK_RELATIONSHIPS = new Set([
  'existing-contact',
  'customer',
  'subscriber',
  'warm',
  'inbound',
  'referral',
  'opted-in'
]);

const PRICE_PATTERN = /\$\s?\d+|\b\d+\s?(?:usd|dollars?)\b|\/mo\b|per month|pricing|price|cost|checkout|billing|stripe/i;
const PROMISE_PATTERN = /\b(guarantee|guaranteed|promise|will make you|make you money|double your|triple your|rank #?1|risk-free|no risk|results guaranteed)\b/i;
const LEGAL_PATTERN = /\b(legal|lawyer|attorney|contract|liability|compliance|tax advice|investment advice|financial advice|medical advice)\b/i;
const SENSITIVE_PATTERN = /\b(health condition|diagnosis|therapy|trauma|debt|bankruptcy|ssn|social security|password|private|confidential|adult|sexual)\b/i;
const OPT_OUT_PATTERN = /\b(unsubscribe|opt out|stop receiving|reply stop|no more emails)\b/i;
const DECEPTIVE_SUBJECT_PATTERN = /\b(re:|fwd:|urgent account|invoice due|payment failed|final notice)\b/i;

function cleanText(value) {
  return String(value || '').trim();
}

function includesPattern(value, pattern) {
  return pattern.test(cleanText(value));
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function normalizeRelationship(value = '') {
  return cleanText(value).toLowerCase();
}

function normalizeMessageType(value = '') {
  return cleanText(value).toLowerCase();
}

function normalizeLeadTemperature(value = '') {
  const normalized = cleanText(value).toLowerCase();
  if (['cold', 'warm', 'hot', 'existing', 'inbound', 'customer', 'subscriber'].includes(normalized)) {
    return normalized;
  }
  return 'cold';
}

export function assessMessageRisk(input = {}) {
  const subject = cleanText(input.subject);
  const body = cleanText(input.body || input.message);
  const leadTemperature = normalizeLeadTemperature(input.leadTemperature || input.temperature);
  const relationship = normalizeRelationship(input.relationship || input.source);
  const messageType = normalizeMessageType(input.messageType || input.type);
  const commercial = Boolean(input.commercial ?? true);
  const preApprovedTemplate = Boolean(input.preApprovedTemplate);
  const hasOptOut = Boolean(input.hasOptOut) || includesPattern(body, OPT_OUT_PATTERN);
  const claimsUncertain = Boolean(input.claimsUncertain || input.uncertainClaim);

  const signals = [];
  const safeguards = [];
  let score = 0;

  if (!subject) {
    score += 1;
    signals.push('Missing subject line.');
  } else if (includesPattern(subject, DECEPTIVE_SUBJECT_PATTERN)) {
    score += 4;
    signals.push('Subject may look deceptive or pressure-based.');
  } else {
    safeguards.push('Subject line is present and can be reviewed for accuracy.');
  }

  if (leadTemperature === 'cold') {
    score += 2;
    signals.push('Lead is cold, so human review is required before first contact.');
  }

  if (claimsUncertain) {
    score += 2;
    signals.push('Message includes an uncertain claim or unverified context.');
  }

  if (includesPattern(`${subject}\n${body}`, PRICE_PATTERN)) {
    score += 2;
    signals.push('Message references pricing, checkout, billing, or money.');
  }

  if (includesPattern(body, PROMISE_PATTERN)) {
    score += 4;
    signals.push('Message includes a strong promise or outcome claim.');
  }

  if (includesPattern(body, LEGAL_PATTERN)) {
    score += 4;
    signals.push('Message includes legal, tax, medical, financial, or compliance language.');
  }

  if (includesPattern(body, SENSITIVE_PATTERN)) {
    score += 4;
    signals.push('Message includes sensitive personal or private details.');
  }

  if (commercial && leadTemperature === 'cold' && !hasOptOut) {
    score += 2;
    signals.push('Cold commercial message needs a clear opt-out path before sending.');
  }

  if (commercial) {
    safeguards.push('Commercial email should use accurate sender identity and a non-deceptive subject.');
    if (hasOptOut) safeguards.push('Opt-out language is present.');
    else safeguards.push('Opt-out language is missing or must be added before sending.');
  }

  const lowRiskContext = preApprovedTemplate
    && LOW_RISK_MESSAGE_TYPES.has(messageType)
    && (LOW_RISK_RELATIONSHIPS.has(relationship) || LOW_RISK_RELATIONSHIPS.has(leadTemperature))
    && !claimsUncertain
    && !includesPattern(`${subject}\n${body}`, PRICE_PATTERN)
    && !includesPattern(body, PROMISE_PATTERN)
    && !includesPattern(body, LEGAL_PATTERN)
    && !includesPattern(body, SENSITIVE_PATTERN);

  let riskLevel = MESSAGE_RISK_LEVELS.YELLOW;
  if (score > 4) riskLevel = MESSAGE_RISK_LEVELS.RED;
  else if (score <= 0 && lowRiskContext) riskLevel = MESSAGE_RISK_LEVELS.GREEN;

  const requiresReview = riskLevel !== MESSAGE_RISK_LEVELS.GREEN;
  const canAutoSend = riskLevel === MESSAGE_RISK_LEVELS.GREEN && lowRiskContext;

  return {
    riskLevel,
    score,
    requiresReview,
    canAutoSend,
    signals: unique(signals),
    safeguards: unique(safeguards),
    explanation: unique([
      riskLevel === MESSAGE_RISK_LEVELS.GREEN
        ? 'GREEN: pre-approved low-risk relationship message.'
        : riskLevel === MESSAGE_RISK_LEVELS.RED
          ? 'RED: trust-sensitive content needs human review and likely editing.'
          : 'YELLOW: useful draft, but human review is required before sending.',
      ...signals
    ]).join(' '),
    compliance: {
      accurateSenderIdentity: Boolean(input.accurateSenderIdentity ?? true),
      nonDeceptiveSubject: !includesPattern(subject, DECEPTIVE_SUBJECT_PATTERN),
      optOutRequired: commercial && leadTemperature === 'cold',
      optOutPresent: hasOptOut,
      noMisleadingClaims: !includesPattern(body, PROMISE_PATTERN),
      notes: unique(safeguards)
    }
  };
}

export function createMessageReviewItem(input = {}) {
  const id = cleanText(input.id) || `review-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const assessment = assessMessageRisk(input);
  const now = new Date().toISOString();
  return {
    id,
    leadId: cleanText(input.leadId),
    leadName: cleanText(input.leadName || input.name || 'Unknown lead'),
    leadContact: cleanText(input.leadContact || input.email || input.contact),
    leadTemperature: normalizeLeadTemperature(input.leadTemperature || input.temperature),
    offer: cleanText(input.offer || '3DVR support'),
    subject: cleanText(input.subject),
    body: cleanText(input.body || input.message),
    whyGenerated: cleanText(input.whyGenerated || 'Money Printer found a possible next business action.'),
    whyLeadRelevant: cleanText(input.whyLeadRelevant || input.relevance || 'Lead appears connected to the selected market or sprint.'),
    offerConnection: cleanText(input.offerConnection || `Connects to ${cleanText(input.offer || 'the current 3DVR offer')}.`),
    riskLevel: assessment.riskLevel,
    riskScore: assessment.score,
    riskExplanation: assessment.explanation,
    safeguards: assessment.safeguards,
    compliance: assessment.compliance,
    canAutoSend: assessment.canAutoSend,
    requiresReview: assessment.requiresReview,
    status: cleanText(input.status) || (assessment.canAutoSend && input.autoSendEligible ? 'auto-send-eligible' : 'queued'),
    actions: REVIEW_ACTIONS,
    createdAt: cleanText(input.createdAt) || now,
    updatedAt: cleanText(input.updatedAt) || now
  };
}

export function seedTrustReviewQueue() {
  return [
    createMessageReviewItem({
      id: 'review-woolleys-gutter-experts',
      leadId: 'follow-up-leak-woolleys-gutter-experts',
      leadName: "Woolley's Gutter Experts",
      leadContact: 'woolleysgutterexperts@hotmail.com',
      leadTemperature: 'cold',
      offer: 'Simple page + intake + follow-up desk',
      subject: 'Quick idea for gutter estimate follow-up',
      body: `Hi Josh,

I saw Woolley's focuses on seamless rain gutter installs, cleaning, guards, and free estimates around San Diego County.

Quick question: do estimate requests ever get hard to track once they come in from calls, the site, Facebook, or referrals?

I am testing a simple 3DVR setup for local service businesses: one clean intake path and a small follow-up desk so quote requests do not disappear in texts, emails, or notes.

If you send one service you want more estimates for, I can sketch the first simple follow-up path.

Thomas
3dvr.tech

If this is not useful, reply and I will not follow up.`,
      whyGenerated: 'Follow-Up Leak Sprint selected quote-driven local services as the current money path.',
      whyLeadRelevant: 'Gutter work is estimate-driven, local, and likely depends on fast quote follow-up.',
      offerConnection: 'Connects to the Follow-Up Leak Sprint offer: simple page, intake path, and follow-up desk.',
      hasOptOut: true,
      accurateSenderIdentity: true
    }),
    createMessageReviewItem({
      id: 'review-rkc-construction',
      leadId: 'follow-up-leak-rkc-construction',
      leadName: 'RKC Construction',
      leadContact: 'info@rkcconstruction.com',
      leadTemperature: 'cold',
      offer: 'Simple page + intake + follow-up desk',
      subject: 'Quick idea for patio project follow-up',
      body: `Hi RKC team,

I saw RKC handles patio covers, pergolas, sunrooms, enclosures, and outdoor living projects across San Diego County.

Quick question: when someone clicks Get a Quote, where does follow-up usually get hardest: first response, choosing the right service, financing questions, or keeping the project moving?

I am testing a simple 3DVR setup for contractors: a clear intake path plus a small follow-up desk so quote requests and project next steps do not get buried.

Thomas
3dvr.tech

If this is not useful, reply and I will not follow up.`,
      whyGenerated: 'Market Pulse scored owner-led services with quote follow-up leaks as a strong signal.',
      whyLeadRelevant: 'Construction projects have quote, financing, scheduling, and follow-up steps.',
      offerConnection: 'Connects to a contractor follow-up desk that keeps requests visible.',
      hasOptOut: true,
      accurateSenderIdentity: true
    }),
    createMessageReviewItem({
      id: 'review-existing-thank-you',
      leadId: 'existing-customer-demo',
      leadName: 'Existing 3DVR contact',
      leadTemperature: 'warm',
      relationship: 'existing-contact',
      messageType: 'thank-you',
      preApprovedTemplate: true,
      commercial: false,
      offer: 'Customer follow-up',
      subject: 'Thanks for the update',
      body: 'Thanks for the update. I saved this and will follow up with the next clear step.',
      whyGenerated: 'Existing contact sent an update that needs a short acknowledgement.',
      whyLeadRelevant: 'Existing relationship and no commercial claim.',
      offerConnection: 'Keeps fulfillment and follow-up moving without a sales pitch.',
      accurateSenderIdentity: true,
      autoSendEligible: true
    })
  ];
}
