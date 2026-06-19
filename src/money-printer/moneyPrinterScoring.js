import { DEFAULT_MISSION } from './moneyPrinterTypes.js';

// Core scoring and idea generation logic for money-printer-core.
// This module is intentionally pure so the future CLI and daemon can run it in Node without browser globals.

export function normalizeMission(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ') || DEFAULT_MISSION;
}

export function titleCase(value = '') {
  return String(value)
    .split(/\s+/)
    .filter(Boolean)
    .map(word => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

export function slugify(value = '', fallback = 'item') {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `${fallback}-${Math.random().toString(36).slice(2, 8)}`;
}

export function inferPrimaryCustomer(mission = DEFAULT_MISSION) {
  const normalized = normalizeMission(mission).toLowerCase();
  if (normalized.includes('local') || normalized.includes('small business')) {
    return 'local service businesses with urgent demand and outdated systems';
  }
  if (normalized.includes('creator') || normalized.includes('content')) {
    return 'creators who already have audience trust but weak monetization systems';
  }
  if (normalized.includes('developer') || normalized.includes('builder') || normalized.includes('founder')) {
    return 'independent builders trying to turn skill into repeatable revenue';
  }
  if (normalized.includes('real estate')) {
    return 'real estate operators losing leads to slow follow-up and weak listing funnels';
  }
  if (normalized.includes('health') || normalized.includes('wellness')) {
    return 'wellness operators who need clearer offers, bookings, and retention loops';
  }
  return 'busy operators with visible pain, reachable inboxes, and money already in motion';
}

export function inferMarketPhrase(mission = DEFAULT_MISSION) {
  const cleaned = normalizeMission(mission);
  const afterFor = cleaned.match(/\bfor\s+(.+)$/i)?.[1];
  if (afterFor) {
    return afterFor.replace(/[.?!]+$/, '');
  }
  return inferPrimaryCustomer(cleaned);
}

export function inferCustomerSegments(mission = DEFAULT_MISSION) {
  const primary = inferPrimaryCustomer(mission);
  return [
    primary,
    'solo founders with strong skills and weak distribution',
    'small teams that need validated offers before they build software'
  ];
}

export function scoreBusinessIdea(idea = {}) {
  const signals = {
    urgentPain: idea.urgent_pain_score || 3,
    reachableBuyer: idea.reachable_buyer_score || 3,
    simpleFirstOffer: idea.simple_first_offer_score || 3,
    lowBuildCost: idea.low_build_cost_score || 3,
    clearDistribution: idea.clear_distribution_score || 3,
    fastFirstDollar: idea.speed_to_cash_score || 3,
    founderAdvantage: idea.founder_fit_score || 3,
    softwareLater: idea.software_later_score || 3
  };

  const weighted = (
    signals.urgentPain * 1.45
    + signals.reachableBuyer * 1.25
    + signals.simpleFirstOffer * 1.15
    + signals.lowBuildCost * 1
    + signals.clearDistribution * 1.2
    + signals.fastFirstDollar * 1.4
    + signals.founderAdvantage * 1.05
    + signals.softwareLater * 0.85
  );
  const maxWeighted = 5 * (1.45 + 1.25 + 1.15 + 1 + 1.2 + 1.4 + 1.05 + 0.85);
  const totalScore = Math.round((weighted / maxWeighted) * 100);
  const recommendation = totalScore >= 74 ? 'test' : totalScore >= 58 ? 'hold' : 'kill';

  return {
    ...idea,
    scoring: signals,
    total_score: totalScore,
    recommendation
  };
}

export function scoreBusinessIdeas(ideas = []) {
  return ideas
    .map(idea => scoreBusinessIdea(idea))
    .sort((left, right) => {
      if (right.total_score !== left.total_score) {
        return right.total_score - left.total_score;
      }
      return right.speed_to_cash_score - left.speed_to_cash_score;
    });
}

export function generateMoneyIdeas(mission = DEFAULT_MISSION) {
  const currentMission = normalizeMission(mission);
  const market = inferMarketPhrase(currentMission);
  const primaryCustomer = inferPrimaryCustomer(currentMission);
  const marketTitle = titleCase(market).replace(/[.?!]+$/, '');

  return [
    {
      id: `idea-${slugify(`${market}-ai-offer-audit`)}`,
      business_name: `${marketTitle} Offer Audit`,
      target_customer: primaryCustomer,
      customer_pain: 'They know there is demand, but their offer is vague and their first sales motion is unclear.',
      offer: 'A 48-hour offer audit with landing-page copy, buyer list, and a first outreach sequence.',
      why_now: 'AI makes research and packaging cheaper, but buyers still need specific outcomes and credible follow-up.',
      revenue_path: '$300 audit, then $99/month optimization retainer for follow-up experiments.',
      first_test_this_week: 'Send 25 personalized audit teardowns and ask for 3 paid pilot calls.',
      tools_needed: ['Market Research Bot', 'Offer Builder Bot', 'Outreach Drafting Bot', 'CRM Follow-Up Bot'],
      difficulty_score: 2,
      speed_to_cash_score: 5,
      founder_fit_score: 5,
      urgent_pain_score: 4,
      reachable_buyer_score: 5,
      simple_first_offer_score: 5,
      low_build_cost_score: 5,
      clear_distribution_score: 4,
      software_later_score: 4
    },
    {
      id: `idea-${slugify(`${market}-lead-rescue`)}`,
      business_name: `${marketTitle} Lead Rescue Desk`,
      target_customer: primaryCustomer,
      customer_pain: 'Leads arrive through forms, DMs, referrals, and calls, then disappear without structured follow-up.',
      offer: 'Set up a lightweight lead rescue workflow with reply templates, reminders, and weekly pipeline reports.',
      why_now: 'Most small operators have scattered tools and no patience for a full CRM migration.',
      revenue_path: '$500 setup plus $150/month for monitoring, follow-up drafts, and conversion reports.',
      first_test_this_week: 'Find 20 businesses with forms and no fast follow-up, then pitch a missed-revenue teardown.',
      tools_needed: ['Lead Finder Bot', 'CRM Follow-Up Bot', 'Email', 'Analytics Bot'],
      difficulty_score: 3,
      speed_to_cash_score: 4,
      founder_fit_score: 4,
      urgent_pain_score: 5,
      reachable_buyer_score: 4,
      simple_first_offer_score: 4,
      low_build_cost_score: 4,
      clear_distribution_score: 4,
      software_later_score: 5
    },
    {
      id: `idea-${slugify(`${market}-tiny-mvp-studio`)}`,
      business_name: `${marketTitle} Tiny MVP Studio`,
      target_customer: 'builders with validated intent but no shippable first version',
      customer_pain: 'They keep expanding scope before they have a sellable test in front of real buyers.',
      offer: 'A one-week tiny MVP package: landing page, waitlist or demo, Stripe-ready offer, and validation checklist.',
      why_now: 'More people can build with AI, but the hard part is still choosing what to build first.',
      revenue_path: '$1,000 fixed sprint, then optional $250/month experiment maintenance.',
      first_test_this_week: 'Post three before/after MVP scope examples and invite 5 founders to a paid sprint call.',
      tools_needed: ['MVP Builder Bot', 'GitHub Builder Bot', 'Vercel Deployment Bot', 'Founder Brief Bot'],
      difficulty_score: 4,
      speed_to_cash_score: 3,
      founder_fit_score: 5,
      urgent_pain_score: 4,
      reachable_buyer_score: 3,
      simple_first_offer_score: 4,
      low_build_cost_score: 3,
      clear_distribution_score: 3,
      software_later_score: 5
    },
    {
      id: `idea-${slugify(`${market}-pricing-lab`)}`,
      business_name: `${marketTitle} Pricing Lab`,
      target_customer: 'service operators who sell custom work but underprice repeatable outcomes',
      customer_pain: 'They do not know which package buyers will accept, so they avoid charging for the real value.',
      offer: 'A pricing experiment kit with 3 packages, objection handling, checkout copy, and call scripts.',
      why_now: 'Margins are tightening, and operators need faster ways to test price without a rebrand.',
      revenue_path: '$300 package audit, then performance-based retainer after paid conversion.',
      first_test_this_week: 'Run 10 pricing interviews and offer a paid package rewrite to warm prospects.',
      tools_needed: ['Pricing Bot', 'Market Research Bot', 'Stripe / Payments', 'Analytics Bot'],
      difficulty_score: 2,
      speed_to_cash_score: 4,
      founder_fit_score: 4,
      urgent_pain_score: 4,
      reachable_buyer_score: 4,
      simple_first_offer_score: 4,
      low_build_cost_score: 5,
      clear_distribution_score: 3,
      software_later_score: 3
    },
    {
      id: `idea-${slugify(`${market}-autopilot-reports`)}`,
      business_name: `${marketTitle} Autopilot Reports`,
      target_customer: 'operators who want AI leverage but need human-readable decisions and proof',
      customer_pain: 'They collect data in too many places and cannot see what action will create revenue next.',
      offer: 'Weekly AI-generated command brief with lead findings, offer changes, experiment metrics, and next actions.',
      why_now: 'AI tools are everywhere, but founders need one operating rhythm that compounds learning.',
      revenue_path: '$99/month report subscription, then $500 setup for connected dashboards.',
      first_test_this_week: 'Manually create 5 sample briefs for target customers and ask which one they would pay for.',
      tools_needed: ['Executive Agent', 'Founder Brief Bot', 'Portfolio Manager Bot', 'Analytics Bot'],
      difficulty_score: 3,
      speed_to_cash_score: 3,
      founder_fit_score: 5,
      urgent_pain_score: 3,
      reachable_buyer_score: 4,
      simple_first_offer_score: 4,
      low_build_cost_score: 4,
      clear_distribution_score: 4,
      software_later_score: 5
    }
  ].map(idea => scoreBusinessIdea(idea));
}
