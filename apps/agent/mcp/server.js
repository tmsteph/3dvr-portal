const crypto = require('crypto');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { createMcpExpressApp } = require('@modelcontextprotocol/sdk/server/express.js');
const z = require('zod/v4');

const { getAccount, listAccounts } = require('../connectors/accounts/registry');
const { createDraft, readMessage, searchMessages } = require('../connectors/google/gmail');
const {
  legacyAccount,
  readLegacyMessage,
  searchLegacyMessages,
} = require('../connectors/google/legacy-imap');
const { appendAudit } = require('../connectors/audit/log');

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
  const auditImpl = options.auditImpl || appendAudit;
  const enableDrafts = options.enableDrafts ?? process.env.THREEDVR_MCP_ENABLE_DRAFTS === 'true';
  const currentLegacyAccount = () => legacyAccountImpl(options.legacyConfig || process.env);
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
    name: '3dvr-personal-gateway',
    version: '0.1.0',
    websiteUrl: 'https://3dvr.tech',
  });

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
      ? searchLegacyMessagesImpl({ query, maxResults: max_results, config: options.legacyConfig || process.env })
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
      ? readLegacyMessageImpl({ messageId: message_id, format, config: options.legacyConfig || process.env })
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
    res.json({ ok: true, service: '3dvr-personal-gateway', version: '0.1.0' });
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
  createGatewayMcpServer,
  createHttpApp,
  isLoopbackHost,
  publicAccount,
  safeTokenEqual,
  startHttpServer,
};

if (require.main === module) {
  startHttpServer().then(({ host, port }) => {
    console.log(`3DVR personal MCP gateway listening on http://${host}:${port}/mcp`);
  }).catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}
