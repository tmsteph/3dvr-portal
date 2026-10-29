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

  assert.match(script, /TOOLS_BIN="\$\{THREEDVR_AGENT_TOOLS_BIN:-\$HOME\/\.openclaw\/tools\/node\/bin\}"/);
  assert.match(script, /export PATH="\$TOOLS_BIN:\$PATH"/);
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

test('manual release stages an isolated checkout without activating workers', async () => {
  const [queueScript, workflow] = await Promise.all([
    readFile(queueWrapper, 'utf8'),
    readFile(agentWorkflow, 'utf8'),
  ]);
  assert.ok(queueScript.includes('CONFIG_FILE="${THREEDVR_CONFIG_FILE:-$HOME/.3dvr/config/env}"'));
  assert.ok(queueScript.includes('. "$CONFIG_FILE"'));

  for (const required of [
    'deploy-digitalocean-worker:',
    'workflow_dispatch:',
    'deploy_digitalocean_worker:',
    "github.event_name == 'workflow_dispatch'",
    'Stage release over SSH without touching live runtime',
    'portal-release-stage',
    'UserKnownHostsFile=/tmp/3dvr-known-hosts',
    'StrictHostKeyChecking=yes',
    '167.172.193.194 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFoepoGbXWiidk4axaBwsI1Y/GWVckiqJxGLkBpTV6Pc',
    'Verify staged revision without runtime mutation',
    'DigitalOcean source staged; live worker unchanged',
  ]) {
    assert.ok(workflow.includes(required), `missing stage-only release guard: ${required}`);
  }
  for (const forbidden of [
    'Queue remote update',
    'Wait for German worker receipt',
    'deploy-german-worker:',
    '"$scripts/ask-agent-worker-daemon" stop || true',
    '"$scripts/ask-agent-worker-daemon" start',
    '"$scripts/ask-agent-worker-daemon" status',
    'StrictHostKeyChecking=accept-new',
    'agent-task-queue.js enqueue',
    'QUEUE_PREFLIGHT',
    'DatabaseSync',
    'task-queue.sqlite',
    'THREEDVR_AGENT_QUEUE_DB',
    '--backend shell --risk read_only',
  ]) {
    assert.equal(workflow.includes(forbidden), false, `unexpected live worker action: ${forbidden}`);
  }
});
