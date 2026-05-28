import { deriveOpportunityFromSignal, rankOpportunities } from '../money/scoring.js';
import { collectDemandSignals } from '../money/sources.js';
import { buildMetaMarketExperimentPlan } from './meta-graph.js';
import { DEFAULT_GUN_PEERS, getNode } from './homepage-hero.js';

export const MARKET_PULSE_ROOT_PATH = Object.freeze([
  '3dvr-portal',
  'growth',
  'market-pulse',
]);
export const MARKET_PULSE_LATEST_PATH = Object.freeze([
  ...MARKET_PULSE_ROOT_PATH,
  'latest',
]);
export const MARKET_PULSE_RUNS_PATH = Object.freeze([
  ...MARKET_PULSE_ROOT_PATH,
  'runs',
]);
export const MARKET_PULSE_DIRECTORY_PATH = Object.freeze([
  ...MARKET_PULSE_ROOT_PATH,
  'directory',
]);

export const DEFAULT_MARKET_PULSE_PROFILE = Object.freeze({
  market: 'owner-led service businesses that need clearer lead follow-up',
  keywords: [
    'lead follow up',
    'client onboarding',
    'quote follow-up',
    'small business automation',
    'customer intake',
  ],
  channels: ['reddit', 'hackernews', 'facebook-groups', 'tiktok-comments', 'facebook-page', 'linkedin', 'email'],
  limit: 20,
});

const SOCIAL_PROBE_CHANNELS = Object.freeze([
  Object.freeze({
    id: 'facebook-groups',
    label: 'Facebook Groups',
    surface: 'group discussion',
    risk: 'external_write',
  }),
  Object.freeze({
    id: 'facebook-page',
    label: 'Facebook Page',
    surface: 'Meta Graph API page post',
    risk: 'external_write',
    integration: 'meta_graph_api',
  }),
  Object.freeze({
    id: 'reddit',
    label: 'Reddit',
    surface: 'subreddit research post',
    risk: 'external_write',
  }),
  Object.freeze({
    id: 'linkedin',
    label: 'LinkedIn',
    surface: 'founder post',
    risk: 'external_write',
  }),
  Object.freeze({
    id: 'tiktok-comments',
    label: 'TikTok comments',
    surface: 'comment search',
    risk: 'external_read',
  }),
]);

