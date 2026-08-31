import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const base = 50000 + (process.pid % 10000);
const httpPort = base;
const discoveryPort = base + 1;
const token = 'show-tech-test-token';
let child;

async function waitForHealth() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${httpPort}/v1/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Show node did not become healthy');
}

test.before(async () => {
  child = spawn(process.execPath, ['node.mjs'], {
    cwd: new URL('.', import.meta.url),
    env: {
      ...process.env,
      SHOW_NODE_PORT: String(httpPort),
      SHOW_DISCOVERY_PORT: String(discoveryPort),
      SHOW_NODE_TOKEN: token,
      SHOW_NODE_ID: 'test-node',
    },
    stdio: 'ignore',
  });
  await waitForHealth();
});

test.after(() => child?.kill('SIGTERM'));

test('advertises browser AV and patchbay capabilities', async () => {
  const response = await fetch(`http://127.0.0.1:${httpPort}/v1/capabilities`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.protocol, '3dvr-show-node/0.1');
  assert.equal(body.node.id, 'test-node');
  assert.ok(body.capabilities.some(capability => capability.kind === 'av.output'));
  assert.ok(body.capabilities.some(capability => capability.id === 'patchbay.node'));
  assert.equal(body.endpoints.patchPath, '/patch');
});

test('exposes patchable ports and controller UI', async () => {
  const portsResponse = await fetch(`http://127.0.0.1:${httpPort}/v1/ports`);
  assert.equal(portsResponse.status, 200);
  const manifest = await portsResponse.json();
  assert.ok(manifest.logicalOutputs.some(port => port.id === 'program.video'));
  assert.ok(manifest.ports.some(port => port.id === 'video:browser'));
  const ui = await fetch(`http://127.0.0.1:${httpPort}/patch`);
  assert.equal(ui.status, 200);
  assert.match(await ui.text(), /Show Patchbay/);
});

test('rejects unauthenticated actions', async () => {
  const response = await fetch(`http://127.0.0.1:${httpPort}/v1/actions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'display.text', payload: { text: 'blocked' } }),
  });
  assert.equal(response.status, 401);
});

test('applies authenticated actions', async () => {
  const response = await fetch(`http://127.0.0.1:${httpPort}/v1/actions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'test-immediate', type: 'display.text', payload: { text: 'online' } }),
  });
  assert.equal(response.status, 202);
  const state = await (await fetch(`http://127.0.0.1:${httpPort}/v1/state`)).json();
  assert.equal(state.display.text, 'online');
});

test('patches logical video output through authenticated actions', async () => {
  const response = await fetch(`http://127.0.0.1:${httpPort}/v1/actions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'patch.set', payload: { logical: 'program.video', target: 'video:browser' } }),
  });
  assert.equal(response.status, 202);
  const ports = await (await fetch(`http://127.0.0.1:${httpPort}/v1/ports`)).json();
  assert.equal(ports.patches['program.video'], 'video:browser');
});

test('schedules an action for local execution', async () => {
  const executeAt = Date.now() + 180;
  const response = await fetch(`http://127.0.0.1:${httpPort}/v1/actions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'test-scheduled', type: 'display.text', executeAt, payload: { text: 'GO' } }),
  });
  const accepted = await response.json();
  assert.equal(accepted.scheduled, true);
  await new Promise(resolve => setTimeout(resolve, 260));
  const state = await (await fetch(`http://127.0.0.1:${httpPort}/v1/state`)).json();
  assert.equal(state.display.text, 'GO');
});
