import {
  AUTONOMY_ZONES,
  DEFAULT_MISSION,
  EXPERIMENT_STATUSES,
  TOOL_DEFINITIONS
} from './moneyPrinterTypes.js';
import { BOT_GROUPS, findPromptForBot, runBotLoop as runBotLoopEngine } from './moneyPrinterBots.js';
import {
  applyExperimentStatus,
  createSeedExperiment,
  generateTinyMvpPlan,
  generateValidationTest,
  killOrScaleExperiment,
  promoteIdeaToExperiment,
  summarizePortfolio
} from './moneyPrinterExperiments.js';
import {
  generateMoneyIdeas,
  inferCustomerSegments,
  inferPrimaryCustomer,
  normalizeMission,
  scoreBusinessIdea,
  scoreBusinessIdeas
} from './moneyPrinterScoring.js';

// money-printer-core: shared engine for bots, scoring, prompts, experiments, briefs, and connector interfaces.
// This module is intentionally free of DOM and browser storage so a future CLI or DigitalOcean daemon can reuse it.

export { AUTONOMY_ZONES, BOT_GROUPS, DEFAULT_MISSION, EXPERIMENT_STATUSES, TOOL_DEFINITIONS };
export {
  findPromptForBot,
  generateMoneyIdeas,
  generateTinyMvpPlan,
  generateValidationTest,
  killOrScaleExperiment,
  normalizeMission,
  promoteIdeaToExperiment,
  scoreBusinessIdea,
  scoreBusinessIdeas,
  summarizePortfolio
};

export function createDefaultBusinessConfig(mission = DEFAULT_MISSION, topIdea = null) {
  const currentMission = normalizeMission(mission);
  const targetCustomers = inferCustomerSegments(currentMission);
  return {
    business_name: 'money-printer',
    mission: currentMission,
    target_customers: targetCustomers,
    primary_offer: topIdea?.offer || `7-day validation sprint for ${targetCustomers[0]}`,
    tone: 'bold, practical, clear, human',
    repo: 'tmsteph/3dvr-portal',
    deployment: 'vercel',
    mode: 'venture_studio',
    autonomy: {
      green_zone: AUTONOMY_ZONES[0].examples,
      yellow_zone: AUTONOMY_ZONES[1].examples,
      red_zone: AUTONOMY_ZONES[2].examples
    }
  };
}

export function updateBusinessConfigFromMission(mission = DEFAULT_MISSION, topIdea = null, currentConfig = {}) {
  return {
    ...currentConfig,
    ...createDefaultBusinessConfig(mission, topIdea)
  };
}

export function getNextBestMoneyAction(state = {}) {
  const ideas = scoreBusinessIdeas(state.ideas || []);
  const experiments = state.experiments || [];
  const topIdea = ideas[0];
  const revenueExperiments = experiments.filter(item => Number(item.traction?.revenue || 0) > 0);
  const staleExperiment = experiments.find(item =>
    item.status !== 'Killed'
    && Number(item.traction?.messages_sent || 0) > 0
    && Number(item.traction?.replies || 0) === 0
  );

  if (revenueExperiments.length) {
    return 'Package the winning experiment into a repeatable offer and ask 5 similar buyers for the same deal.';
  }

  if (staleExperiment) {
    return `Follow up with stale leads for ${staleExperiment.name} and rewrite the first line around the buyer pain.`;
  }

  if (topIdea?.speed_to_cash_score >= 5) {
    return `Draft outreach to 10 reachable buyers for ${topIdea.business_name} and ask for one paid pilot call.`;
  }

  if (topIdea) {
    return `Build a landing page for ${topIdea.business_name} and package the first offer as a $300 audit.`;
  }

  return 'Generate 5 business ideas, score them, and pick one test that can reach a buyer this week.';
}

