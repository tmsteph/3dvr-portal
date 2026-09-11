const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { appendAudit } = require('../connectors/audit/log');
const { startHttpServer } = require('../mcp/server');

function parseToolResult(result) {
  return JSON.parse(result.content.find((item) => item.type === 'text').text);
}

async function openTestGateway(t, { enableDrafts = false, legacy = false } = {}) {
  const audits = [];
  const account = {
    id: 'acct_google_test', provider: 'google', alias: 'personal',
    email: 'person@example.com', scopes: ['gmail.readonly'],
    status: 'connected', credentialRef: 'must-not-leak',
  };
  const gatewayOptions = {
    enableDrafts,
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
  };
  const started = await startHttpServer({
    port: 0, authToken: 'test-token', gatewayOptions,
  });
  const client = new Client({ name: '3dvr-test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${started.port}/mcp`),
    { requestInit: { headers: { Authorization: 'Bearer test-token' } } },
  );
  await client.connect(transport);
  t.after(async () => {
    await transport.close().catch(() => {});
    await new Promise((resolve) => started.httpServer.close(resolve));
  });
  return { client, audits };
}

test('MCP gateway exposes read-only account and Gmail tools by default', async (t) => {
  const { client } = await openTestGateway(t);
  const listed = await client.listTools();
  const byName = new Map(listed.tools.map((tool) => [tool.name, tool]));

  assert.deepEqual([...byName.keys()].sort(), [
    'accounts_get', 'accounts_list', 'gmail_read', 'gmail_search',
  ]);
  for (const tool of byName.values()) {
    assert.equal(tool.annotations.readOnlyHint, true);
  }

  const result = parseToolResult(await client.callTool({ name: 'accounts_list', arguments: {} }));
  assert.equal(result.accounts[0].alias, 'personal');
  assert.equal('credentialRef' in result.accounts[0], false);
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
    actor: 'chatgpt-mcp', tool: 'gmail.search', accountId: 'personal',
    query: 'subject:private customer name', result: 'success',
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
