import { PROMPT_TEMPLATES } from './moneyPrinterPrompts.js';
import { generateValidationTest, killOrScaleExperiment, summarizePortfolio } from './moneyPrinterExperiments.js';
import { generateMoneyIdeas, scoreBusinessIdeas, titleCase } from './moneyPrinterScoring.js';

// Bot definitions and mock loop runners for money-printer-core.
// The web dashboard uses this today; a future CLI/daemon should call the same loop API.

const coreOperatorBots = [
  {
    id: 'executive-agent',
    name: 'Executive Agent',
    purpose: 'Chooses the highest-leverage loop and assigns the next bot.',
    autonomy: 'Yellow',
    toolsNeeded: ['Analytics', 'CRM', 'GitHub'],
    status: 'Mock mode',
    promptKey: 'executiveAgent'
  },
  {
    id: 'founder-brief-bot',
    name: 'Founder Brief Bot',
    purpose: 'Turns current state into a practical command brief.',
    autonomy: 'Green',
    toolsNeeded: ['Docs / Knowledge Base'],
    status: 'Ready',
    promptKey: 'founderBrief'
  },
  {
    id: 'system-improvement-bot',
    name: 'System Improvement Bot',
    purpose: 'Improves the machine by removing bottlenecks and noisy loops.',
    autonomy: 'Green',
    toolsNeeded: ['GitHub', 'Docs / Knowledge Base', 'Analytics'],
    status: 'Mock mode',
    promptKey: 'systemImprovement'
  }
];

const opportunityBots = [
  {
    id: 'opportunity-scanner-bot',
    name: 'Opportunity Scanner Bot',
    purpose: 'Finds underserved pains and ranks them by urgency and reachability.',
    autonomy: 'Green',
    toolsNeeded: ['Analytics', 'Docs / Knowledge Base'],
    status: 'Mock mode',
    promptKey: 'opportunityScanner'
  },
  {
    id: 'business-idea-generator-bot',
    name: 'Business Idea Generator Bot',
    purpose: 'Generates service-first, software-later business ideas.',
    autonomy: 'Green',
    toolsNeeded: ['Docs / Knowledge Base'],
    status: 'Ready',
    promptKey: 'businessIdeaGenerator'
  },
  {
    id: 'pain-finder-bot',
    name: 'Pain Finder Bot',
    purpose: 'Extracts urgent customer pain from markets, notes, and conversations.',
    autonomy: 'Green',
    toolsNeeded: ['CRM', 'Docs / Knowledge Base'],
    status: 'Needs connection',
    promptKey: 'opportunityScanner'
  },
  {
    id: 'monetization-bot',
    name: 'Monetization Bot',
    purpose: 'Turns pain into price tests, packages, and revenue paths.',
    autonomy: 'Yellow',
    toolsNeeded: ['Stripe / Payments', 'Analytics'],
    status: 'Mock mode',
    promptKey: 'businessIdeaGenerator'
  },
  {
    id: 'validation-bot',
    name: 'Validation Bot',
    purpose: 'Designs 7-day tests before the team builds too much.',
    autonomy: 'Green',
    toolsNeeded: ['Email', 'CRM', 'Analytics'],
    status: 'Mock mode',
    promptKey: 'validation'
  },
  {
    id: 'mvp-builder-bot',
    name: 'MVP Builder Bot',
    purpose: 'Defines the smallest sellable version of a validated idea.',
    autonomy: 'Yellow',
    toolsNeeded: ['GitHub', 'Vercel', 'Docs / Knowledge Base'],
    status: 'Mock mode',
    promptKey: 'mvpBuilder'
  },
  {
    id: 'distribution-bot',
    name: 'Distribution Bot',
    purpose: 'Finds reachable channels and repeatable paths to buyers.',
    autonomy: 'Green',
    toolsNeeded: ['Email', 'CRM', 'Analytics'],
    status: 'Needs connection',
    promptKey: 'validation'
  },
  {
    id: 'pricing-bot',
    name: 'Pricing Bot',
    purpose: 'Creates price tests and packaging options.',
    autonomy: 'Red',
    toolsNeeded: ['Stripe / Payments', 'Analytics'],
    status: 'Needs connection',
    promptKey: 'businessIdeaGenerator'
  },
  {
    id: 'kill-or-scale-bot',
    name: 'Kill-or-Scale Bot',
    purpose: 'Reviews traction and decides whether to kill, pivot, improve, or scale.',
    autonomy: 'Yellow',
    toolsNeeded: ['CRM', 'Analytics', 'Stripe / Payments'],
    status: 'Mock mode',
    promptKey: 'killOrScale'
  },
  {
    id: 'portfolio-manager-bot',
    name: 'Portfolio Manager Bot',
    purpose: 'Limits distraction and allocates attention across experiments.',
    autonomy: 'Yellow',
    toolsNeeded: ['CRM', 'Analytics', 'Docs / Knowledge Base'],
    status: 'Mock mode',
    promptKey: 'portfolioManager'
  }
];