export function generateFounderCommandBrief(state = {}) {
  const mission = normalizeMission(state.mission || state.businessConfig?.mission || DEFAULT_MISSION);
  const ideas = scoreBusinessIdeas(state.ideas || []);
  const experiments = state.experiments || [];
  const topIdea = ideas[0] || null;
  const lowestIdea = ideas[ideas.length - 1] || null;
  const scaleExperiment = experiments.find(item => ['Revenue', 'Scaling', 'Launched'].includes(item.status)) || experiments[0];
  const nextBestMoneyAction = getNextBestMoneyAction({
    ...state,
    ideas,
    experiments
  });

  return {
    currentMission: mission,
    bestNewOpportunity: topIdea?.business_name || 'Generate ideas to identify the first opportunity.',
    suggestedFirstCustomer: topIdea?.target_customer || inferPrimaryCustomer(mission),
    primaryOffer: topIdea?.offer || state.businessConfig?.primary_offer || '7-day validation sprint',
    fastestPathToFirstDollar: topIdea
      ? `${topIdea.first_test_this_week} Price the first yes at ${topIdea.revenue_path.split(',')[0]}.`
      : 'Pick one reachable buyer segment and sell a manual audit before building software.',
    next3Actions: topIdea
      ? [
        `Run Market Research Bot for ${topIdea.target_customer}.`,
        `Create a validation page for ${topIdea.business_name}.`,
        `Draft outreach to 10 buyers and ask for one paid pilot.`
      ]
      : [
        'Generate 5 business ideas.',
        'Score the ideas by speed to cash.',
        'Create one validation test for the highest-scoring offer.'
      ],
    botToRunNext: topIdea ? 'Validation Bot' : 'Business Idea Generator Bot',
    biggestRisk: topIdea
      ? 'Building the software version before the first buyer confirms the pain and price.'
      : 'Staying at the mission level without testing a concrete buyer pain.',
    currentExperimentToKill: lowestIdea?.recommendation === 'kill'
      ? lowestIdea.business_name
      : 'Anything with vague buyers, no reachable channel, or no reply after a focused test.',
    currentExperimentToScale: scaleExperiment?.name || topIdea?.business_name || 'No scale candidate yet.',
    highestLeverageImprovementThisWeek:
      'Turn the strongest offer into a repeatable validation loop: buyer list, outreach, landing page, CRM note, metric review.',
    nextBestMoneyAction
  };
}

export function buildMetrics(state = {}) {
  const ideas = state.ideas || [];
  const experiments = state.experiments || [];
  const tractionTotals = experiments.reduce((totals, experiment) => {
    const traction = experiment.traction || {};
    return {
      leadsFound: totals.leadsFound + Number(traction.leads_found || 0),
      replies: totals.replies + Number(traction.replies || 0),
      callsBooked: totals.callsBooked + Number(traction.calls_booked || 0),
      revenue: totals.revenue + Number(traction.revenue || 0)
    };
  }, {
    leadsFound: 0,
    replies: 0,
    callsBooked: 0,
    revenue: 0
  });

  const generatedSeed = ideas.length ? ideas.length * 5 : 0;
  return {
    ideasGenerated: ideas.length,
    experimentsActive: experiments.filter(item => item.status !== 'Killed').length,
    offersLaunched: experiments.filter(item => ['Launched', 'Revenue', 'Scaling'].includes(item.status)).length,
    leadsFound: tractionTotals.leadsFound + generatedSeed,
    replies: tractionTotals.replies + (ideas.length ? 2 : 0),
    callsBooked: tractionTotals.callsBooked + (ideas.length ? 1 : 0),
    revenueTracked: tractionTotals.revenue,
    weakSignalsFound: Array.isArray(state.weakSignals) ? state.weakSignals.length : 0,
    nextBestMoneyAction: getNextBestMoneyAction(state)
  };
}

export function refreshMoneyPrinterState(nextState = {}) {
  const mission = normalizeMission(nextState.mission || nextState.businessConfig?.mission || DEFAULT_MISSION);
  const ideas = scoreBusinessIdeas(nextState.ideas || []);
  const businessConfig = updateBusinessConfigFromMission(mission, ideas[0], nextState.businessConfig);
  const updated = {
    ...nextState,
    mission,
    ideas,
    businessConfig,
    experiments: Array.isArray(nextState.experiments) ? nextState.experiments : [],
    weakSignals: Array.isArray(nextState.weakSignals) ? nextState.weakSignals : [],
    botOutputs: nextState.botOutputs || {}
  };
  updated.nextBestMoneyAction = getNextBestMoneyAction(updated);
  updated.founderBrief = generateFounderCommandBrief(updated);
  updated.portfolioSummary = summarizePortfolio(updated.experiments);
  return updated;
}

