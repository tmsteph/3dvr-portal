const crypto = require('crypto');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { createMcpExpressApp } = require('@modelcontextprotocol/sdk/server/express.js');
const z = require('zod/v4');

const { getAccount, listAccounts } = require('../connectors/accounts/registry');
const { appendAudit } = require('../connectors/audit/log');
const { crmConfigured, crmSummary, readCrmContact, searchCrmContacts } = require('../connectors/crm/postgres');
const { githubOverview } = require('../connectors/control/github');
const { SERVER_TARGETS, serversHealth } = require('../connectors/control/servers');
const { createDraft, readMessage, searchMessages } = require('../connectors/google/gmail');
const {
  legacyAccount,
  readLegacyMessage,
  searchLegacyMessages,
} = require('../connectors/google/legacy-imap');

const GATEWAY_NAME = '3dvr-control-gateway';
const GATEWAY_VERSION = '0.2.0';

function publicAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    provider: account.provider,
    alias: account.alias,
    email: account.email,
    scopes: account.scopes || [],
    status: account.status || 'connected',
  };
}

function toolResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

async function audited(tool, meta, action, auditImpl = appendAudit) {
  try {
    const value = await action();
    auditImpl({ actor: 'chatgpt-mcp', tool, ...meta, result: 'success' });
    return toolResult(value);
  } catch (error) {
    auditImpl({
      actor: 'chatgpt-mcp',
      tool,
      ...meta,
      result: 'error',
      error: error?.message || error,
    });
    throw error;
  }
}

