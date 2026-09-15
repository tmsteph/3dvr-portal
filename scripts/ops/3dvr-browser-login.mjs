#!/usr/bin/env node
import http from 'node:http';
import { execFileSync } from 'node:child_process';

const site = String(process.argv[2] || '').trim().toLowerCase();
const lanes = Object.freeze({ iatse: 'general', ukg: 'encore', lighthouse: 'general' });
if (!lanes[site]) {
  process.stderr.write('Usage: 3dvr-browser-login <iatse|ukg|lighthouse>\n');
  process.exit(64);
}

const socketPath = process.env.THREEDVR_SECRETS_BROKER_SOCKET || '/run/3dvr-secrets-broker/broker.sock';
const leaseBin = process.env.THREEDVR_BROWSER_LEASE_BIN || '/usr/local/bin/3dvr-browser-lease';
const owner = `browser-login-${site}`;

function leaseCommand(action, extra = []) {
  const direct = [leaseBin, action, lanes[site], ...extra];
  if (process.getuid?.() === 0) return { file: direct.shift(), args: direct };
  return { file: 'sudo', args: ['-n', ...direct] };
}

function runLease(action, extra = []) {
  const command = leaseCommand(action, extra);
  return execFileSync(command.file, command.args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function callBroker() {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify({ site }));
    const req = http.request({
      socketPath,
      path: '/v1/browser-login',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(body.length),
      },
    }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => {
        let payload = {};
        try { payload = text ? JSON.parse(text) : {}; }
        catch { payload = { ok: false, site, status: 'error', reason: 'invalid-broker-response' }; }
        resolve({ statusCode: res.statusCode || 500, payload });
      });
    });
    req.setTimeout(30000, () => req.destroy(new Error('browser-login-timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

let leaseToken = '';
try {
  leaseToken = runLease('acquire', [owner, '180']);
  const result = await callBroker();
  process.stdout.write(`${JSON.stringify(result.payload)}\n`);
  if (result.payload?.status === 'human_required') process.exitCode = 20;
  else if (result.statusCode >= 400 || result.payload?.ok !== true) process.exitCode = 1;
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    site,
    status: 'error',
    reason: String(error?.message || 'browser-login-client-error').slice(0, 160),
  })}\n`);
  process.exitCode = 1;
} finally {
  if (leaseToken) {
    try { runLease('release', [leaseToken]); } catch {}
  }
}
