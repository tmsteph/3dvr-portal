#!/usr/bin/env node
'use strict';

function mailToolCall(args) {
  const [command = 'accounts', account, value = '', format = 'metadata'] = args;
  if (command === 'accounts') return { name: 'accounts_list', arguments: { provider: 'google' } };
  if (!account) throw new Error('Select a mailbox: search 3dvr "query" or read 3dvr MESSAGE_ID [full].');
  if (command === 'search') {
    return { name: 'gmail_search', arguments: { account_id: account, query: value, max_results: 25 } };
  }
  if (command === 'read' && value && ['metadata', 'full'].includes(format)) {
    return { name: 'gmail_read', arguments: { account_id: account, message_id: value, format } };
  }
  throw new Error('Use accounts, search ACCOUNT "query", or read ACCOUNT MESSAGE_ID [metadata|full].');
}

async function main(args = process.argv.slice(2)) {
  const request = mailToolCall(args);
  const token = process.env.THREEDVR_MCP_AUTH_TOKEN;
  if (!token) throw new Error('The server MCP credential is unavailable; load the existing server config.');
  const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const url = new URL(process.env.THREEDVR_MCP_URL || 'http://127.0.0.1:8788/mcp');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) {
    throw new Error('Mail connector requires HTTPS or a loopback URL.');
  }
  const client = new Client({ name: '3dvr-mail-cli', version: '1.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { Authorization: 'Bearer ' + token } },
    }));
    const result = await client.callTool(request);
    if (result.isError) throw new Error(result.content?.find((block) => block.type === 'text')?.text || 'Mail connector failed.');
    for (const block of result.content || []) {
      if (block.type === 'text') process.stdout.write(block.text + '\n');
    }
  } finally {
    await client.close();
  }
}

module.exports = { mailToolCall };
if (require.main === module) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