function createGatewayMcpServer(options = {}) {
  const listAccountsImpl = options.listAccountsImpl || listAccounts;
  const getAccountImpl = options.getAccountImpl || getAccount;
  const searchMessagesImpl = options.searchMessagesImpl || searchMessages;
  const readMessageImpl = options.readMessageImpl || readMessage;
  const createDraftImpl = options.createDraftImpl || createDraft;
  const legacyAccountImpl = options.legacyAccountImpl || legacyAccount;
  const searchLegacyMessagesImpl = options.searchLegacyMessagesImpl || searchLegacyMessages;
  const readLegacyMessageImpl = options.readLegacyMessageImpl || readLegacyMessage;
  const crmConfiguredImpl = options.crmConfiguredImpl || crmConfigured;
  const crmSummaryImpl = options.crmSummaryImpl || crmSummary;
  const searchCrmContactsImpl = options.searchCrmContactsImpl || searchCrmContacts;
  const readCrmContactImpl = options.readCrmContactImpl || readCrmContact;
  const serversHealthImpl = options.serversHealthImpl || serversHealth;
  const githubOverviewImpl = options.githubOverviewImpl || githubOverview;
  const auditImpl = options.auditImpl || appendAudit;
  const enableDrafts = options.enableDrafts ?? process.env.THREEDVR_MCP_ENABLE_DRAFTS === 'true';
  const legacyConfig = options.legacyConfig || process.env;
  const crmConfig = options.crmConfig || process.env;
  const currentLegacyAccount = () => legacyAccountImpl(legacyConfig);
  const isLegacyIdentifier = (identifier) => {
    const account = currentLegacyAccount();
    if (!account) return false;
    const wanted = String(identifier || '').trim().toLowerCase();
    return [account.id, account.alias, account.email].some((value) => (
      String(value || '').trim().toLowerCase() === wanted
    ));
  };
  const mergedAccounts = (provider) => {
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    const rows = listAccountsImpl({ provider });
    const account = currentLegacyAccount();
    if (account && (!normalizedProvider || normalizedProvider === 'google')) {
      const duplicate = rows.some((candidate) => (
        candidate.id === account.id
        || candidate.alias === account.alias
        || candidate.email === account.email
      ));
      if (!duplicate) rows.push(account);
    }
    return rows;
  };
  const resolveAccount = (identifier) => {
    if (isLegacyIdentifier(identifier)) return currentLegacyAccount();
    return getAccountImpl(identifier);
  };

  const server = new McpServer({
    name: GATEWAY_NAME,
    version: GATEWAY_VERSION,
    websiteUrl: 'https://3dvr.tech',
  });

  server.registerTool('control_status', {
    title: '3DVR control status',
    description: 'Show which read-only control capabilities are available through the private 3DVR gateway.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => audited('control.status', {}, async () => ({
    service: GATEWAY_NAME,
    version: GATEWAY_VERSION,
    mode: enableDrafts ? 'read-mostly-with-opt-in-drafts' : 'read-only',
    capabilities: {
      gmail: true,
      crm: { backend: 'postgres', configured: crmConfiguredImpl(crmConfig) },
      github: true,
      servers: Object.keys(SERVER_TARGETS),
    },
  }), auditImpl));

  server.registerTool('accounts_list', {
    title: 'List connected accounts',
    description: 'List the named provider accounts available through the private 3DVR gateway.',
    inputSchema: {
      provider: z.string().optional().describe('Optional provider filter, for example google.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ provider }) => audited('accounts.list', {}, async () => ({
    accounts: mergedAccounts(provider).map(publicAccount),
  }), auditImpl));

  server.registerTool('accounts_get', {
    title: 'Get connected account',
    description: 'Get safe metadata for one connected provider account by account id or alias.',
    inputSchema: { account_id: z.string().min(1).describe('Account id or alias.') },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ account_id }) => audited('accounts.get', { accountId: account_id }, async () => ({
    account: publicAccount(resolveAccount(account_id)),
  }), auditImpl));

  server.registerTool('crm_summary', {
    title: 'Summarize CRM',
    description: 'Summarize the SQL-backed 3DVR CRM without returning raw import payloads.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => audited('crm.summary', {}, async () => crmSummaryImpl({ config: crmConfig }), auditImpl));

  server.registerTool('crm_search', {
    title: 'Search CRM',
    description: 'Search safe fields in the SQL-backed 3DVR CRM. Suppressed contacts are excluded by default.',
    inputSchema: {
      query: z.string().default('').describe('Name, company, email, website, or status text.'),
      limit: z.number().int().min(1).max(100).default(20),
      include_suppressed: z.boolean().default(false),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ query, limit, include_suppressed }) => audited(
    'crm.search',
    { query },
    async () => searchCrmContactsImpl({
      query,
      limit,
      includeSuppressed: include_suppressed,
      config: crmConfig,
    }),
    auditImpl,
  ));

  server.registerTool('crm_read', {
    title: 'Read CRM contact',
    description: 'Read one SQL CRM contact and recent activity metadata. Activity bodies and raw import payloads are omitted.',
    inputSchema: {
      contact_id: z.string().min(1),
      activity_limit: z.number().int().min(1).max(100).default(20),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ contact_id, activity_limit }) => audited(
    'crm.read',
    { target: contact_id },
    async () => readCrmContactImpl({ contactId: contact_id, activityLimit: activity_limit, config: crmConfig }),
    auditImpl,
  ));

  server.registerTool('servers_health', {
    title: 'Check 3DVR servers',
    description: 'Check read-only health metadata for the known 3DVR server mesh.',
    inputSchema: {
      servers: z.array(z.enum(['hetzner', 'ovh', 'digitalocean'])).max(3).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ servers }) => audited(
    'servers.health',
    {},
    async () => serversHealthImpl({ servers }),
    auditImpl,
  ));

  server.registerTool('github_overview', {
    title: 'GitHub repository overview',
    description: 'Read repository metadata and open pull requests through the authenticated GitHub CLI.',
    inputSchema: {
      repo: z.string().default('tmsteph/3dvr-portal').describe('Repository in owner/name form.'),
      limit: z.number().int().min(1).max(50).default(10),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async ({ repo, limit }) => audited(
    'github.overview',
    { target: repo },
    async () => githubOverviewImpl({ repo, limit }),
    auditImpl,
  ));

  server.registerTool('gmail_search', {
    title: 'Search Gmail',
    description: 'Search one explicitly selected Gmail account and return matching message identifiers.',
    inputSchema: {
      account_id: z.string().min(1).describe('Google account id or alias.'),
      query: z.string().default('').describe('Gmail search query.'),
      max_results: z.number().int().min(1).max(100).default(25),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ account_id, query, max_results }) => audited(
    'gmail.search',
    { accountId: account_id, query },
    async () => (isLegacyIdentifier(account_id)
      ? searchLegacyMessagesImpl({ query, maxResults: max_results, config: legacyConfig })
      : searchMessagesImpl({ accountId: account_id, query, maxResults: max_results })),
    auditImpl,
  ));

  server.registerTool('gmail_read', {
    title: 'Read Gmail message',
    description: 'Read one Gmail message from an explicitly selected account. Metadata is the token-efficient default.',
    inputSchema: {
      account_id: z.string().min(1).describe('Google account id or alias.'),
      message_id: z.string().min(1).describe('Gmail message id.'),
      format: z.enum(['minimal', 'metadata', 'full']).default('metadata'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ account_id, message_id, format }) => audited(
    'gmail.read',
    { accountId: account_id, target: message_id },
    async () => (isLegacyIdentifier(account_id)
      ? readLegacyMessageImpl({ messageId: message_id, format, config: legacyConfig })
      : readMessageImpl({ accountId: account_id, messageId: message_id, format })),
    auditImpl,
  ));

  if (enableDrafts) {
    server.registerTool('gmail_create_draft', {
      title: 'Create Gmail draft',
      description: 'Prepare a Gmail draft in one explicitly selected account. This never sends the message.',
      inputSchema: {
        account_id: z.string().min(1).describe('Google account id or alias.'),
        to: z.string().min(3).describe('Recipient email address.'),
        subject: z.string().min(1),
        body: z.string(),
        thread_id: z.string().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    }, async ({ account_id, to, subject, body, thread_id }) => audited(
      'gmail.create_draft',
      { accountId: account_id, target: to },
      async () => {
        if (isLegacyIdentifier(account_id)) {
          throw new Error('Draft creation for the legacy IMAP account requires OAuth migration.');
        }
        return createDraftImpl({
          accountId: account_id,
          to,
          subject,
          body,
          threadId: thread_id,
        });
      },
      auditImpl,
    ));
  }

  return server;
}

function safeTokenEqual(expected, candidate) {
  if (!expected || !candidate) return false;
  const left = Buffer.from(String(expected));
  const right = Buffer.from(String(candidate));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isLoopbackHost(host) {
  return ['127.0.0.1', 'localhost', '::1'].includes(String(host || '').toLowerCase());
}

function createHttpApp(options = {}) {
  const app = createMcpExpressApp();
  const authToken = options.authToken ?? process.env.THREEDVR_MCP_AUTH_TOKEN ?? '';
  const gatewayOptions = options.gatewayOptions || {};

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, service: GATEWAY_NAME, version: GATEWAY_VERSION });
  });

  app.post('/mcp', async (req, res) => {
    if (authToken) {
      const header = String(req.headers.authorization || '');
      const candidate = header.startsWith('Bearer ') ? header.slice(7) : '';
      if (!safeTokenEqual(authToken, candidate)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
    }

    const server = createGatewayMcpServer(gatewayOptions);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('MCP request failed:', error?.message || error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    } finally {
      await transport.close().catch(() => {});
      await server.close().catch(() => {});
    }
  });

  for (const method of ['get', 'delete']) {
    app[method]('/mcp', (_req, res) => {
      res.status(405).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed.' },
        id: null,
      });
    });
  }

  return app;
}

async function startHttpServer(options = {}) {
  const host = options.host || process.env.THREEDVR_MCP_HOST || '127.0.0.1';
  const port = Number(options.port ?? process.env.THREEDVR_MCP_PORT ?? 8788);
  const authToken = options.authToken ?? process.env.THREEDVR_MCP_AUTH_TOKEN ?? '';
  if (!isLoopbackHost(host) && !authToken) {
    throw new Error('THREEDVR_MCP_AUTH_TOKEN is required when binding outside loopback.');
  }

  const app = createHttpApp({ ...options, authToken });
  const httpServer = await new Promise((resolve, reject) => {
    const listener = app.listen(port, host, () => resolve(listener));
    listener.on('error', reject);
  });
  return { app, httpServer, host, port: httpServer.address().port };
}

module.exports = {
  GATEWAY_NAME,
  GATEWAY_VERSION,
  createGatewayMcpServer,
  createHttpApp,
  isLoopbackHost,
  publicAccount,
  safeTokenEqual,
  startHttpServer,
};

if (require.main === module) {
  startHttpServer().then(({ host, port }) => {
    console.log(`3DVR Control MCP listening on http://${host}:${port}/mcp`);
  }).catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}
