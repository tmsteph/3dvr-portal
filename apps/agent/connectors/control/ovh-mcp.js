'use strict';

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

function parseToolResult(result) {
  const item = Array.isArray(result?.content)
    ? result.content.find(entry => entry?.type === 'text')
    : null;
  if (!item?.text) throw new Error('OVH control MCP returned no text result');
  if (result?.isError) throw new Error(String(item.text).slice(0, 1000));
  try { return JSON.parse(item.text); }
  catch { throw new Error('OVH control MCP returned invalid JSON'); }
}

async function callOvhTool(name, args = {}, options = {}) {
  const host = String(options.host || process.env.THREEDVR_OVH_SSH_HOST || '3dvr-ovh').trim();
  if (!/^[A-Za-z0-9_.@-]+$/.test(host)) throw new Error('OVH SSH host is invalid');

  const client = new Client({ name: '3dvr-control-gateway-proxy', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: options.sshCommand || 'ssh',
    args: [
      '-T',
      '-o', 'BatchMode=yes',
      '-o', 'ConnectTimeout=8',
      host,
      'sudo', '-n', '/usr/local/libexec/3dvr-control-mcp-root',
    ],
    stderr: 'pipe',
  });

  const timeoutMs = Math.max(1000, Math.min(Number(options.timeoutMs || 30000), 120000));
  let timer;
  try {
    await client.connect(transport);
    const call = client.callTool({ name, arguments: args || {} });
    const result = await Promise.race([
      call,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`OVH control tool timed out: ${name}`)), timeoutMs);
      }),
    ]);
    return parseToolResult(result);
  } finally {
    clearTimeout(timer);
    await transport.close().catch(() => {});
  }
}

module.exports = {
  callOvhTool,
  parseToolResult,
};
