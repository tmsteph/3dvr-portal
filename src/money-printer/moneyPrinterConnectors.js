// Connector contracts for money-printer-core.
// Current implementations are mocks; future CLI/server daemon code can swap these for provider-backed adapters.

function nowIso() {
  return new Date().toISOString();
}

function mockResponse(connector, action, payload = {}) {
  return {
    ok: true,
    mode: 'mock',
    connector,
    action,
    payload,
    generatedAt: nowIso()
  };
}

export class AgentToolConnector {
  constructor({ id, name, envVars = [], capabilities = [] }) {
    this.id = id;
    this.name = name;
    this.envVars = envVars;
    this.capabilities = capabilities;
  }

  async readStatus() {
    return {
      id: this.id,
      name: this.name,
      status: 'Mock mode',
      envVars: this.envVars,
      capabilities: this.capabilities,
      connected: false,
      mode: 'mock',
      message: `${this.name} connector is ready for real credentials, but no external calls run in this MVP.`
    };
  }

  async createIssue(payload = {}) {
    return mockResponse(this.name, 'createIssue', payload);
  }

  async createBranch(payload = {}) {
    return mockResponse(this.name, 'createBranch', payload);
  }

  async openPullRequest(payload = {}) {
    return mockResponse(this.name, 'openPullRequest', payload);
  }

  async createPreviewDeployment(payload = {}) {
    return mockResponse(this.name, 'createPreviewDeployment', payload);
  }

  async writeCrmNote(payload = {}) {
    return mockResponse(this.name, 'writeCrmNote', payload);
  }

  async draftEmail(payload = {}) {
    return mockResponse(this.name, 'draftEmail', payload);
  }

  async generateReport(payload = {}) {
    return mockResponse(this.name, 'generateReport', payload);
  }

  async readRevenue(payload = {}) {
    return mockResponse(this.name, 'readRevenue', {
      ...payload,
      revenue: 0,
      currency: 'USD'
    });
  }

  async readAnalytics(payload = {}) {
    return mockResponse(this.name, 'readAnalytics', {
      ...payload,
      visitors: 0,
      conversions: 0,
      conversionRate: 0
    });
  }

  async createValidationTask(payload = {}) {
    return mockResponse(this.name, 'createValidationTask', payload);
  }
}

export class GitHubConnector extends AgentToolConnector {
  constructor() {
    super({
      id: 'github',
      name: 'GitHub',
      envVars: ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO'],
      capabilities: ['createIssue', 'createBranch', 'openPullRequest', 'createValidationTask']
    });
  }
}

export class VercelConnector extends AgentToolConnector {
  constructor() {
    super({
      id: 'vercel',
      name: 'Vercel',
      envVars: ['VERCEL_TOKEN', 'VERCEL_PROJECT_ID', 'VERCEL_TEAM_ID'],
      capabilities: ['createPreviewDeployment', 'generateReport']
    });
  }
}

export class CrmConnector extends AgentToolConnector {
  constructor() {
    super({
      id: 'crm',
      name: 'CRM',
      envVars: ['CRM_API_KEY'],
      capabilities: ['writeCrmNote', 'createValidationTask', 'generateReport']
    });
  }
}

export class EmailConnector extends AgentToolConnector {
  constructor() {
    super({
      id: 'email',
      name: 'Email',
      envVars: ['EMAIL_API_KEY'],
      capabilities: ['draftEmail', 'createValidationTask']
    });
  }
}

export class AnalyticsConnector extends AgentToolConnector {
  constructor() {
    super({
      id: 'analytics',
      name: 'Analytics',
      envVars: ['ANALYTICS_API_KEY'],
      capabilities: ['readAnalytics', 'generateReport']
    });
  }
}

export class StripeConnector extends AgentToolConnector {
  constructor() {
    super({
      id: 'stripe',
      name: 'Stripe / Payments',
      envVars: ['STRIPE_SECRET_KEY'],
      capabilities: ['readRevenue', 'generateReport']
    });
  }
}

export const moneyPrinterConnectors = {
  github: new GitHubConnector(),
  vercel: new VercelConnector(),
  crm: new CrmConnector(),
  email: new EmailConnector(),
  analytics: new AnalyticsConnector(),
  stripe: new StripeConnector()
};

export async function readConnectorStatuses(connectors = moneyPrinterConnectors) {
  return Promise.all(
    Object.values(connectors).map(connector => connector.readStatus())
  );
}
