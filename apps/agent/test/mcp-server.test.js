const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { appendAudit } = require('../connectors/audit/log');
const { parseAgentTokens, startHttpServer } = require('../mcp/server');

function parseToolResult(result) {
  return JSON.parse(result.content.find((item) => item.type === 'text').text);
}

async function openTestGateway(t, { enableDrafts = false, legacy = false, enablePrivileged = false, ownerAuthorized = false, clientToken = 'test-token', agentTokens } = {}) {
  const audits = [];
  const account = {
    id: 'acct_google_test', provider: 'google', alias: 'personal',
    email: 'person@example.com', scopes: ['gmail.readonly'],
    status: 'connected', credentialRef: 'must-not-leak',
  };
  const gatewayOptions = {
    enableDrafts,
    enablePrivileged,
    auditImpl: (event) => audits.push(event),
    listAccountsImpl: () => [account],
    getAccountImpl: () => account,
    legacyAccountImpl: () => (legacy ? {
      id: 'acct_google_legacy_3dvr', provider: 'google', alias: '3dvr',
      email: '3dvr.tech@gmail.com', scopes: ['gmail.readonly'], status: 'connected',
    } : null),
    searchMessagesImpl: async ({ accountId, query, maxResults }) => ({
      account, messages: [{ id: 'm1', threadId: 't1' }],
      resultSizeEstimate: 1, accountId, query, maxResults,
    }),
    readMessageImpl: async ({ accountId, messageId, format }) => ({
      account, message: { id: messageId, snippet: 'hello', format }, accountId,
    }),
    searchLegacyMessagesImpl: async ({ query, maxResults }) => ({
      account: { alias: '3dvr' }, messages: [{ id: '77', source: 'legacy-imap' }],
      resultSizeEstimate: 1, query, maxResults, source: 'legacy-imap',
    }),
    readLegacyMessageImpl: async ({ messageId, format }) => ({
      account: { alias: '3dvr' }, message: { id: messageId, format, source: 'legacy-imap' },
    }),
    createDraftImpl: async ({ accountId, to, subject }) => ({
      account, draft: { id: 'd1', accountId, to, subject },
    }),
    crmConfiguredImpl: () => true,
    crmSummaryImpl: async () => ({ backend: 'postgres', total: 12, suppressed: 1 }),
    searchCrmContactsImpl: async ({ query, limit, includeSuppressed }) => ({
      backend: 'postgres', query, limit, includeSuppressed,
      contacts: [{ contactId: 'contact-1', name: 'Test Customer' }],
    }),
    readCrmContactImpl: async ({ contactId, activityLimit }) => ({
      backend: 'postgres', contact: { contactId, name: 'Test Customer' },
      activities: [{ activityId: 'activity-1', activityLimit }],
    }),
    serversHealthImpl: async ({ servers }) => ({
      ok: true,
      servers: (servers || ['hetzner', 'ovh', 'digitalocean']).map(name => ({ name, ok: true })),
    }),
    githubOverviewImpl: async ({ repo, limit }) => ({
      repo: { nameWithOwner: repo },
      openPullRequests: [{ number: 2301, title: 'Control MCP' }],
      limit,
    }),
    organismRecallImpl: async (query, { limit }) => ({
      question: query,
      strategy: 'test',
      hits: [{ memory: { id: 'memory-1', content: 'Shared Operator memory' }, score: 1 }],
      text: `Relevant memory for ${query}`,
      limit,
    }),
    organismRememberImpl: async (content, options) => ({
      id: 'memory-written',
      content,
      subject: options.subject,
      kind: options.kind,
      sourceId: options.sourceId,
    }),
    callOvhToolImpl: async (name, args) => ({
      source: 'ovh-mcp',
      name,
      args,
      ...(name === 'secret_status' ? { key: args.key, exists: true, backend: 'openbao' } : {}),
      ...(name === 'n8n_status' ? { api: { ok: true, authorized: true, status: 200 } } : {}),
      ...(name === 'n8n_watchdog' ? { baseline: { actualTotalWorkflows: 29, actualActiveWorkflows: 18 }, findings: [] } : {}),
    }),
  };
  const started = await startHttpServer({
    port: 0, authToken: 'test-token', ownerToken: 'test-owner-token', gatewayOptions, agentTokens,
  });
  const client = new Client({ name: '3dvr-test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${started.port}/mcp`),
    { requestInit: { headers: {
      Authorization: `Bearer ${clientToken}`,
      ...(ownerAuthorized ? { 'x-3dvr-owner-authorization': 'Bearer test-owner-token' } : {}),
    } } },
  );
  await client.connect(transport);
  t.after(async () => {
    await transport.close().catch(() => {});
    await new Promise((resolve) => started.httpServer.close(resolve));
  });
  return { client, audits };
}

test('MCP gateway exposes the read-only 3DVR control surface by default', async (t) => {
  const { client } = await openTestGateway(t);
  const listed = await client.listTools();
  const byName = new Map(listed.tools.map((tool) => [tool.name, tool]));

  assert.deepEqual([...byName.keys()].sort(), [
    'accounts_get', 'accounts_list', 'control_status', 'crm_read', 'crm_search',
    'crm_summary', 'github_overview', 'gmail_read', 'gmail_search', 'organism_recall', 'servers_health',
  ]);
  for (const tool of byName.values()) assert.equal(tool.annotations.readOnlyHint, true);

  const status = parseToolResult(await client.callTool({ name: 'control_status', arguments: {} }));
  assert.equal(status.service, '3dvr-control-gateway');
  assert.equal(status.mode, 'read-only');
  assert.equal(status.capabilities.crm.backend, 'postgres');
  assert.equal(status.capabilities.crm.configured, true);

  const result = parseToolResult(await client.callTool({ name: 'accounts_list', arguments: {} }));
  assert.equal(result.accounts[0].alias, 'personal');
  assert.equal('credentialRef' in result.accounts[0], false);
});

test('CRM, server, and GitHub control tools stay read-only and scoped', async (t) => {
  const { client } = await openTestGateway(t);
  const summary = parseToolResult(await client.callTool({ name: 'crm_summary', arguments: {} }));
  assert.equal(summary.backend, 'postgres');
  assert.equal(summary.total, 12);

  const search = parseToolResult(await client.callTool({
    name: 'crm_search',
    arguments: { query: 'customer', limit: 5, include_suppressed: false },
  }));
  assert.equal(search.query, 'customer');
  assert.equal(search.limit, 5);
  assert.equal(search.includeSuppressed, false);
  assert.equal(search.contacts[0].contactId, 'contact-1');

  const crmRead = parseToolResult(await client.callTool({
    name: 'crm_read', arguments: { contact_id: 'contact-1', activity_limit: 3 },
  }));
  assert.equal(crmRead.contact.contactId, 'contact-1');
  assert.equal(crmRead.activities[0].activityLimit, 3);

  const memory = parseToolResult(await client.callTool({
    name: 'organism_recall', arguments: { query: 'What was Operator doing?', limit: 4 },
  }));
  assert.equal(memory.question, 'What was Operator doing?');
  assert.match(memory.text, /Relevant memory/);

  const health = parseToolResult(await client.callTool({
    name: 'servers_health', arguments: { servers: ['hetzner', 'ovh'] },
  }));
  assert.deepEqual(health.servers.map(row => row.name), ['hetzner', 'ovh']);

  const github = parseToolResult(await client.callTool({
    name: 'github_overview', arguments: { repo: 'tmsteph/3dvr-portal', limit: 4 },
  }));
  assert.equal(github.repo.nameWithOwner, 'tmsteph/3dvr-portal');
  assert.equal(github.limit, 4);
});

test('Gmail search and read stay scoped to the selected account and are audited', async (t) => {
  const { client, audits } = await openTestGateway(t);
  const search = parseToolResult(await client.callTool({
    name: 'gmail_search',
    arguments: { account_id: 'personal', query: 'from:test', max_results: 5 },
  }));
  assert.equal(search.accountId, 'personal');
  assert.equal(search.query, 'from:test');
  assert.equal(search.maxResults, 5);

  const read = parseToolResult(await client.callTool({
    name: 'gmail_read',
    arguments: { account_id: 'personal', message_id: 'm1' },
  }));
  assert.equal(read.message.id, 'm1');
  assert.equal(read.message.format, 'metadata');
  assert.deepEqual(audits.map((event) => event.tool), ['gmail.search', 'gmail.read']);
});

test('legacy 3dvr Gmail account is discoverable and routed through IMAP read tools', async (t) => {
  const { client } = await openTestGateway(t, { legacy: true });
  const accounts = parseToolResult(await client.callTool({ name: 'accounts_list', arguments: {} }));
  assert.deepEqual(accounts.accounts.map((row) => row.alias).sort(), ['3dvr', 'personal']);

  const search = parseToolResult(await client.callTool({
    name: 'gmail_search',
    arguments: { account_id: '3dvr', query: 'newer_than:7d', max_results: 3 },
  }));
  assert.equal(search.source, 'legacy-imap');
  assert.equal(search.messages[0].id, '77');

  const read = parseToolResult(await client.callTool({
    name: 'gmail_read',
    arguments: { account_id: 'acct_google_legacy_3dvr', message_id: '77' },
  }));
  assert.equal(read.message.source, 'legacy-imap');
  assert.equal(read.message.format, 'metadata');
});

test('privileged configuration alone does not grant owner tools', async (t) => {
  const { client } = await openTestGateway(t, { enablePrivileged: true });
  const listed = await client.listTools();
  assert.equal(listed.tools.some((tool) => tool.name === 'secret_status'), false);
  assert.equal(listed.tools.some((tool) => tool.name === 'n8n_status'), false);
  const status = parseToolResult(await client.callTool({ name: 'control_status', arguments: {} }));
  assert.equal(status.capabilities.ownerAuthorized, false);
  assert.equal(status.capabilities.privilegedControl, false);
  assert.deepEqual(status.capabilities.n8n, []);
});

test('OVH and n8n bridge tools are opt-in and stay scoped', async (t) => {
  const { client } = await openTestGateway(t, { enablePrivileged: true, ownerAuthorized: true });
  const listed = await client.listTools();
  const names = listed.tools.map(tool => tool.name);

  for (const name of ['secret_status', 'n8n_status', 'n8n_watchdog', 'n8n_workflows', 'n8n_executions', 'service_status']) {
    assert.equal(names.includes(name), true);
    assert.equal(listed.tools.find(tool => tool.name === name).annotations.readOnlyHint, true);
  }
  const rememberTool = listed.tools.find(tool => tool.name === 'organism_remember');
  assert.equal(Boolean(rememberTool), true);
  assert.equal(rememberTool.annotations.readOnlyHint, false);
  assert.equal(rememberTool.annotations.destructiveHint, false);

  const remembered = parseToolResult(await client.callTool({
    name: 'organism_remember',
    arguments: {
      content: 'A useful shared fact',
      subject: 'Operator',
      kind: 'conversation',
      source_id: 'chatgpt:test-turn',
    },
  }));
  assert.equal(remembered.sourceId, 'chatgpt:test-turn');
  assert.equal(remembered.kind, 'conversation');

  const secret = parseToolResult(await client.callTool({
    name: 'secret_status', arguments: { key: 'CVW_N8N_API_KEY' },
  }));
  assert.equal(secret.exists, true);
  assert.equal(secret.backend, 'openbao');

  const n8n = parseToolResult(await client.callTool({
    name: 'n8n_status', arguments: { target: 'cvw' },
  }));
  assert.equal(n8n.api.authorized, true);

  const watchdog = parseToolResult(await client.callTool({
    name: 'n8n_watchdog', arguments: { target: 'cvw' },
  }));
  assert.equal(watchdog.baseline.actualTotalWorkflows, 29);
  assert.deepEqual(watchdog.findings, []);

  const status = parseToolResult(await client.callTool({ name: 'control_status', arguments: {} }));
  assert.equal(status.mode, 'scoped-control');
  assert.equal(status.capabilities.privilegedControl, true);
  assert.deepEqual(status.capabilities.n8n, ['cvw']);
});

test('draft creation is absent by default and opt-in when explicitly enabled', async (t) => {
  const { client } = await openTestGateway(t, { enableDrafts: true });
  const listed = await client.listTools();
  const draftTool = listed.tools.find((tool) => tool.name === 'gmail_create_draft');
  assert.equal(draftTool.annotations.readOnlyHint, false);
  assert.equal(draftTool.annotations.destructiveHint, false);
});

test('audit persistence hashes search text instead of storing it verbatim', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-mcp-audit-'));
  const filePath = path.join(root, 'audit.ndjson');
  appendAudit({
    actor: 'chatgpt-mcp', tool: 'crm.search', accountId: 'personal',
    query: 'private customer name', result: 'success',
  }, { filePath });

  const raw = fs.readFileSync(filePath, 'utf8');
  const record = JSON.parse(raw.trim());
  assert.equal(raw.includes('private customer name'), false);
  assert.equal(record.queryHash.length, 16);
  assert.equal(record.result, 'success');
});

