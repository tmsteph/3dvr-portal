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

test('managed agent worker consumes both the general queue and Operator Forge edits', async () => {
  const script = await readFile(workerDaemon, 'utf8');

  assert.match(script, /OPERATOR_FORGE_WORKER="\$ROOT\/node\/operator-forge-worker\.js"/);
  assert.ok(script.includes('"$SCRIPT_DIR/ask-agent-queue" run-once'));
  assert.ok(script.includes('node "$OPERATOR_FORGE_WORKER" run-once'));

  const loop = script.match(/worker_loop="([\s\S]*?)"\n    if command -v tmux/);
  assert.ok(loop, 'worker loop definition should exist');
  assert.ok(loop[1].includes('ask-agent-queue\\" run-once'));
  assert.ok(loop[1].includes('operator-forge-worker.js') || loop[1].includes('OPERATOR_FORGE_WORKER'));
});
