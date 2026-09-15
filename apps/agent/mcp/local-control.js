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
} = require('../connectors/control/local-machine');

const server = new McpServer({ name: '3dvr-local-control', version: '0.4.0' });
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
  version: '0.4.0',
  mutationsEnabled: policy.enableMutations,
  serviceAllowlist: policy.services,
  fileRoots: policy.fileRoots,
  maxReadBytes: policy.maxReadBytes,
  maxWriteBytes: policy.maxWriteBytes,
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

if (policy.enableMutations) {
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