test('public binding fails closed without an auth token', async () => {
  await assert.rejects(
    () => startHttpServer({ host: '0.0.0.0', port: 0, authToken: '' }),
    /AUTH_TOKEN is required/,
  );
});

test('agent token map parsing is defensive', () => {
  assert.deepEqual(parseAgentTokens('{"claude":"tok-a","Operator":"tok-b"}'), {
    claude: 'tok-a', operator: 'tok-b',
  });
  assert.deepEqual(parseAgentTokens(''), {});
  assert.deepEqual(parseAgentTokens('not json'), {});
  assert.deepEqual(parseAgentTokens('["claude"]'), {});
  assert.deepEqual(parseAgentTokens('{"bad name!":"x","ok":""}'), {});
  assert.deepEqual(parseAgentTokens(null), {});
});

test('per-agent tokens authenticate and stamp the audit actor', async (t) => {
  const legacy = await openTestGateway(t);
  await legacy.client.callTool({ name: 'control_status', arguments: {} });
  assert.ok(legacy.audits.length > 0);
  assert.ok(legacy.audits.every((event) => event.actor === 'chatgpt'));

  const claudeGateway = await openTestGateway(t, {
    clientToken: 'claude-token',
    agentTokens: { claude: 'claude-token', operator: 'operator-token' },
  });
  await claudeGateway.client.callTool({ name: 'control_status', arguments: {} });
  assert.ok(claudeGateway.audits.length > 0);
  assert.ok(claudeGateway.audits.every((event) => event.actor === 'claude'));
});

test('requests with an unknown or missing bearer token are rejected', async (t) => {
  const started = await startHttpServer({
    port: 0,
    authToken: 'test-token',
    agentTokens: { claude: 'claude-token' },
    gatewayOptions: {},
  });
  t.after(() => new Promise((resolve) => started.httpServer.close(resolve)));
  const url = `http://127.0.0.1:${started.port}/mcp`;
  const initBody = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'bad-token-test', version: '1.0.0' },
    },
  });
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  const bad = await fetch(url, {
    method: 'POST',
    headers: { ...headers, authorization: 'Bearer not-a-real-token' },
    body: initBody,
  });
  assert.equal(bad.status, 401);
  const missing = await fetch(url, { method: 'POST', headers, body: initBody });
  assert.equal(missing.status, 401);
});
