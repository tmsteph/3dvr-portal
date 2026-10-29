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


test('pinned task refuses background daemon startup', (t) => {
  const dir = mkdtempSync(join(tmpdir(), '3dvr-pinned-daemon-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const daemon = new URL('../thomas-agent/scripts/ask-agent-worker-daemon', import.meta.url).pathname;
  const result = spawnSync('bash', [daemon, 'start'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      THREEDVR_CONFIG_FILE: join(dir, 'missing-config'),
      THREEDVR_AUTOPILOT_STATE_DIR: join(dir, 'state'),
      THREEDVR_AGENT_WORKER_ONLY_TASK_ID: 'operator-http-test-pinned',
    },
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Pinned task mode forbids background worker startup/);
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
