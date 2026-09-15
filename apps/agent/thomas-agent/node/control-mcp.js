#!/usr/bin/env node
'use strict';

/**
 * 3DVR Control MCP
 *
 * Thin, first-party machine-control boundary for 3DVR.
 *
 * Design goals:
 * - UI-independent
 * - transport-agnostic capability contract
 * - boring Unix primitives underneath
 * - no custom cryptography
 * - no implicit privilege escalation
 * - audit every mutation
 *
 * This initial scaffold intentionally exposes only safe discovery methods.
 * Mutating tools should be added behind explicit policy checks.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const VERSION = '0.1.0';
const DEFAULT_AUDIT_LOG = process.env.THREEDVR_CONTROL_AUDIT_LOG || '/var/log/3dvr-control-mcp/audit.jsonl';

function now() {
  return new Date().toISOString();
}

function writeAudit(event) {
  const record = JSON.stringify({ ts: now(), ...event }) + '\n';
  try {
    fs.mkdirSync(path.dirname(DEFAULT_AUDIT_LOG), { recursive: true });
    fs.appendFileSync(DEFAULT_AUDIT_LOG, record, { mode: 0o600 });
  } catch (error) {
    // A read-only discovery call should not become unusable because the audit
    // destination has not been provisioned yet. Mutating calls must fail closed.
    if (event.mutating) throw error;
  }
}

const capabilities = Object.freeze([
  'host.status',
  'service.status',
  'file.read',
  'file.list',
  'browser.status',
  'secret.get',
  'secret.list',
  'audit.list',
]);

function hostStatus() {
  const result = {
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    uptimeSeconds: Math.floor(os.uptime()),
    loadAverage: os.loadavg(),
    memory: {
      total: os.totalmem(),
      free: os.freemem(),
    },
  };
  writeAudit({ action: 'host.status', mutating: false, ok: true });
  return result;
}

function describe() {
  return {
    name: '3dvr-control-mcp',
    version: VERSION,
    protocol: 'mcp-compatible-boundary',
    capabilities,
    policy: {
      default: 'deny-mutating',
      secrets: 'adapter-required',
      privilegeEscalation: 'explicit-helper-only',
    },
  };
}

function handle(request) {
  if (!request || typeof request !== 'object') throw new Error('request must be an object');

  switch (request.method) {
    case 'control.describe':
      return describe();
    case 'host.status':
      return hostStatus();
    default:
      throw new Error(`unsupported method: ${request.method || '<missing>'}`);
  }
}

// Stdio JSON-lines mode keeps the bootstrap dependency-free and makes it easy
// to put a standards-compliant MCP transport in front of the same capability
// handlers without rewriting the control implementation.
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  for (;;) {
    const newline = buffer.indexOf('\n');
    if (newline < 0) break;
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;

    let response;
    try {
      const request = JSON.parse(line);
      response = { id: request.id ?? null, ok: true, result: handle(request) };
    } catch (error) {
      response = { ok: false, error: error.message };
    }
    process.stdout.write(JSON.stringify(response) + '\n');
  }
});

process.stdin.resume();