const businessOperationBots = [
  {
    id: 'market-research-bot',
    name: 'Market Research Bot',
    purpose: 'Maps customers, competitors, pricing, trends, and risky assumptions.',
    autonomy: 'Green',
    toolsNeeded: ['Docs / Knowledge Base', 'Analytics'],
    status: 'Mock mode',
    promptKey: 'marketResearch'
  },
  {
    id: 'brand-positioning-bot',
    name: 'Brand / Positioning Bot',
    purpose: 'Sharpens the promise, category, proof points, and voice.',
    autonomy: 'Green',
    toolsNeeded: ['Docs / Knowledge Base'],
    status: 'Ready',
    promptKey: 'businessIdeaGenerator'
  },
  {
    id: 'offer-builder-bot',
    name: 'Offer Builder Bot',
    purpose: 'Packages the offer, guarantee language, deliverables, and CTA.',
    autonomy: 'Green',
    toolsNeeded: ['Docs / Knowledge Base', 'Stripe / Payments'],
    status: 'Mock mode',
    promptKey: 'businessIdeaGenerator'
  },
  {
    id: 'website-builder-bot',
    name: 'Website Builder Bot',
    purpose: 'Builds or updates landing pages for active experiments.',
    autonomy: 'Yellow',
    toolsNeeded: ['GitHub', 'Vercel'],
    status: 'Mock mode',
    promptKey: 'mvpBuilder'
  },
  {
    id: 'github-builder-bot',
    name: 'GitHub Builder Bot',
    purpose: 'Creates issues, branches, commits, and pull request plans.',
    autonomy: 'Green',
    toolsNeeded: ['GitHub'],
    status: 'Mock mode',
    promptKey: 'githubBuilder'
  },
  {
    id: 'vercel-deployment-bot',
    name: 'Vercel Deployment Bot',
    purpose: 'Prepares previews and reports deployment changes.',
    autonomy: 'Green',
    toolsNeeded: ['Vercel'],
    status: 'Mock mode',
    promptKey: 'vercelDeployment'
  },
  {
    id: 'lead-finder-bot',
    name: 'Lead Finder Bot',
    purpose: 'Finds reachable prospects that match the current offer.',
    autonomy: 'Green',
    toolsNeeded: ['CRM', 'Email'],
    status: 'Needs connection',
    promptKey: 'validation'
  },
  {
    id: 'outreach-drafting-bot',
    name: 'Outreach Drafting Bot',
    purpose: 'Drafts specific outreach and follow-up messages for human review.',
    autonomy: 'Green',
    toolsNeeded: ['Email', 'CRM'],
    status: 'Needs connection',
    promptKey: 'validation'
  },
  {
    id: 'crm-follow-up-bot',
    name: 'CRM Follow-Up Bot',
    purpose: 'Finds stale leads and drafts next contact steps.',
    autonomy: 'Yellow',
    toolsNeeded: ['CRM', 'Email'],
    status: 'Needs connection',
    promptKey: 'portfolioManager'
  },
  {
    id: 'content-bot',
    name: 'Content Bot',
    purpose: 'Creates content that tests positioning and collects demand signals.',
    autonomy: 'Green',
    toolsNeeded: ['Docs / Knowledge Base', 'Analytics'],
    status: 'Mock mode',
    promptKey: 'validation'
  },
  {
    id: 'customer-delivery-bot',
    name: 'Customer Delivery Bot',
    purpose: 'Turns sold experiments into checklists, reports, and delivery workflows.',
    autonomy: 'Yellow',
    toolsNeeded: ['Docs / Knowledge Base', 'CRM'],
    status: 'Needs connection',
    promptKey: 'mvpBuilder'
  },
  {
    id: 'finance-admin-bot',
    name: 'Finance/Admin Bot',
    purpose: 'Summarizes revenue, invoices, and operating admin signals.',
    autonomy: 'Red',
    toolsNeeded: ['Stripe / Payments'],
    status: 'Needs connection',
    promptKey: 'killOrScale'
  },
  {
    id: 'analytics-bot',
    name: 'Analytics Bot',
    purpose: 'Reads experiment metrics and exposes drop-offs.',
    autonomy: 'Green',
    toolsNeeded: ['Analytics'],
    status: 'Needs connection',
    promptKey: 'marketResearch'
  },
  {
    id: 'compliance-risk-bot',
    name: 'Compliance/Risk Bot',
    purpose: 'Flags risk before public claims, pricing changes, or external automation.',
    autonomy: 'Red',
    toolsNeeded: ['Docs / Knowledge Base'],
    status: 'Needs connection',
    promptKey: 'systemImprovement'
  }
];

