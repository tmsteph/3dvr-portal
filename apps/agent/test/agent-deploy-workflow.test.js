import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

// Prevent a PR merge from silently restarting the live DigitalOcean worker
// or consuming old tasks. This test runs in the existing Agent Checks suite.
const workflow = readFileSync(new URL('../../../.github/workflows/agent.yml', import.meta.url), 'utf8');

test('worker deployment requires a deliberate main-branch manual approval', () => {
  const deployJob = workflow.match(/^  deploy-digitalocean-worker:\n([\s\S]*?)(?=^  [a-zA-Z][\w-]*:|$(?![\s\S]))/m);
  assert.ok(deployJob, 'deploy job must remain present for explicitly approved operations');

  const condition = deployJob[1].match(/^    if: (.+)$/m)?.[1];
  assert.equal(condition,
    "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && inputs.deploy_digitalocean_worker == true",
    'a push/merge must never automatically deploy or start the worker');

  const manualInput = workflow.match(/^      deploy_digitalocean_worker:\n((?:^        .+\n)*)/m)?.[1];
  assert.ok(manualInput, 'workflow must expose an explicit deployment approval input');
  assert.match(manualInput, /^        type: boolean$/m);
  assert.match(manualInput, /^        required: true$/m);
  assert.match(manualInput, /^        default: false$/m);
  assert.match(workflow, /^  push:\n/m, 'normal CI on push must remain enabled');
});


test('isolated source staging does not gate on the live historical queue', () => {
  const staging = workflow.match(/^      - name: Stage release over SSH without touching live runtime\n([\s\S]*?)(?=^      - name: Verify staged revision|$(?![\s\S]))/m)?.[1];
  assert.ok(staging, 'manual source-only staging must remain available');
  assert.match(staging, /portal-release-stage/, 'release must use a separate checkout');
  assert.doesNotMatch(staging, /QUEUE_PREFLIGHT|DatabaseSync|node:sqlite|task-queue\.sqlite|THREEDVR_AGENT_QUEUE_DB/,
    'historical queued tasks must not block source-only staging');
  assert.doesNotMatch(staging, /agent-task-queue\.js (?:enqueue|run-once)|ask-agent-worker-daemon.*(?:start|stop)/,
    'source-only staging must never admit or run tasks');
});

