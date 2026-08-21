const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const workerDaemon = path.join(__dirname, '..', 'thomas-agent', 'scripts', 'ask-agent-worker-daemon');

test('agent worker daemon reloads the selected 3DVR config inside its worker session', async () => {
  const script = await readFile(workerDaemon, 'utf8');

  assert.match(script, /CONFIG_FILE="\$\{THREEDVR_CONFIG_FILE:-\$HOME\/\.3dvr\/config\/env\}"/);
  assert.match(script, /export THREEDVR_CONFIG_FILE=\$config_file_q/);
  assert.ok(script.includes('if [ -f \\"\\$THREEDVR_CONFIG_FILE\\" ]; then set -a; . \\"\\$THREEDVR_CONFIG_FILE\\"; set +a; fi;'));
  assert.match(script, /ask-agent-queue\\" run-once/);
});
