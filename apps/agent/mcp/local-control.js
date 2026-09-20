'use strict';

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const z = require('zod/v4');

const { appendAudit } = require('../connectors/audit/log');
const {
  fileList,
  fileRead,
  fileWrite,
  hostStatus,
  loadPolicy,
  serviceAction,
  serviceStatus,
  storeOpenAiAdminFromBrowserClipboard,
  createSecretHandoff,
  n8nExecutions,
  n8nStatus,
  n8nTargets,
  n8nWorkflows,
  secretStatus,
} = require('../connectors/control/local-machine');

const server = new McpServer({ name: '3dvr-local-control', version: '0.6.0' });
const policy = loadPolicy(process.env);

function output(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

async function auditedMutation(tool, target, action) {
  try {
    const value = await action();
    appendAudit({ actor: 'local-control-mcp', tool, target, result: 'success' });
    return output(value);
  } catch (error) {
    appendAudit({ actor: 'local-control-mcp', tool, target, result: 'error', error: error?.message || error });
    throw error;
  }
}

server.registerTool('control_status', {
  title: 'Local control status',
  description: 'Show the local control policy without exposing secrets.',
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async () => output({
  service: '3dvr-local-control',
  version: '0.6.0',
  mutationsEnabled: policy.enableMutations,
  serviceAllowlist: policy.services,
  fileRoots: policy.fileRoots,
  maxReadBytes: policy.maxReadBytes,
  maxWriteBytes: policy.maxWriteBytes,
  n8nTargets: Object.keys(n8nTargets(process.env)),
}));

server.registerTool('host_status', {
  title: 'Host status',
  description: 'Read status for the local machine running this MCP process.',
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async () => output(hostStatus()));

server.registerTool('service_status', {
  title: 'Service status',
  description: 'Read status for one locally allowlisted systemd service.',
  inputSchema: { service: z.string().min(1) },
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async ({ service }) => output(await serviceStatus(service, { policy })));

server.registerTool('file_list', {
  title: 'List controlled directory',
  description: 'List a local directory inside the configured file roots.',
  inputSchema: { path: z.string().min(1), limit: z.number().int().min(1).max(500).default(200) },
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async ({ path, limit }) => output(fileList(path, { policy, limit })));

server.registerTool('file_read', {
  title: 'Read controlled file',
  description: 'Read a UTF-8 file inside the configured file roots.',
  inputSchema: { path: z.string().min(1) },
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async ({ path }) => output(fileRead(path, { policy })));

server.registerTool('secret_status', {
  title: 'Check secret status',
  description: 'Check whether a named credential exists in OpenBao without returning its value.',
  inputSchema: { key: z.string().min(1).max(500) },
  annotations: { readOnlyHint: true, openWorldHint: false },
}, async ({ key }) => output(secretStatus(key)));

server.registerTool('n8n_status', {
  title: 'Check n8n API',
  description: 'Check one configured n8n target and verify API authorization without returning workflow content.',
  inputSchema: { target: z.string().default('cvw') },
  annotations: { readOnlyHint: true, openWorldHint: true },
}, async ({ target }) => output(await n8nStatus(target)));

server.registerTool('n8n_workflows', {
  title: 'List n8n workflows',
  description: 'List safe workflow metadata only. Node definitions, credentials, pinned data, and workflow payloads are never returned.',
  inputSchema: {
    target: z.string().default('cvw'),
    active: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
}, async ({ target, active, limit }) => output(await n8nWorkflows({ target, active, limit })));

server.registerTool('n8n_executions', {
  title: 'List n8n executions',
  description: 'List execution metadata only with includeData=false. Execution payloads and node data are never returned.',
  inputSchema: {
    target: z.string().default('cvw'),
    workflow_id: z.string().optional(),
    status: z.enum(['canceled', 'error', 'running', 'success', 'waiting']).optional(),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
}, async ({ target, workflow_id, status, limit }) => output(await n8nExecutions({
  target, workflowId: workflow_id, status, limit,
})));

if (policy.enableMutations) {
  server.registerTool('secret_handoff', {
    title: 'Create secure secret handoff',
    description: 'Create a one-time encrypted browser handoff for a credential. The credential itself never passes through MCP or chat.',
    inputSchema: {
      key: z.string().min(1).max(500),
      label: z.string().min(1).max(200),
      purpose: z.string().max(1000).default(''),
      recipient: z.string().max(200).default(''),
      ttl_minutes: z.number().int().min(10).max(10080).default(1440),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ key, label, purpose, recipient, ttl_minutes }) => auditedMutation(
    'secret.handoff',
    key,
    () => createSecretHandoff({ key, label, purpose, recipient, ttlMinutes: ttl_minutes }),
  ));

  server.registerTool('service_restart', {
    title: 'Restart controlled service',
    description: 'Restart one locally allowlisted systemd service through the narrow privileged helper.',
    inputSchema: { service: z.string().min(1) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ service }) => auditedMutation(
    'service.restart',
    service,
    () => serviceAction(service, 'restart', { policy }),
  ));

  server.registerTool('openai_admin_store_from_browser_clipboard', {
    title: 'Store OpenAI admin key from browser clipboard',
    description: 'Store the already-copied OpenAI Admin credential from the local OpenAI browser session directly into OpenBao. The credential is never returned by this tool.',
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => auditedMutation(
    'secret.store.openai-admin-from-browser-clipboard',
    'OPENAI_ADMIN_KEY',
    () => storeOpenAiAdminFromBrowserClipboard(),
  ));

  server.registerTool('file_write', {
    title: 'Write controlled file',
    description: 'Atomically write one UTF-8 file inside the configured file roots.',
    inputSchema: { path: z.string().min(1), content: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ path, content }) => auditedMutation(
    'file.write',
    path,
    async () => fileWrite(path, content, { policy }),
  ));
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