test('pinned task refuses background daemon startup', (t) => {
  const dir = mkdtempSync(join(tmpdir(), '3dvr-pinned-daemon-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const daemon = new URL('../thomas-agent/scripts/ask-agent-worker-daemon', import.meta.url).pathname;
  const config = join(dir, 'config');
  // Persistent config must not be able to clear a caller's explicit canary pin.
  writeFileSync(config, 'THREEDVR_AGENT_WORKER_ONLY_TASK_ID=\n');
  const env = {
    ...process.env,
    THREEDVR_CONFIG_FILE: config,
    THREEDVR_AUTOPILOT_STATE_DIR: join(dir, 'state'),
    THREEDVR_AGENT_WORKER_ONLY_TASK_ID: 'operator-http-test-pinned',
  };
  const result = spawnSync('bash', [daemon, 'start'], { encoding: 'utf8', env });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Pinned task mode forbids background worker startup/);

  // A pin supplied by configuration is also prohibited from starting daemons.
  writeFileSync(config, 'THREEDVR_AGENT_WORKER_ONLY_TASK_ID=operator-http-config-pinned\n');
  const configured = spawnSync('bash', [daemon, 'start'], {
    encoding: 'utf8',
    env: { ...env, THREEDVR_AGENT_WORKER_ONLY_TASK_ID: '' },
  });
  assert.equal(configured.status, 1, configured.stderr);
  assert.match(configured.stderr, /Pinned task mode forbids background worker startup/);
});

test('queue wrapper refuses a persistent config that clears or replaces a caller-pinned canary', (t) => {
  const dir = mkdtempSync(join(tmpdir(), '3dvr-pinned-queue-config-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const config = join(dir, 'config');
  const log = join(dir, 'calls.log');
  const fakeNode = join(dir, 'fake-node');
  const wrapper = new URL('../thomas-agent/scripts/ask-agent-queue', import.meta.url).pathname;
  writeFileSync(fakeNode, '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$FAKE_NODE_LOG"\n');
  chmodSync(fakeNode, 0o700);
  const env = {
    ...process.env,
    THREEDVR_CONFIG_FILE: config,
    THREEDVR_NODE_BIN: fakeNode,
    FAKE_NODE_LOG: log,
    THREEDVR_AGENT_WORKER_ONLY_TASK_ID: 'signed-canary-1',
    THREEDVR_AGENT_SKIP_FORGE: '0',
  };
  for (const overriddenPin of ['', 'unrelated-task']) {
    writeFileSync(config, `THREEDVR_AGENT_WORKER_ONLY_TASK_ID=${overriddenPin}\n`);
    writeFileSync(log, '');
    const result = spawnSync('bash', [wrapper, 'run-once'], { encoding: 'utf8', env });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Pinned task scope conflicts with persistent worker configuration/);
    assert.equal(readFileSync(log, 'utf8'), '', 'no queue or compatibility worker may run');
  }

  writeFileSync(config, 'THREEDVR_AGENT_WORKER_ONLY_TASK_ID=signed-canary-1\n');
  writeFileSync(log, '');
  const matching = spawnSync('bash', [wrapper, 'run-once'], { encoding: 'utf8', env });
  assert.equal(matching.status, 0, matching.stderr);
  assert.match(readFileSync(log, 'utf8'), /agent-task-queue\.js run-once/);
  assert.doesNotMatch(readFileSync(log, 'utf8'), /operator-forge-worker|operator-server-control-worker/);
});

test('pinned signed canary poll cannot execute unrelated Forge or server-control bridge tasks', (t) => {
  const dir = mkdtempSync(join(tmpdir(), '3dvr-canary-bridge-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const fakeNode = join(dir, 'fake-node');
  const log = join(dir, 'calls.log');
  writeFileSync(fakeNode, '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$FAKE_NODE_LOG"\n');
  chmodSync(fakeNode, 0o700);
  const wrapper = new URL('../thomas-agent/scripts/ask-agent-queue', import.meta.url).pathname;
  const env = {
    ...process.env,
    THREEDVR_CONFIG_FILE: join(dir, 'missing-config'),
    THREEDVR_NODE_BIN: fakeNode,
    FAKE_NODE_LOG: log,
    THREEDVR_AGENT_LOCAL_QUEUE_ONLY: '0',
    THREEDVR_AGENT_SKIP_FORGE: '0',
    THREEDVR_AGENT_TOOLS_BIN: join(dir, 'missing-tools'),
  };
  const pinned = spawnSync('bash', [wrapper, 'run-once'], {
    encoding: 'utf8',
    env: { ...env, THREEDVR_AGENT_WORKER_ONLY_TASK_ID: 'operator-http-test-pinned' },
  });
  assert.equal(pinned.status, 0, pinned.stderr);
  const pinnedCalls = readFileSync(log, 'utf8');
  assert.match(pinnedCalls, /agent-task-queue\.js run-once/);
  assert.doesNotMatch(pinnedCalls, /operator-forge-worker|operator-server-control-worker/,
    'pinning one SQLite task must not start unscoped compatibility consumers');

  writeFileSync(log, '');
  const normal = spawnSync('bash', [wrapper, 'run-once'], {
    encoding: 'utf8',
    env: { ...env, THREEDVR_AGENT_WORKER_ONLY_TASK_ID: '' },
  });
  assert.equal(normal.status, 0, normal.stderr);
  const normalCalls = readFileSync(log, 'utf8');
  assert.match(normalCalls, /operator-forge-worker\.js run-once/);
  assert.match(normalCalls, /operator-server-control-worker\.js run-once/);
});


test('manual release stages separately and cannot activate an unpinned worker', () => {
  const staging = workflow.match(/^      - name: Stage release over SSH without touching live runtime\n([\s\S]*?)(?=^      - name: Verify staged revision|$(?![\s\S]))/m)?.[1];
  const verification = workflow.match(/^      - name: Verify staged revision without runtime mutation\n([\s\S]*?)(?=^      - name: Publish worker deployment status|$(?![\s\S]))/m)?.[1];
  assert.ok(staging, 'manual staging step must exist');
  assert.ok(verification, 'staged revision must be verified');
  assert.match(staging, /stage="\$HOME\/\.3dvr\/portal-release-stage"/);
  assert.match(staging, /git -C "\$stage" merge-base --is-ancestor "\$GITHUB_SHA" origin\/main/);
  assert.match(staging, /git -C "\$stage" checkout --detach "\$GITHUB_SHA"/);
  assert.match(staging, /test "\$\(git -C "\$stage" rev-parse HEAD\)" = "\$GITHUB_SHA"/);
  assert.match(verification, /test "\$\(git -C "\$stage" rev-parse HEAD\)" = "\$GITHUB_SHA"/);
  assert.doesNotMatch(staging, /git -C "\$stage" pull --ff-only origin main/,
    'staging must not silently select a later unreviewed main revision');
  assert.match(verification, /live worker unchanged and execution unverified/);
  assert.doesNotMatch(staging, /\$scripts\/ask-[\w-]+-daemon" (?:start|stop)/,
    'manual staging must never start or stop worker or auxiliary daemons');
  assert.doesNotMatch(staging, /npm --prefix "\$repo|rm -rf "\$repo|cfg_tmp=/,
    'manual staging must never mutate live dependencies or configuration');
  assert.doesNotMatch(workflow, /agent-task-queue\.js enqueue|--backend health --risk read_only/,
    'staging must not enqueue an unapproved task');
  assert.doesNotMatch(workflow, /worker alive and consuming managed queue tasks/,
    'source staging is not proof of runtime execution');
});
