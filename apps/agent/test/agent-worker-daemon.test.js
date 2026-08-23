const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const workerDaemon = path.join(__dirname, '..', 'thomas-agent', 'scripts', 'ask-agent-worker-daemon');
const queueWrapper = path.join(__dirname, '..', 'thomas-agent', 'scripts', 'ask-agent-queue');
const agentWorkflow = path.join(__dirname, '..', '..', '..', '.github', 'workflows', 'agent.yml');

test('agent worker daemon reloads the selected 3DVR config inside its worker session', async () => {
  const script = await readFile(workerDaemon, 'utf8');

  assert.match(script, /CONFIG_FILE="\$\{THREEDVR_CONFIG_FILE:-\$HOME\/\.3dvr\/config\/env\}"/);
  assert.match(script, /export THREEDVR_CONFIG_FILE=\$config_file_q/);
  assert.ok(script.includes('if [ -f \\"\\$THREEDVR_CONFIG_FILE\\" ]; then set -a; . \\"\\$THREEDVR_CONFIG_FILE\\"; set +a; fi;'));
  assert.match(script, /ask-agent-queue\\" run-once/);
});

test('worker deployment is out-of-band and verifies managed queue consumption', async () => {
  const [queueScript, workflow] = await Promise.all([
    readFile(queueWrapper, 'utf8'),
    readFile(agentWorkflow, 'utf8'),
  ]);

  assert.match(queueScript, /CONFIG_FILE="\$\{THREEDVR_CONFIG_FILE:-\$HOME\/\.3dvr\/config\/env\}"/);
  assert.ok(queueScript.includes('. "$CONFIG_FILE"'));

  const normalizedWorkflow = workflow.replace(/\\"/g, '"');
  assert.match(normalizedWorkflow, /deploy-digitalocean-worker:/);
  assert.match(normalizedWorkflow, /Deploy worker over SSH/);
  assert.match(normalizedWorkflow, /ssh "\$\{opts\[@\]\}" "\$DO_AGENT_USER@\$DO_AGENT_HOST"/);
  assert.equal(normalizedWorkflow.includes('Queue remote update'), false);
  assert.equal(normalizedWorkflow.includes('Wait for German worker receipt'), false);
  assert.equal(normalizedWorkflow.includes('deploy-german-worker:'), false);

  assert.equal(normalizedWorkflow.includes('"$scripts/ask-agent-worker-daemon" stop || true'), true);
  assert.equal(normalizedWorkflow.includes('"$scripts/ask-agent-worker-daemon" start'), true);
  assert.equal(normalizedWorkflow.includes('"$scripts/ask-agent-worker-daemon" status'), true);
  assert.match(normalizedWorkflow, /Verify managed queue consumption/);
  assert.match(normalizedWorkflow, /DigitalOcean agent worker alive and consuming managed queue tasks/);
});
