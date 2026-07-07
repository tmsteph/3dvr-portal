import { createMessageReviewItem } from './messageReview.js';

export const DEFAULT_PROJECT_PORTFOLIO = Object.freeze([
  {
    id: 'portal',
    name: '3DVR Portal',
    surface: 'portal.3dvr.tech',
    capability: 'single front door for purpose, projects, apps, CRM, and Money Printer',
    moneyUse: 'routes a scattered person or small business owner to one useful next action',
    proof: ['live portal', 'review queue', 'Daily Direction', 'Forge', 'CRM']
  },
  {
    id: 'crm',
    name: '3DVR CRM',
    surface: 'portal.3dvr.tech/crm/',
    capability: 'track people, notes, opportunities, drafts, and follow-up',
    moneyUse: 'prevents leads and replies from disappearing',
    proof: ['contact import', 'draft lead URLs', 'sales handoff tests']
  },
  {
    id: 'money-printer',
    name: 'Money Printer',
    surface: 'portal.3dvr.tech/money-printer/',
    capability: 'market research, offer drafts, trust review, and safe autonomous PR loops',
    moneyUse: 'turns daily business attention into reviewed actions',
    proof: ['risk engine', 'review queue', 'operator auto-merge loop']
  },
  {
    id: 'project-desk',
    name: 'Project Desk',
    surface: '3dvr.tech',
    capability: 'simple page, intake, payment path, and follow-up system',
    moneyUse: 'sellable $20/month or setup sprint offer for real people with messy projects',
    proof: ['public site', 'billing plan docs', 'project desk roadmap']
  },
  {
    id: 'launch-room',
    name: 'Launch Room',
    surface: 'portal.3dvr.tech/launch-room/',
    capability: 'organize an idea into a launch path',
    moneyUse: 'warms up people who are not ready to buy a website yet',
    proof: ['launch room app', 'Forge route', 'Movement Brief flow']
  }
]);

export const DEFAULT_MARKET_SEGMENTS = Object.freeze([
  {
    id: 'local-services',
    label: 'owner-led local service businesses',
    pain: 'quote requests, texts, referrals, and follow-ups get scattered',
    willingness: 5,
    reachable: 4,
    fit: 5,
    offer: '3DVR Quick Desk',
    price: '$20/month after a simple setup',
    ask: 'Can I sketch a one-page intake and follow-up path for your business?'
  },
  {
    id: 'creators-builders',
    label: 'creators and builders with scattered ideas',
    pain: 'they have ideas but no clear page, next step, or follow-up rhythm',
    willingness: 3,
    reachable: 5,
    fit: 4,
    offer: '3DVR Idea Desk',
    price: 'free first pass, optional $5/month support',
    ask: 'Want me to turn one messy idea into a page and next-step checklist?'
  },
  {
    id: 'freelancers-agencies',
    label: 'freelancers and tiny agencies',
    pain: 'lead follow-up, proposals, and client onboarding live in too many places',
    willingness: 4,
    reachable: 3,
    fit: 5,
    offer: '3DVR Follow-Up Desk',
    price: '$50/month for managed follow-up setup',
    ask: 'Would one clean lead-to-follow-up desk save you time this week?'
  }
]);

function scoreSegment(segment = {}) {
  return Number(segment.willingness || 0) * 3
    + Number(segment.fit || 0) * 2
    + Number(segment.reachable || 0);
}

function isoDate(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.valueOf()) ? new Date().toISOString() : date.toISOString();
}

function pickTopSegment(segments = DEFAULT_MARKET_SEGMENTS) {
  return [...segments].sort((left, right) => scoreSegment(right) - scoreSegment(left))[0];
}

function projectNames(projects = []) {
  return projects.map(project => project.name).filter(Boolean);
}

function buildOfferSummary(segment, projects) {
  const support = projectNames(projects).slice(0, 3).join(', ');
  return {
    name: segment.offer,
    price: segment.price,
    buyer: segment.label,
    pain: segment.pain,
    promise: `Set up one simple place to be found, contacted, followed up with, and moved to the next step.`,
    proof: support ? `Built from existing 3DVR pieces: ${support}.` : 'Built from existing 3DVR portal tools.',
    ask: segment.ask
  };
}

function buildDailyActions(segment, offer) {
  return [
    `Pick 3 warm or reachable ${segment.label} contacts.`,
    `Send only review-queued drafts for ${offer.name}; do not send cold messages automatically.`,
    'Use one reply as the product signal: what part of their follow-up or project flow hurts this week?',
    'If someone says yes, offer the smallest paid path: page + intake + follow-up desk.'
  ];
}