export function createDefaultMoneyPrinterState() {
  const mission = DEFAULT_MISSION;
  const businessConfig = createDefaultBusinessConfig(mission);
  const state = {
    mission,
    businessConfig,
    ideas: [],
    experiments: [createSeedExperiment()],
    validationTest: null,
    tinyMvpPlan: null,
    killOrScaleDecision: null,
    botOutputs: {},
    lastGeneratedAt: null
  };
  return refreshMoneyPrinterState(state);
}

export function createMoneyMachineState(previousState = {}, mission = DEFAULT_MISSION) {
  const currentMission = normalizeMission(mission);
  const ideas = scoreBusinessIdeas(generateMoneyIdeas(currentMission));
  const businessConfig = updateBusinessConfigFromMission(currentMission, ideas[0], previousState.businessConfig);
  return refreshMoneyPrinterState({
    ...createDefaultMoneyPrinterState(),
    ...previousState,
    mission: currentMission,
    businessConfig,
    ideas,
    validationTest: generateValidationTest(ideas[0]),
    tinyMvpPlan: generateTinyMvpPlan(ideas[0]),
    lastGeneratedAt: new Date().toISOString()
  });
}

export function ensureMoneyIdeas(state = {}) {
  if (Array.isArray(state.ideas) && state.ideas.length) {
    return refreshMoneyPrinterState(state);
  }
  return refreshMoneyPrinterState({
    ...state,
    ideas: generateMoneyIdeas(state.mission || state.businessConfig?.mission || DEFAULT_MISSION)
  });
}

export function promoteIdeaInState(state = {}, ideaId = '') {
  const updated = ensureMoneyIdeas(state);
  const idea = updated.ideas.find(item => item.id === ideaId) || updated.ideas[0];
  const experiment = promoteIdeaToExperiment(idea);
  if (!idea || !experiment) {
    return {
      state: updated,
      idea: null,
      experiment: null,
      existed: false
    };
  }

  const existed = updated.experiments.some(item => item.id === experiment.id);
  if (existed) {
    return {
      state: updated,
      idea,
      experiment,
      existed: true
    };
  }

  return {
    state: refreshMoneyPrinterState({
      ...updated,
      experiments: [experiment, ...updated.experiments],
      validationTest: generateValidationTest(idea),
      tinyMvpPlan: generateTinyMvpPlan(idea)
    }),
    idea,
    experiment,
    existed: false
  };
}

export function updateExperimentStatusInState(state = {}, experimentId = '', nextStatus = 'Idea') {
  return refreshMoneyPrinterState({
    ...state,
    experiments: (state.experiments || []).map(experiment => (
      experiment.id === experimentId ? applyExperimentStatus(experiment, nextStatus) : experiment
    ))
  });
}

export function runBotLoop(botId, state = {}) {
  const updated = refreshMoneyPrinterState(state);
  const decision = killOrScaleExperiment(updated);
  return runBotLoopEngine(botId, {
    state: updated,
    ideas: updated.ideas,
    topIdea: updated.ideas[0],
    brief: updated.founderBrief,
    businessConfig: updated.businessConfig,
    experiments: updated.experiments,
    decision,
    nextBestMoneyAction: updated.nextBestMoneyAction
  });
}

export function createPromptOutput(botId) {
  return {
    prompt: true,
    title: 'Prompt template',
    summary: findPromptForBot(botId),
    lines: ['This prompt is reusable and ready to connect to a real model call.']
  };
}

// Compatibility names from the original MVP module.
export const buildBusinessConfig = createDefaultBusinessConfig;
export const createDefaultState = createDefaultMoneyPrinterState;
export const createFounderBrief = generateFounderCommandBrief;
export const createKillOrScaleDecision = killOrScaleExperiment;
export const createTinyMvpPlan = generateTinyMvpPlan;
export const createValidationTest = generateValidationTest;
export const generateBusinessIdeas = generateMoneyIdeas;
export const generateBotOutput = runBotLoop;
export const ideaToExperiment = promoteIdeaToExperiment;
