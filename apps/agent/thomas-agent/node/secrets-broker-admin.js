#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { AuditChain, DEFAULTS, SecretsBroker, provisionAgent } = require('./secrets-broker');

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) out._.push(arg);
    else if (arg === '--rotate') out.rotate = true;
    else out[arg.slice(2)] = argv[++i] || '';
  }
  return out;
}

function list(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function main() {
  const options = args(process.argv.slice(2));
  const command = options._[0] || 'help';
  if (command === 'provision') {
    const result = provisionAgent({
      agentsFile: options.registry || process.env.THREEDVR_SECRETS_BROKER_AGENTS || DEFAULTS.agentsFile,
      agentId: options._[1],
      tokenFile: options['token-file'],
      capabilities: list(options.capabilities),
      scopes: list(options.scopes),
      label: options.label,
      rotate: Boolean(options.rotate),
    });
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
    return;
  }
  if (command === 'verify-audit') {
    const audit = new AuditChain({
      file: options.file || process.env.THREEDVR_SECRETS_BROKER_AUDIT || DEFAULTS.auditFile,
      keyFile: options['key-file'] || process.env.THREEDVR_SECRETS_BROKER_AUDIT_KEY || DEFAULTS.auditKeyFile,
    });
    const result = audit.verify();
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.ok ? 0 : 2;
    return;
  }
  if (command === 'status') {
    const broker = new SecretsBroker();
    const registry = broker.agents();
    process.stdout.write(`${JSON.stringify({ ok: true, agents: Object.keys(registry.agents || {}).length, policyVersion: broker.policy().version || 1 })}\n`);
    return;
  }
  process.stdout.write([
    '3DVR Secrets Broker admin',
    '  provision AGENT --token-file PATH --capabilities a,b --scopes x,y [--rotate]',
    '  verify-audit [--file PATH --key-file PATH]',
    '  status',
  ].join('\n') + '\n');
}

try { main(); }
catch (error) {
  process.stderr.write(`secrets-broker-admin: ${error.message}\n`);
  process.exitCode = 1;
}
