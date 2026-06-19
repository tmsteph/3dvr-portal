// Shared Money Printer definitions for the web dashboard, future CLI, and server daemon.
// Keep this module browser-safe and Node-safe: no DOM, no localStorage, no provider SDK imports.

/**
 * @typedef {Object} BusinessIdea
 * @property {string} id
 * @property {string} business_name
 * @property {string} target_customer
 * @property {string} customer_pain
 * @property {string} offer
 * @property {string} why_now
 * @property {string} revenue_path
 * @property {string} first_test_this_week
 * @property {string[]} tools_needed
 * @property {number} difficulty_score
 * @property {number} speed_to_cash_score
 * @property {number} founder_fit_score
 * @property {number} total_score
 * @property {'test'|'hold'|'kill'} recommendation
 */

/**
 * @typedef {Object} BusinessExperiment
 * @property {string} id
 * @property {string} name
 * @property {string} customer
 * @property {string} pain
 * @property {string} offer
 * @property {string} price_test
 * @property {string} validation_test
 * @property {string} status
 * @property {Object} traction
 * @property {string} next_action
 */

export const DEFAULT_MISSION = 'Help independent builders turn purpose into operating businesses.';

export const EXPERIMENT_STATUSES = [
  'Idea',
  'Researching',
  'Validating',
  'Building',
  'Launched',
  'Revenue',
  'Killed',
  'Scaling'
];

export const AUTONOMY_ZONES = [
  {
    zone: 'GREEN ZONE',
    label: 'AI just does it',
    tone: 'green',
    description: 'Default delegated work that improves speed without creating external risk.',
    examples: [
      'market research',
      'competitor scans',
      'writing docs',
      'creating GitHub issues',
      'opening branches',
      'editing code',
      'running tests',
      'creating Vercel previews',
      'drafting content',
      'updating internal CRM notes',
      'creating reports',
      'proposing offers',
      'improving prompts',
      'organizing files'
    ]
  },
  {
    zone: 'YELLOW ZONE',
    label: 'AI acts, then reports',
    tone: 'yellow',
    description: 'Useful changes with modest external surface area. The founder gets a clear report after action.',
    examples: [
      'publishing blog posts',
      'updating landing pages',
      'sending very low-risk follow-ups',
      'changing non-critical UI',
      'creating new automations',
      'modifying internal dashboards',
      'creating customer proposals'
    ]
  },
  {
    zone: 'RED ZONE',
    label: 'human approval required',
    tone: 'red',
    description: 'Anything involving money movement, irreversible changes, legal exposure, or reputation risk.',
    examples: [
      'spending money',
      'sending mass email',
      'deleting data',
      'changing DNS',
      'merging to production on core apps',
      'signing contracts',
      'issuing refunds',
      'changing prices',
      'touching payroll/taxes/legal claims'
    ]
  }
];

export const TOOL_DEFINITIONS = [
  {
    id: 'github',
    name: 'GitHub',
    envVars: ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO'],
    status: 'Mock mode',
    capabilities: [
      'Create validation issues',
      'Open experiment branches',
      'Draft pull request plans',
      'Track implementation tasks'
    ]
  },
  {
    id: 'vercel',
    name: 'Vercel',
    envVars: ['VERCEL_TOKEN', 'VERCEL_PROJECT_ID', 'VERCEL_TEAM_ID'],
    status: 'Mock mode',
    capabilities: [
      'Create preview deployments',
      'Inspect deploy status',
      'Attach offer pages to experiments',
      'Report changed URLs'
    ]
  },
  {
    id: 'email',
    name: 'Email',
    envVars: ['EMAIL_API_KEY'],
    status: 'Needs connection',
    capabilities: [
      'Draft outreach',
      'Prepare follow-ups',
      'Write reply templates',
      'Queue messages for human approval'
    ]
  },
  {
    id: 'crm',
    name: 'CRM',
    envVars: ['CRM_API_KEY'],
    status: 'Needs connection',
    capabilities: [
      'Write CRM notes',
      'Create lead lists',
      'Track replies and calls',
      'Flag stale opportunities'
    ]
  },
  {
    id: 'analytics',
    name: 'Analytics',
    envVars: ['ANALYTICS_API_KEY'],
    status: 'Needs connection',
    capabilities: [
      'Read landing-page traffic',
      'Report conversion rates',
      'Compare experiments',
      'Find drop-off points'
    ]
  },
  {
    id: 'stripe',
    name: 'Stripe / Payments',
    envVars: ['STRIPE_SECRET_KEY'],
    status: 'Needs connection',
    capabilities: [
      'Read revenue',
      'Inspect checkout completion',
      'Prepare pricing tests',
      'Report paid conversion'
    ]
  },
  {
    id: 'calendar',
    name: 'Calendar',
    envVars: ['CALENDAR_API_KEY'],
    status: 'Needs connection',
    capabilities: [
      'Find available call slots',
      'Draft booking links',
      'Summarize sales calls',
      'Create follow-up reminders'
    ]
  },
  {
    id: 'docs',
    name: 'Docs / Knowledge Base',
    envVars: ['DOCS_API_KEY'],
    status: 'Needs connection',
    capabilities: [
      'Write operating docs',
      'Store founder briefs',
      'Archive validation learnings',
      'Improve internal playbooks'
    ]
  }
];
