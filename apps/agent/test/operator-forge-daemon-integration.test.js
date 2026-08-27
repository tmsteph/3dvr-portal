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
  const queueWrapper = await readFile(path.join(path.dirname(workerDaemon), 'ask-agent-queue'), 'utf8');

  assert.ok(script.includes('"$SCRIPT_DIR/ask-agent-queue" run-once'));
  assert.ok(queueWrapper.includes('if [ "${1:-}" = "run-once" ]; then'));
  assert.ok(queueWrapper.includes('operator-forge'));

  const loop = script.match(/worker_loop="([\s\S]*?)"\n    if command -v tmux/);
  assert.ok(loop, 'worker loop definition should exist');
  assert.ok(loop[1].includes('ask-agent-queue\\" run-once'));
});
