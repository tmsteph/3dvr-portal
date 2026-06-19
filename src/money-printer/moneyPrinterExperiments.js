import { scoreBusinessIdeas, slugify } from './moneyPrinterScoring.js';

// Experiment lifecycle helpers for money-printer-core.
// These functions are pure enough for the future CLI/daemon to call during scheduled loops.

export function generateValidationTest(idea = null) {
  if (!idea) {
    return null;
  }

  return {
    title: `7-day validation test: ${idea.business_name}`,
    outreach: `Draft 25 direct messages to ${idea.target_customer} using the pain: "${idea.customer_pain}"`,
    landing_page: `One page with the offer, price test, buyer pain, proof plan, and a single "book audit" CTA.`,
    concierge_version: 'Deliver the first result manually using docs, spreadsheets, and founder time before building software.',
    success_metric: '3 qualified replies, 1 booked call, or 1 paid pilot within 7 days.',
    failure_metric: 'Fewer than 2 specific pain replies after 25 targeted messages.',
    next_decision: 'Scale outreach if replies are specific; rewrite or kill the offer if the pain is not urgent.'
  };
}

export function generateTinyMvpPlan(idea = null) {
  if (!idea) {
    return null;
  }

  return {
    title: `Tiny MVP plan: ${idea.business_name}`,
    build: [
      'Write one landing page with the strongest pain, offer, price test, and proof promise.',
      'Create a simple intake form that collects buyer type, current workflow, urgency, and contact info.',
      'Prepare one manual delivery template so the first customer can be served without backend automation.',
      'Open one GitHub issue list for the later software version only after validation metrics pass.'
    ],
    deployment: 'Create a Vercel preview and share it only with targeted prospects until signal is clear.',
    success_metric: 'One paid or strongly committed buyer before adding product features.'
  };
}

export function promoteIdeaToExperiment(idea) {
  if (!idea) {
    return null;
  }

  const validationTest = generateValidationTest(idea);
  return {
    id: `experiment-${slugify(idea.business_name)}`,
    name: idea.business_name,
    customer: idea.target_customer,
    pain: idea.customer_pain,
    offer: idea.offer,
    price_test: idea.revenue_path.split(',')[0] || '$300 setup or $99/month',
    validation_test: validationTest?.outreach || idea.first_test_this_week,
    status: 'Idea',
    traction: {
      leads_found: 0,
      messages_drafted: 0,
      messages_sent: 0,
      replies: 0,
      calls_booked: 0,
      revenue: 0
    },
    next_action: 'Run Market Research Bot and Lead Finder Bot'
  };
}

export function createSeedExperiment() {
  return {
    id: 'experiment-local-ai-websites',
    name: 'AI Website Modernization for Local Service Businesses',
    customer: 'local service providers with outdated websites',
    pain: 'Weak websites, no booking flow, poor lead capture',
    offer: '48-hour website modernization audit + landing page upgrade',
    price_test: '$300 setup or $99/month',
    validation_test: 'Send 25 personalized outreach emails and measure replies',
    status: 'Idea',
    traction: {
      leads_found: 0,
      messages_drafted: 0,
      messages_sent: 0,
      replies: 0,
      calls_booked: 0,
      revenue: 0
    },
    next_action: 'Run Market Research Bot and Lead Finder Bot'
  };
}

export function summarizePortfolio(experiments = []) {
  const active = experiments.filter(item => item.status !== 'Killed');
  const revenue = experiments.filter(item => Number(item.traction?.revenue || 0) > 0);
  const scaling = experiments.filter(item => item.status === 'Scaling');
  const killed = experiments.filter(item => item.status === 'Killed');
  const totalRevenue = experiments.reduce((sum, item) => sum + Number(item.traction?.revenue || 0), 0);

  return {
    totalExperiments: experiments.length,
    activeExperiments: active.length,
    revenueExperiments: revenue.length,
    scalingExperiments: scaling.length,
    killedExperiments: killed.length,
    totalRevenue,
    primaryFocus: revenue[0]?.name || active[0]?.name || 'No active experiment yet',
    attentionRule: 'Keep one primary revenue experiment active and one backup idea in research.'
  };
}

export function killOrScaleExperiment(state = {}) {
  const experiments = state.experiments || [];
  const ideas = scoreBusinessIdeas(state.ideas || []);
  const weakestIdea = ideas[ideas.length - 1];
  const strongestIdea = ideas[0];
  const revenueExperiment = experiments.find(item => Number(item.traction?.revenue || 0) > 0);
  const noSignalExperiment = experiments.find(item =>
    item.status !== 'Killed'
    && Number(item.traction?.messages_sent || 0) >= 25
    && Number(item.traction?.replies || 0) < 2
  );

  if (revenueExperiment) {
    return {
      verdict: 'scale',
      target: revenueExperiment.name,
      rationale: 'Revenue exists. Increase distribution carefully and document delivery before adding features.',
      next: 'Find 10 similar buyers and offer the same package at the same or slightly higher price.'
    };
  }

  if (noSignalExperiment) {
    return {
      verdict: 'kill',
      target: noSignalExperiment.name,
      rationale: 'The test used enough outreach to detect weak demand. Do not keep polishing the offer.',
      next: 'Archive the experiment and move attention to the highest-scoring idea.'
    };
  }

  return {
    verdict: strongestIdea ? 'test' : 'hold',
    target: strongestIdea?.business_name || weakestIdea?.business_name || 'No opportunity selected',
    rationale: strongestIdea
      ? 'The highest-scoring idea has reachable buyers, low build cost, and a clear first-dollar path.'
      : 'Generate and score ideas before choosing a portfolio decision.',
    next: strongestIdea
      ? `Run a 7-day validation test for ${strongestIdea.business_name}.`
      : 'Generate ideas, score them, then create one validation test.'
  };
}

export function applyExperimentStatus(experiment = {}, nextStatus = 'Idea') {
  const traction = { ...(experiment.traction || {}) };
  if (nextStatus === 'Researching') {
    traction.leads_found = Math.max(Number(traction.leads_found || 0), 15);
  }
  if (nextStatus === 'Validating') {
    traction.leads_found = Math.max(Number(traction.leads_found || 0), 25);
    traction.messages_drafted = Math.max(Number(traction.messages_drafted || 0), 25);
  }
  if (nextStatus === 'Launched') {
    traction.messages_sent = Math.max(Number(traction.messages_sent || 0), 25);
    traction.replies = Math.max(Number(traction.replies || 0), 3);
  }
  if (nextStatus === 'Revenue' || nextStatus === 'Scaling') {
    traction.replies = Math.max(Number(traction.replies || 0), 5);
    traction.calls_booked = Math.max(Number(traction.calls_booked || 0), 2);
    traction.revenue = Math.max(Number(traction.revenue || 0), 300);
  }

  return {
    ...experiment,
    status: nextStatus,
    traction
  };
}
