// Prompt templates shared by money-printer-web, future money-printer-cli, and money-printer-daemon.
// Real model calls should consume these templates through the core API rather than from UI code.

export const PROMPT_TEMPLATES = {
  executiveAgent:
    'Given the business config, current experiments, traction, and available tools, decide which bot should run next and create a prioritized action plan.',
  opportunityScanner:
    'Scan the available business context, founder notes, market assumptions, and connected tools. Identify underserved customer pains and rank possible opportunities by urgency, reachability, monetization potential, and speed to validation.',
  businessIdeaGenerator:
    'Generate business ideas that can become real revenue quickly. Prefer service-first, software-later ideas. Avoid vague platforms. Each idea must include buyer, pain, offer, price test, validation test, and first action.',
  marketResearch:
    'Research customers, competitors, pricing, trends, positioning, underserved niches, substitute products, and risky assumptions.',
  validation:
    'Design a test that can validate demand within 7 days without building the full product. Include outreach, landing page, manual concierge version, success metric, failure metric, and next decision.',
  mvpBuilder:
    'Turn a validated idea into the smallest sellable version: landing page, waitlist, demo, service offer, spreadsheet-backed app, or simple web tool.',
  githubBuilder:
    'Create issues, branches, commits, and pull request plans for business improvements.',
  vercelDeployment:
    'Prepare or inspect a preview deployment and report what changed.',
  founderBrief:
    'Summarize what changed, what matters, what to do next, and what the AI system recommends.',
  killOrScale:
    'Review experiment traction. Decide whether to kill, pivot, improve, or scale. Be brutally practical. Optimize for learning speed and revenue.',
  portfolioManager:
    'Review all experiments and recommend where founder attention should go next. Limit active experiments to avoid distraction. Prefer one strong revenue path over five vague ideas.',
  systemImprovement:
    'Review the whole business system, identify bottlenecks, noisy automations, missing loops, broken assumptions, and the highest-leverage improvement. Improve the machine itself.'
};
