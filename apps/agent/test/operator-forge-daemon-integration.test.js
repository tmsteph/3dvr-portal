const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const workerDaemon = path.join(
  __dirname,
  '..',
  'thomas-agent',
  'scripts',
  'ask-agent-worker-daemon'
);

test('managed agent worker keeps local queue responsive while preserving Operator Forge bridge', async () => {
  const script = await readFile(workerDaemon, 'utf8');
  const queueWrapper = await readFile(path.join(path.dirname(workerDaemon), 'ask-agent-queue'), 'utf8');

  assert.ok(script.includes('THREEDVR_AGENT_LOCAL_QUEUE_ONLY=1'));
  assert.ok(script.includes('BRIDGE_LOG_FILE'));
  assert.ok(script.includes('"$SCRIPT_DIR/ask-agent-queue" run-once'));

  assert.ok(queueWrapper.includes('THREEDVR_AGENT_LOCAL_QUEUE_ONLY'));
  assert.ok(queueWrapper.includes('THREEDVR_AGENT_QUEUE_GUN_SYNC=0'));
  assert.ok(queueWrapper.includes('THREEDVR_AGENT_SKIP_FORGE=1'));
  assert.ok(queueWrapper.includes('operator-forge-worker.js'));

  const loop = script.match(/worker_loop="([\s\S]*?)"\n    if command -v tmux/);
  assert.ok(loop, 'worker loop definition should exist');
  assert.ok(loop[1].includes('THREEDVR_AGENT_LOCAL_QUEUE_ONLY=1'));
  assert.ok(loop[1].includes('BRIDGE_LOG_FILE'));
  assert.ok(loop[1].includes('ask-agent-queue\\" run-once'));
});
