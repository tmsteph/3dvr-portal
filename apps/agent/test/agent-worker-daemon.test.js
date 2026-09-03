const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const workerDaemon = path.join(__dirname, '..', 'thomas-agent', 'scripts', 'ask-agent-worker-daemon');
const queueWrapper = path.join(__dirname, '..', 'thomas-agent', 'scripts', 'ask-agent-queue');
const agentWorkflow = path.join(__dirname, '..', '..', '..', '.github', 'workflows', 'agent.yml');
const routerDaemon = path.join(__dirname, '..', 'thomas-agent', 'scripts', 'ask-context-task-router-daemon');
const organismDaemon = path.join(__dirname, '..', 'thomas-agent', 'scripts', 'ask-organism-sync-daemon');

test('agent worker daemon reloads the selected 3DVR config inside its worker session', async () => {
  const script = await readFile(workerDaemon, 'utf8');

  assert.match(script, /CONFIG_FILE="\$\{THREEDVR_CONFIG_FILE:-\$HOME\/\.3dvr\/config\/env\}"/);
  assert.match(script, /export THREEDVR_CONFIG_FILE=\$config_file_q/);
  assert.ok(script.includes('if [ -f \\"\\$THREEDVR_CONFIG_FILE\\" ]; then set -a; . \\"\\$THREEDVR_CONFIG_FILE\\"; set +a; fi;'));
  assert.match(script, /ask-agent-queue\\" run-once/);
});

test('worker lifecycle owns context routing, organism sync, and supervision', async () => {
  const script = await readFile(workerDaemon, 'utf8');

  assert.match(script, /ORGANISM_DAEMON="\$SCRIPT_DIR\/ask-organism-sync-daemon"/);
  assert.match(script, /"\$ROUTER_DAEMON" start/);
  assert.match(script, /"\$ORGANISM_DAEMON" start/);
  assert.match(script, /"\$SUPERVISOR_DAEMON" start/);
  assert.match(script, /"\$ORGANISM_DAEMON" stop \|\| true/);
  assert.match(script, /"\$ORGANISM_DAEMON" status/);
});

test('queue wrapper reloads and validates its configured Node SQLite runtime', async () => {
  const script = await readFile(queueWrapper, 'utf8');

  assert.match(script, /NODE_BIN="\$\{THREEDVR_NODE_BIN:-node\}"/);
  assert.match(script, /major < 22 \|\| \(major === 22 && minor < 13\)/);
  assert.match(script, /require\("node:sqlite"\)/);
  assert.match(script, /"\$NODE_BIN" "\$ROOT\/node\/agent-task-queue\.js"/);
  assert.match(script, /"\$NODE_BIN" "\$ROOT\/node\/operator-forge-worker\.js"/);
});

test('queue wrapper fails clearly when its configured Node runtime is unavailable', () => {
  const missingNode = path.join(__dirname, 'missing-node-runtime');
  const result = spawnSync(workerDaemon, ['run-once'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      THREEDVR_CONFIG_FILE: '/dev/null',
      THREEDVR_NODE_BIN: missingNode,
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires Node >=22\.13 with node:sqlite/);
  assert.match(result.stderr, new RegExp(missingNode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('context router reloads config and honors the configured Node runtime', async () => {
  const script = await readFile(routerDaemon, 'utf8');
  assert.match(script, /CONFIG_FILE="\$\{THREEDVR_CONFIG_FILE:-\$HOME\/\.3dvr\/config\/env\}"/);
  assert.match(script, /\. "\$CONFIG_FILE"/);
  assert.match(script, /\. \\"\\\$THREEDVR_CONFIG_FILE\\"/);
  assert.match(script, /THREEDVR_NODE_BIN:-node/);
});

test('organism sync daemon reloads config and runs the persistent memory bridge', async () => {
  const script = await readFile(organismDaemon, 'utf8');

  assert.match(script, /CONFIG_FILE="\$\{THREEDVR_CONFIG_FILE:-\$HOME\/\.3dvr\/config\/env\}"/);
  assert.match(script, /\. "\$CONFIG_FILE"/);
  assert.match(script, /organism-sync\.js/);
  assert.match(script, /3dvr-organism-sync/);
  assert.match(script, /run-now/);
});

test('owner alias config quoting preserves data without executing shell syntax', () => {
  const owner = `customer name'; touch /tmp/3dvr-owner-injection; # $(false)`;
  const script = `
    set -euo pipefail
    cfg="$1"
    owner="$2"
    printf -v owner_q '%q' "$owner"
    printf 'THREEDVR_AGENT_OWNER_ALIAS=%s\\n' "$owner_q" > "$cfg"
    unset owner THREEDVR_AGENT_OWNER_ALIAS
    . "$cfg"
    [ "$THREEDVR_AGENT_OWNER_ALIAS" = "$2" ]
  `;
  const cfg = path.join(__dirname, 'owner-config-test');
  require('node:fs').rmSync('/tmp/3dvr-owner-injection', { force: true });
  const result = spawnSync('bash', ['-c', script, 'bash', cfg, owner], { encoding: 'utf8' });
  try {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(require('node:fs').existsSync('/tmp/3dvr-owner-injection'), false);
  } finally {
    require('node:fs').rmSync(cfg, { force: true });
    require('node:fs').rmSync('/tmp/3dvr-owner-injection', { force: true });
  }
});

test('worker deployment is out-of-band and verifies managed queue consumption safely', async () => {
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
  assert.match(normalizedWorkflow, /THREEDVR_NODE_BIN: \/opt\/node-v22\/bin\/node/);
  assert.match(normalizedWorkflow, /UserKnownHostsFile=\/tmp\/3dvr-known-hosts/);
  assert.match(normalizedWorkflow, /StrictHostKeyChecking=yes/);
  assert.equal(normalizedWorkflow.includes('StrictHostKeyChecking=accept-new'), false);
  assert.match(normalizedWorkflow, /167\.172\.193\.194 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFoepoGbXWiidk4axaBwsI1Y\/GWVckiqJxGLkBpTV6Pc/);
  assert.match(normalizedWorkflow, /THREEDVR_AGENT_OWNER_ALIAS_B64/);
  assert.match(normalizedWorkflow, /printf -v owner_q '%q'/);
  assert.match(normalizedWorkflow, /printf 'THREEDVR_AGENT_OWNER_ALIAS=%s\\n' "\$owner_q"/);
  assert.doesNotMatch(normalizedWorkflow, /awk -v owner/);
  assert.match(normalizedWorkflow, /"\$THREEDVR_NODE_BIN" -e 'const \[major, minor\].*require\("node:sqlite"\)'/);
  assert.equal(normalizedWorkflow.includes('node thomas-agent/node/agent-task-queue.js'), false);
  assert.match(normalizedWorkflow, /Verify managed queue consumption/);
  assert.match(normalizedWorkflow, /--backend health --risk read_only --approval-status approved/);
  assert.equal(normalizedWorkflow.includes('--backend shell --risk read_only'), false);
  assert.match(normalizedWorkflow, /DigitalOcean agent worker alive and consuming managed queue tasks/);
});
