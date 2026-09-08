import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { getRuntimeStatus, summarizeRuntime } = require('../apps/agent/thomas-agent/node/agent-heartbeat.js');

test('offloaded context router is healthy', () => {
  const state = { inboxRunning: true, outreachRunning: true, workerRunning: true, routerRunning: false, routerEnabled: false };
  assert.equal(getRuntimeStatus(state), 'running');
  assert.match(summarizeRuntime({ status: 'running', router: { enabled: false, running: false } }), /Context router: offloaded/);
});

test('missing enabled context router degrades health', () => {
  const state = { inboxRunning: true, outreachRunning: true, workerRunning: true, routerRunning: false, routerEnabled: true };
  assert.equal(getRuntimeStatus(state), 'degraded');
});