function normalizeText(value) {
  return String(value || '').trim();
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const output = [];
  values.forEach((value) => {
    const normalized = normalizeText(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return;
    seen.add(key);
    output.push(normalized);
  });
  return output;
}

function slugify(value, fallback = 'market') {
  const slug = normalizeText(value)
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return slug || fallback;
}

function makeRunId(date = new Date()) {
  return `market-pulse-${date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function parseList(value, fallback = []) {
  if (Array.isArray(value)) {
    return uniqueStrings(value);
  }
  const parsed = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length ? uniqueStrings(parsed) : [...fallback];
}

function normalizeProfile(input = {}) {
  return {
    market: normalizeText(input.market) || DEFAULT_MARKET_PULSE_PROFILE.market,
    keywords: parseList(input.keywords, DEFAULT_MARKET_PULSE_PROFILE.keywords),
    channels: parseList(input.channels, DEFAULT_MARKET_PULSE_PROFILE.channels),
    limit: Number.isFinite(Number(input.limit))
      ? Math.max(1, Math.min(Number(input.limit), 50))
      : DEFAULT_MARKET_PULSE_PROFILE.limit,
  };
}

function fallbackOpportunities(market) {
  return [
    {
      id: 'follow-up-operating-lane',
      title: `Follow-up operating lane for ${market}`,
      problem: `${market} teams lose qualified opportunities when follow-up, quoting, and reminders are spread across tools.`,
      audience: market,
      solution: 'A practical portal lane for intake, next steps, reminders, and weekly review.',
      mvp: 'Directory landing page + intake form + CRM handoff + follow-up reminder.',
      suggestedPrice: '$50/mo plus setup',
      painScore: 62,
      willingnessToPay: 58,
      speedToBuild: 76,
      competitionGap: 54,
      evidence: ['Fallback opportunity generated when live demand sources did not return enough data.'],
    },
  ];
}

function buildOpportunities({ signals = [], market = '' } = {}) {
  const raw = signals.length
    ? signals.slice(0, 10).map((signal, index) => deriveOpportunityFromSignal(signal, index, market))
    : fallbackOpportunities(market);
  return rankOpportunities(raw).slice(0, 6);
}

function confidenceLabel(score) {
  if (score >= 76) return 'high';
  if (score >= 62) return 'medium';
  return 'needs-evidence';
}

function offerForOpportunity(opportunity = {}) {
  const text = `${opportunity.title || ''} ${opportunity.problem || ''} ${opportunity.audience || ''}`.toLowerCase();
  if (/(team|clinic|support|handoff|intake|schedule)/.test(text)) {
    return 'Embedded monthly lane for intake, shared follow-up, and handoff cleanup.';
  }
  if (/(quote|lead|follow|proposal|client|service)/.test(text)) {
    return 'Builder setup for lead capture, quote follow-up, and CRM next steps.';
  }
  return 'Launch cleanup with one public path, one intake, and one follow-up loop.';
}

function evidenceFromOpportunity(opportunity = {}) {
  return Array.isArray(opportunity.evidence)
    ? opportunity.evidence.map((item) => normalizeText(item)).filter(Boolean).slice(0, 3)
    : [];
}

function channelConfig(channelId = '') {
  const normalized = normalizeText(channelId).toLowerCase();
  const known = SOCIAL_PROBE_CHANNELS.find((item) => item.id === normalized);
  if (known) return known;
  if (normalized === 'hackernews') {
    return {
      id: 'hackernews',
      label: 'Hacker News',
      surface: 'discussion thread',
      risk: 'external_read',
    };
  }
  return {
    id: normalized || 'unknown',
    label: normalized || 'Unknown',
    surface: 'market signal',
    risk: 'external_read',
  };
}

function buildResearchQuestion(opportunity = {}, channel = 'reddit') {
  const problem = normalizeText(opportunity.problem) || 'follow-up falling through after a lead comes in';
  const audience = normalizeText(opportunity.audience) || DEFAULT_MARKET_PULSE_PROFILE.market;

  if (channel === 'facebook-page') {
    return [
      `Question for people running ${audience}: what part of ${problem.toLowerCase()} is hardest to keep up with?`,
      'I am testing which real business problems have enough energy to build around. Replies, saves, clicks, and comments matter more than vanity likes.'
    ].join('\n\n');
  }

  if (channel === 'facebook-groups') {
    return [
      `For people running ${audience}: where does ${problem.toLowerCase()} show up in your week?`,
      'I am trying to understand the real workflow before building anything. What do you use now, and what is still annoying?'
    ].join('\n\n');
  }

  if (channel === 'linkedin') {
    return [
      `Question for ${audience}: what happens between a qualified inquiry and the next follow-up?`,
      `The pattern I am checking is: ${problem}`,
      'What breaks first: reminders, quoting, ownership, or context?'
    ].join('\n\n');
  }

  if (channel === 'tiktok-comments') {
    return [
      `Search comments around: "${opportunity.title || problem}"`,
      `Look for repeated complaints about ${problem.toLowerCase()}, paid workaround mentions, and comments asking for templates or tools.`
    ].join('\n\n');
  }

  return [
    `How are you handling ${problem.toLowerCase()}?`,
    `I am researching this for ${audience}. I am not trying to pitch yet; I want to know what people already tried, what failed, and what would be worth paying to avoid.`
  ].join('\n\n');
}

export function buildSocialProbeDrafts(opportunities = [], options = {}) {
  const channels = parseList(options.channels, ['facebook-groups', 'reddit', 'linkedin', 'tiktok-comments'])
    .filter((channel) => channel !== 'hackernews' && channel !== 'email')
    .slice(0, 4);
  const topOpportunities = opportunities.slice(0, 2);

  return channels.flatMap((channel) => {
    const config = channelConfig(channel);
    return topOpportunities.map((opportunity, index) => ({
      id: `${slugify(opportunity.title || opportunity.problem, 'social-probe')}-${config.id}`,
      channel: config.id,
      channelLabel: config.label,
      surface: config.surface,
      risk: config.risk,
      integration: config.integration || '',
      approvalStatus: config.risk === 'external_write' ? 'required' : 'ready',
      linkedOpportunityId: opportunity.id || '',
      title: opportunity.title || 'Market-fit probe',
      prompt: buildResearchQuestion(opportunity, config.id),
      successMetric: config.id === 'tiktok-comments'
        ? 'Find 10+ repeated comment-level pains and 3+ workaround mentions.'
        : 'Collect replies that describe a real workflow, current workaround, and willingness to pay.',
      reactionCheck: config.risk === 'external_write'
        ? 'After posting, paste the post URL and check reactions, comments, saves, and DMs within 24 hours.'
        : 'Capture comment counts, repeated phrases, creator niches, and links back into Market Pulse.',
      metaGraph: config.integration === 'meta_graph_api'
        ? buildMetaMarketExperimentPlan({
          experimentId: `${slugify(opportunity.title || opportunity.problem, 'social-probe')}-${config.id}`,
          message: buildResearchQuestion(opportunity, config.id),
          link: options.link,
          pageId: options.metaPageId,
          version: options.metaGraphVersion,
        })
        : null,
      priority: index + 1,
      generatedAt: options.generatedAt || new Date().toISOString(),
    }));
  });
}

function channelFromSignal(signal = {}) {
  const source = normalizeText(signal.source).toLowerCase();
  if (source.includes('reddit')) return 'reddit';
  if (source.includes('hackernews')) return 'hackernews';
  if (source.includes('meta') || source.includes('facebook-page') || source.includes('facebook page')) return 'facebook-page';
  if (source.includes('facebook')) return 'facebook-groups';
  if (source.includes('linkedin')) return 'linkedin';
  if (source.includes('tiktok')) return 'tiktok-comments';
  return source || 'unknown';
}

export function buildReactionSnapshots(signals = []) {
  const grouped = new Map();
  (Array.isArray(signals) ? signals : []).forEach((signal) => {
    const channel = channelFromSignal(signal);
    if (!grouped.has(channel)) {
      grouped.set(channel, {
        channel,
        channelLabel: channelConfig(channel)?.label || channel,
        signalCount: 0,
        reactionCount: 0,
        commentCount: 0,
        topSignalTitle: '',
        topSignalUrl: '',
        marketFitScore: 0,
      });
    }
    const current = grouped.get(channel);
    const popularity = Number(signal.popularity || 0);
    const comments = Number(signal.comments || 0);
    current.signalCount += 1;
    current.reactionCount += Math.max(0, popularity);
    current.commentCount += Math.max(0, comments);
    if (!current.topSignalTitle || (popularity + comments) > current.marketFitScore) {
      current.topSignalTitle = signal.title || '';
      current.topSignalUrl = signal.url || '';
    }
    current.marketFitScore = Math.min(100, Math.round(
      (Math.min(current.signalCount * 18, 45))
      + (Math.min(current.commentCount * 1.6, 35))
      + (Math.min(current.reactionCount * 0.25, 20))
    ));
  });

  return Array.from(grouped.values())
    .sort((left, right) => right.marketFitScore - left.marketFitScore)
    .slice(0, 6);
}

function buildMarketFitSummary({ opportunities = [], signals = [], reactionSnapshots = [] } = {}) {
  const topOpportunity = opportunities[0] || {};
  const topScore = Number(topOpportunity.score || 0);
  const signalPressure = Math.min(100, signals.length * 9);
  const commentPressure = Math.min(100, signals.reduce((sum, signal) => sum + Number(signal.comments || 0), 0) * 0.8);
  const channelDiversity = Math.min(100, reactionSnapshots.length * 22);
  const score = Math.round(
    (topScore * 0.5)
    + (signalPressure * 0.22)
    + (commentPressure * 0.18)
    + (channelDiversity * 0.1)
  );

  let verdict = 'searching';
  if (score >= 76) verdict = 'strong signal';
  else if (score >= 58) verdict = 'promising';
  else if (score >= 40) verdict = 'needs replies';

  return {
    score,
    verdict,
    strongestChannel: reactionSnapshots[0]?.channelLabel || '',
    nextAction: score >= 58
      ? 'Run the top social probe and collect reaction snapshots before packaging the offer.'
      : 'Broaden keyword search and ask lower-friction social questions before building.',
  };
}

export function buildDirectoryListings(opportunities = [], options = {}) {
  const generatedAt = normalizeText(options.generatedAt) || new Date().toISOString();
  return opportunities.map((opportunity) => {
    const confidenceScore = Number(opportunity.score || 0);
    const id = slugify(opportunity.title || opportunity.problem, 'directory-listing');
    const approvalStatus = confidenceScore >= 62 ? 'approved' : 'needs_review';
    return {
      id,
      title: opportunity.title,
      market: opportunity.audience || options.market || DEFAULT_MARKET_PULSE_PROFILE.market,
      pain: opportunity.problem,
      recommendedOffer: offerForOpportunity(opportunity),
      suggestedPrice: opportunity.suggestedPrice || '$50/mo starter',
      confidence: confidenceLabel(confidenceScore),
      confidenceScore,
      approvalStatus,
      approved: approvalStatus === 'approved',
      evidence: evidenceFromOpportunity(opportunity),
      updatedAt: generatedAt,
      source: 'market-pulse-cron',
    };
  });
}

function buildOutreachDrafts(opportunities = []) {
  return opportunities.slice(0, 4).map((opportunity) => ({
    id: `${slugify(opportunity.title, 'opportunity')}-outreach`,
    title: opportunity.title,
    channel: 'email-or-contact-form',
    risk: 'external_write',
    approvalStatus: 'required',
    subject: `A quick follow-up cleanup idea`,
    opener: opportunity.problem,
    body: [
      `I noticed a pattern around ${opportunity.audience || 'small teams'}: ${opportunity.problem}`,
      offerForOpportunity(opportunity),
      'Worth a short look this week?',
    ].join('\n\n'),
  }));
}

function buildTestPlans(opportunities = []) {
  const top = opportunities[0] || {};
  return [
    {
      id: 'homepage-hero',
      surface: 'marketing-site',
      metric: 'CTA click rate plus clarity feedback',
      approvalStatus: 'auto_when_enabled',
      action: 'Keep watching the homepage hero experiment and let the trusted cron promote a winner.',
    },
    {
      id: `${slugify(top.title || 'directory-positioning')}-directory`,
      surface: 'market-directory',
      metric: 'directory CTA clicks and qualified CRM handoffs',
      approvalStatus: 'draft',
      variants: [
        {
          id: 'a',
          angle: top.problem || 'Lead with the follow-up pain.',
        },
        {
          id: 'b',
          angle: top.solution || 'Lead with the operating lane offer.',
        },
      ],
    },
  ];
}

function buildSalesActions({ opportunities = [], outreachDrafts = [], directoryListings = [] } = {}) {
  const top = opportunities[0] || {};
  return [
    {
      id: 'approve-directory-refresh',
      label: 'Review public directory listings',
      risk: 'workspace_write',
      approvalStatus: directoryListings.some((item) => item.approvalStatus === 'needs_review') ? 'required' : 'approved',
      detail: `${directoryListings.filter((item) => item.approved).length} approved listings ready for the public directory.`,
    },
    {
      id: 'approve-outreach-batch',
      label: 'Approve outreach drafts',
      risk: 'external_write',
      approvalStatus: 'required',
      detail: `${outreachDrafts.length} drafts are ready but will not send without approval.`,
    },
    {
      id: 'approve-social-probes',
      label: 'Approve social probe posts',
      risk: 'external_write',
      approvalStatus: 'required',
      detail: 'Market-fit posts are drafted for review. Do not publish without human approval and the right account token.',
    },
    {
      id: 'build-top-offer',
      label: 'Package the top offer',
      risk: 'workspace_write',
      approvalStatus: 'draft',
      detail: top.title ? `${top.title} is the current top opportunity.` : 'No opportunity is strong enough yet.',
    },
  ];
}

export function buildMarketPulse(demand = {}, options = {}) {
  const now = typeof options.now === 'function' ? options.now() : new Date();
  const generatedAt = normalizeText(options.generatedAt) || now.toISOString();
  const profile = normalizeProfile(options.profile || options);
  const signals = Array.isArray(demand.signals) ? demand.signals : [];
  const warnings = Array.isArray(demand.warnings) ? demand.warnings.map(normalizeText).filter(Boolean) : [];
  const keywords = uniqueStrings([
    ...(Array.isArray(demand.keywords) ? demand.keywords : []),
    ...profile.keywords,
  ]).slice(0, 12);
  const opportunities = buildOpportunities({ signals, market: profile.market });
  const directoryListings = buildDirectoryListings(opportunities, {
    generatedAt,
    market: profile.market,
  });
  const outreachDrafts = buildOutreachDrafts(opportunities);
  const socialProbeDrafts = buildSocialProbeDrafts(opportunities, {
    channels: profile.channels,
    generatedAt,
  });
  const reactionSnapshots = buildReactionSnapshots(signals);
  const marketFit = buildMarketFitSummary({ opportunities, signals, reactionSnapshots });
  const tests = buildTestPlans(opportunities);
  const salesActions = buildSalesActions({ opportunities, outreachDrafts, directoryListings });

  return {
    runId: options.runId || makeRunId(now),
    generatedAt,
    profile: {
      ...profile,
      keywords,
    },
    signalsAnalyzed: signals.length,
    warnings,
    opportunities,
    topOpportunity: opportunities[0] || null,
    marketFit,
    directoryListings,
    outreachDrafts,
    socialProbeDrafts,
    reactionSnapshots,
    tests,
    salesActions,
    approvalsRequired: salesActions.filter((item) => item.approvalStatus === 'required').length
      + outreachDrafts.length
      + tests.filter((item) => item.approvalStatus === 'draft').length,
    automationPolicy: {
      marketResearch: 'Automatic when the market-pulse runner or scheduler executes.',
      socialListening: 'Automatic for supported public sources. Account-gated platforms require connected accounts or manual pasted URLs.',
      socialPosting: 'Draft only. Publishing and replies require human approval plus platform account authorization.',
      directory: 'Approved aggregate listings publish to the public directory node.',
      outreach: 'Draft only. Sending requires human approval.',
      website: 'Experiment winners can be promoted only by trusted cron or manual portal action.',
    },
  };
}

function onceNode(node) {
  return new Promise((resolve) => {
    if (!node || typeof node.once !== 'function') {
      resolve(undefined);
      return;
    }
    node.once((value) => resolve(value));
  });
}

function putNode(node, value) {
  return new Promise((resolve, reject) => {
    if (!node || typeof node.put !== 'function') {
      reject(new Error('Market pulse node is not writable.'));
      return;
    }
    node.put(value, (ack) => {
      if (ack?.err) {
        reject(new Error(String(ack.err)));
        return;
      }
      resolve(ack || {});
    });
  });
}

async function resolveGunImpl(explicitImpl) {
  if (explicitImpl) return explicitImpl;
  const moduleResult = await import('gun');
  if (typeof moduleResult?.default === 'function') return moduleResult.default;
  if (typeof moduleResult === 'function') return moduleResult;
  throw new Error('Unable to load Gun for market pulse cron.');
}

function parseJsonField(value, fallback = []) {
  try {
    const parsed = JSON.parse(String(value || ''));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (_error) {
    return fallback;
  }
}

function parseJsonObjectField(value, fallback = {}) {
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch (_error) {
    return fallback;
  }
}

export function serializeMarketPulseForGun(pulse = {}) {
  return {
    runId: pulse.runId || '',
    generatedAt: pulse.generatedAt || '',
    market: pulse.profile?.market || '',
    keywords: Array.isArray(pulse.profile?.keywords) ? pulse.profile.keywords.join(', ') : '',
    signalsAnalyzed: Number(pulse.signalsAnalyzed || 0),
    approvalsRequired: Number(pulse.approvalsRequired || 0),
    topOpportunityTitle: pulse.topOpportunity?.title || '',
    topOpportunityProblem: pulse.topOpportunity?.problem || '',
    topOpportunityScore: Number(pulse.topOpportunity?.score || 0),
    marketFitJson: JSON.stringify(pulse.marketFit || {}),
    approvedListingCount: Array.isArray(pulse.directoryListings)
      ? pulse.directoryListings.filter((item) => item.approved).length
      : 0,
    warningsJson: JSON.stringify(pulse.warnings || []),
    opportunitiesJson: JSON.stringify(pulse.opportunities || []),
    directoryListingsJson: JSON.stringify(pulse.directoryListings || []),
    outreachDraftsJson: JSON.stringify(pulse.outreachDrafts || []),
    socialProbeDraftsJson: JSON.stringify(pulse.socialProbeDrafts || []),
    reactionSnapshotsJson: JSON.stringify(pulse.reactionSnapshots || []),
    testsJson: JSON.stringify(pulse.tests || []),
    salesActionsJson: JSON.stringify(pulse.salesActions || []),
    automationPolicyJson: JSON.stringify(pulse.automationPolicy || {}),
  };
}

export function deserializeMarketPulseFromGun(record = {}) {
  return {
    runId: normalizeText(record.runId),
    generatedAt: normalizeText(record.generatedAt),
    profile: {
      market: normalizeText(record.market),
      keywords: parseList(record.keywords, []),
    },
    signalsAnalyzed: Number(record.signalsAnalyzed || 0),
    approvalsRequired: Number(record.approvalsRequired || 0),
    topOpportunity: {
      title: normalizeText(record.topOpportunityTitle),
      problem: normalizeText(record.topOpportunityProblem),
      score: Number(record.topOpportunityScore || 0),
    },
    marketFit: parseJsonObjectField(record.marketFitJson, {}),
    warnings: parseJsonField(record.warningsJson),
    opportunities: parseJsonField(record.opportunitiesJson),
    directoryListings: parseJsonField(record.directoryListingsJson),
    outreachDrafts: parseJsonField(record.outreachDraftsJson),
    socialProbeDrafts: parseJsonField(record.socialProbeDraftsJson),
    reactionSnapshots: parseJsonField(record.reactionSnapshotsJson),
    tests: parseJsonField(record.testsJson),
    salesActions: parseJsonField(record.salesActionsJson),
    automationPolicy: parseJsonObjectField(record.automationPolicyJson, {}),
  };
}

export async function createMarketPulseClient(options = {}) {
  const GunImpl = await resolveGunImpl(options.GunImpl);
  const peers = parseList(options.peers || options.gunPeers || options.config?.GROWTH_GUN_PEERS, DEFAULT_GUN_PEERS);
  const gun = options.gun || GunImpl({
    peers,
    localStorage: false,
    radisk: false,
    file: false,
    multicast: false,
    axe: false,
  });
  const latestNode = getNode(gun, MARKET_PULSE_LATEST_PATH);
  const runsNode = getNode(gun, MARKET_PULSE_RUNS_PATH);
  const directoryNode = getNode(gun, MARKET_PULSE_DIRECTORY_PATH);

  return {
    async readLatest() {
      return deserializeMarketPulseFromGun(await onceNode(latestNode));
    },
    async writePulse(pulse) {
      const latestRecord = serializeMarketPulseForGun(pulse);
      await putNode(latestNode, latestRecord);
      await putNode(runsNode.get(pulse.runId), latestRecord);
      const approvedListings = (pulse.directoryListings || []).filter((item) => item.approved);
      for (const listing of approvedListings) {
        await putNode(directoryNode.get(listing.id), listing);
      }
      return {
        runId: pulse.runId,
        directoryListingsPublished: approvedListings.length,
      };
    },
  };
}

export async function runMarketPulseCycle(options = {}) {
  const profile = normalizeProfile(options.profile || options);
  const demandCollector = options.collectDemandSignalsImpl || collectDemandSignals;
  const demand = options.demand || await demandCollector({
    ...profile,
    fetchImpl: options.fetchImpl || globalThis.fetch,
  });
  const pulse = buildMarketPulse(demand, {
    ...options,
    profile,
  });
  const dryRun = Boolean(options.dryRun);
  const client = options.client || (dryRun ? null : await createMarketPulseClient(options));
  let persist = {
    skipped: true,
    reason: dryRun ? 'dry run' : 'client unavailable',
    directoryListingsPublished: 0,
  };

  if (!dryRun && client) {
    persist = await client.writePulse(pulse);
  }

  return {
    ...pulse,
    dryRun,
    persist,
  };
}