function buildMessageDrafts(segment, offer, generatedAt) {
  const base = {
    leadTemperature: 'warm',
    offer: `${offer.name} (${offer.price})`,
    createdAt: generatedAt,
    updatedAt: generatedAt,
    hasOptOut: true,
    accurateSenderIdentity: true,
    whyGenerated: `CEO brief selected ${segment.label} as the highest-fit money path for today.`,
    offerConnection: `Connects to ${offer.name}: ${offer.promise}`
  };

  return [
    createMessageReviewItem({
      ...base,
      id: 'ceo-brief-warm-friend-project-desk',
      leadId: 'warm-friend-project-desk',
      leadName: 'Warm friend with a project',
      leadContact: 'manual-review-needed',
      relationship: 'warm',
      subject: 'Can I test a simple 3DVR setup with you?',
      body: `I am testing a small 3DVR setup for people who feel scattered but want one useful next step.

The simple version is: one page, one intake path, and one follow-up place so the project does not disappear.

Would you let me try this with one idea or project you already have?

If not, no worries. I will not keep asking.`,
      whyLeadRelevant: 'Warm personal contact is safer than cold outreach and can give fast product feedback.'
    }),
    createMessageReviewItem({
      ...base,
      id: 'ceo-brief-local-service-quick-desk',
      leadId: 'local-service-quick-desk',
      leadName: 'Local service owner',
      leadContact: 'manual-research-needed',
      leadTemperature: 'cold',
      relationship: 'public-business',
      subject: 'Quick idea for estimate follow-up',
      body: `I am testing ${offer.name} for ${segment.label}.

The problem I am checking is simple: ${segment.pain}.

Would it be useful if I sketched a simple page, intake form, and follow-up desk for one service you want more inquiries for?

If this is not useful, reply and I will not follow up.`,
      whyLeadRelevant: 'Local service businesses often lose money when estimate requests are scattered.'
    }),
    createMessageReviewItem({
      ...base,
      id: 'ceo-brief-creator-idea-desk',
      leadId: 'creator-idea-desk',
      leadName: 'Creator or builder with scattered ideas',
      leadContact: 'manual-review-needed',
      relationship: 'warm',
      subject: 'Want help turning one messy idea into a next step?',
      body: `I am testing a free 3DVR flow: sort one messy thought, pick one next step, and turn it into a tiny project page if it has energy.

Want to send me one messy idea and let me turn it into the first simple version?

If it helps, there is an optional $5/month support path later, but the first pass is free.`,
      whyLeadRelevant: 'Creators and builders are reachable now and match the free-to-low-price 3DVR doorway.'
    })
  ];
}

export function generateCeoMarketBrief(options = {}) {
  const generatedAt = isoDate(options.date || new Date());
  const projects = Array.isArray(options.projects) && options.projects.length
    ? options.projects
    : [...DEFAULT_PROJECT_PORTFOLIO];
  const segments = Array.isArray(options.segments) && options.segments.length
    ? options.segments
    : [...DEFAULT_MARKET_SEGMENTS];
  const topSegment = pickTopSegment(segments);
  const offer = buildOfferSummary(topSegment, projects);
  const messageDrafts = buildMessageDrafts(topSegment, offer, generatedAt);

  return {
    generatedAt,
    role: 'operator-ceo',
    decision: `Focus today on ${topSegment.label}.`,
    topSegment: {
      ...topSegment,
      score: scoreSegment(topSegment)
    },
    offer,
    projectLeverage: projects.map(project => ({
      id: project.id,
      name: project.name,
      moneyUse: project.moneyUse,
      surface: project.surface
    })),
    dailyActions: buildDailyActions(topSegment, offer),
    reviewQueueDrafts: messageDrafts,
    blockedActions: [
      'Do not send cold outreach automatically.',
      'Do not claim guaranteed income.',
      'Do not touch Stripe, billing, auth, secrets, deployment, or schedulers.',
      'Do not buy ads or spend money without Thomas.'
    ],
    nextOperatorMove: 'Queue these drafts for Thomas review, then use any reply to refine the paid Quick Desk offer.'
  };
}

export function buildCeoMarketBriefMarkdown(brief = generateCeoMarketBrief()) {
  const drafts = Array.isArray(brief.reviewQueueDrafts) ? brief.reviewQueueDrafts : [];
  return `# Money Printer CEO Market Brief

Generated: ${brief.generatedAt}

## Decision

${brief.decision}

## Offer

- name: ${brief.offer?.name || ''}
- buyer: ${brief.offer?.buyer || ''}
- price: ${brief.offer?.price || ''}
- pain: ${brief.offer?.pain || ''}
- promise: ${brief.offer?.promise || ''}
- proof: ${brief.offer?.proof || ''}
- ask: ${brief.offer?.ask || ''}

## Today's Actions

${(brief.dailyActions || []).map(action => `- ${action}`).join('\n')}

## Review Queue Drafts

${drafts.map(item => `### ${item.leadName}

- risk: ${item.riskLevel}
- subject: ${item.subject}
- why: ${item.whyGenerated}
- relevance: ${item.whyLeadRelevant}
- action: review before sending
`).join('\n')}

## Blocked

${(brief.blockedActions || []).map(action => `- ${action}`).join('\n')}

## Next Operator Move

${brief.nextOperatorMove}
`;
}