export const BOT_GROUPS = [
  { name: 'Core Operator Bots', bots: coreOperatorBots },
  { name: 'Opportunity Bots', bots: opportunityBots },
  { name: 'Business Operation Bots', bots: businessOperationBots }
];

export const BOT_DEFINITIONS = BOT_GROUPS.flatMap(group =>
  group.bots.map(bot => ({
    ...bot,
    group: group.name
  }))
);

export function findPromptForBot(botId) {
  const bot = BOT_DEFINITIONS.find(item => item.id === botId);
  return bot ? PROMPT_TEMPLATES[bot.promptKey] : '';
}

function summarizeTools(tools = []) {
  return tools.length ? tools.join(', ') : 'No external tools required for this mock loop';
}

export function runBotLoop(botId, context = {}) {
  const bot = BOT_DEFINITIONS.find(item => item.id === botId);
  const state = context.state || {};
  const ideas = scoreBusinessIdeas(context.ideas || state.ideas || []);
  const topIdea = context.topIdea || ideas[0];
  const brief = context.brief || {};
  const config = context.businessConfig || state.businessConfig || {};
  const experiments = context.experiments || state.experiments || [];
  const decision = context.decision || killOrScaleExperiment(state);
  const portfolio = summarizePortfolio(experiments);
  const nextBestMoneyAction = context.nextBestMoneyAction
    || brief.nextBestMoneyAction
    || 'Generate ideas, score them, and pick one test that can reach a buyer this week.';
  const generatedAt = new Date().toISOString();

  const generic = {
    title: `${bot?.name || 'Bot'} loop`,
    generatedAt,
    summary: `${bot?.name || 'This bot'} reviewed ${config.business_name || 'money-printer'} in mock mode.`,
    lines: [
      `Mission: ${config.mission || state.mission || 'Not set'}`,
      `Tools requested: ${summarizeTools(bot?.toolsNeeded)}`,
      `Recommended next action: ${nextBestMoneyAction}`
    ]
  };

  switch (botId) {
    case 'executive-agent':
      return {
        title: 'Executive Agent decision',
        generatedAt,
        summary: 'Run Validation Bot next. The fastest money loop is buyer outreach before product build.',
        lines: [
          `Priority 1: ${nextBestMoneyAction}`,
          `Priority 2: create a single validation page for ${topIdea?.business_name || 'the top offer'}.`,
          'Priority 3: update the Founder Command Brief after replies or silence.',
          'Do not add features until the first buyer confirms pain, urgency, and price.'
        ]
      };
    case 'opportunity-scanner-bot':
      return {
        title: 'Opportunity scan',
        generatedAt,
        summary: topIdea
          ? `${topIdea.business_name} is the strongest current opportunity.`
          : 'Generate ideas first so the scanner can rank concrete offers.',
        lines: topIdea
          ? [
            `Urgent pain: ${topIdea.customer_pain}`,
            `Reachable buyer: ${topIdea.target_customer}`,
            `Fast validation: ${topIdea.first_test_this_week}`,
            'Rank reason: simple first offer, low build cost, and clear path to first dollar.'
          ]
          : ['No ranked ideas yet. Generate 5 business ideas and run the scanner again.']
      };
    case 'business-idea-generator-bot':
      return {
        title: 'Business ideas generated',
        generatedAt,
        summary: `Generated ${ideas.length || 5} service-first, software-later ideas for ${config.mission || state.mission}`,
        lines: (ideas.length ? ideas : generateMoneyIdeas(config.mission || state.mission))
          .slice(0, 5)
          .map(idea => `${idea.business_name}: ${idea.offer}`)
      };
    case 'market-research-bot':
      return {
        title: 'Market research brief',
        generatedAt,
        summary: 'The strongest research path is buyer interviews plus competitor teardown, not broad trend reading.',
        lines: [
          `Customer segment: ${topIdea?.target_customer || config.target_customers?.[0] || 'first reachable buyer segment'}`,
          'Competitors to inspect: agencies, templates, AI wrappers, spreadsheets, and internal manual workflows.',
          'Pricing anchors to test: $300 audit, $500 setup, $99/month report, $1,000 sprint.',
          'Risky assumption: buyers care enough to reply this week.'
        ]
      };
    case 'validation-bot':
      return {
        title: 'Validation plan',
        generatedAt,
        summary: 'Validate demand in 7 days without building the full product.',
        lines: Object.entries(generateValidationTest(topIdea) || {})
          .filter(([key]) => key !== 'title')
          .map(([key, value]) => `${titleCase(key.replace(/_/g, ' '))}: ${value}`)
      };
    case 'founder-brief-bot':
      return {
        title: 'Founder brief updated',
        generatedAt,
        summary: nextBestMoneyAction,
        lines: [
          `Best opportunity: ${brief.bestNewOpportunity || topIdea?.business_name || 'No opportunity yet'}`,
          `First customer: ${brief.suggestedFirstCustomer || topIdea?.target_customer || 'No customer yet'}`,
          `Fastest dollar: ${brief.fastestPathToFirstDollar || 'Pick one reachable buyer and sell a manual audit.'}`,
          `Bot next: ${brief.botToRunNext || 'Business Idea Generator Bot'}`
        ]
      };
    case 'kill-or-scale-bot':
      return {
        title: 'Kill-or-scale decision',
        generatedAt,
        summary: `${titleCase(decision.verdict)}: ${decision.target}`,
        lines: [
          `Rationale: ${decision.rationale}`,
          `Next: ${decision.next}`,
          'Rule: kill weak demand quickly, scale only after buyer behavior proves the loop.'
        ]
      };
    case 'portfolio-manager-bot':
      return {
        title: 'Portfolio allocation',
        generatedAt,
        summary: portfolio.attentionRule,
        lines: [
          `Active experiments: ${portfolio.activeExperiments}`,
          `Primary focus: ${topIdea?.business_name || portfolio.primaryFocus}`,
          'Attention rule: no more than two live validation tests until one produces replies or revenue.',
          `Next money action: ${nextBestMoneyAction}`
        ]
      };
    case 'system-improvement-bot':
      return {
        title: 'System improvement recommendation',
        generatedAt,
        summary: 'The machine needs a tighter learn-and-update loop after each validation action.',
        lines: [
          'Add a simple CRM note every time outreach is drafted, sent, replied to, or ignored.',
          'Promote only one idea at a time into active validation.',
          'Make the Founder Command Brief the weekly source of truth.',
          'Next integration to wire: GitHub issue creation for validation tasks.'
        ]
      };
    default:
      return generic;
  }
}
