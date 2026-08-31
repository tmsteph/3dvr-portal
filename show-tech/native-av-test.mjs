import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port = 56000 + (process.pid % 5000);
const token = 'native-av-test-token';
let child;

async function waitForHealth() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/health`);
      if (response.ok) return response.json();
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Show node did not become healthy');
}

async function waitForNativeComplete() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const state = await (await fetch(`http://127.0.0.1:${port}/v1/state`)).json();
    if (!state.native.running && state.native.lastExit?.code === 0) return state.native;
    if (!state.native.running && state.native.lastError) throw new Error(state.native.lastError);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Native AV pipeline did not complete');
}

test.before(async () => {
  child = spawn(process.execPath, ['node.mjs'], {
    cwd: new URL('.', import.meta.url),
    env: {
      ...process.env,
      SHOW_NODE_PORT: String(port),
      SHOW_DISCOVERY_PORT: String(port + 1),
      SHOW_NODE_TOKEN: token,
      SHOW_NODE_ID: 'native-av-test-node',
      SHOW_NATIVE_OUTPUT_MODE: 'headless',
    },
    stdio: 'ignore',
  });
  await waitForHealth();
});

test.after(() => child?.kill('SIGTERM'));

test('GStreamer becomes an advertised native AV capability', async () => {
  const capabilities = await (await fetch(`http://127.0.0.1:${port}/v1/capabilities`)).json();
  const native = capabilities.capabilities.find(capability => capability.id === 'av.gstreamer');
  assert.ok(native, 'expected av.gstreamer capability');
  assert.equal(native.kind, 'av.output.native');
  assert.ok(native.actions.includes('native.av.test'));
});

test('native AV test pushes video and audio buffers through GStreamer headlessly', async () => {
  const response = await fetch(`http://127.0.0.1:${port}/v1/actions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 'native-av-test-pattern',
      type: 'native.av.test',
      payload: { durationMs: 250, outputMode: 'headless' },
    }),
  });
  assert.equal(response.status, 202);
  const accepted = await response.json();
  assert.equal(accepted.adapterResult.backend, 'gstreamer');
  assert.equal(accepted.adapterResult.headless, true);

  const native = await waitForNativeComplete();
  assert.equal(native.lastExit.code, 0);
  assert.equal(native.lastError, null);
  console.log('NATIVE_AV_RESULT', JSON.stringify({ backend: native.backend, outputMode: native.outputMode, exit: native.lastExit }));
});
