import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
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


test('manual deploy preflight refuses queued or running work without touching the queue', (t) => {
  const preflight = workflow.match(/^          "\$THREEDVR_NODE_BIN" <<'QUEUE_PREFLIGHT'\n([\s\S]*?)^          QUEUE_PREFLIGHT$/m)?.[1];
  assert.ok(preflight, 'manual deployment must check the existing SQLite queue before daemon shutdown');

  const dir = mkdtempSync(join(tmpdir(), '3dvr-deploy-preflight-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = join(dir, 'queue.sqlite');
  const db = new DatabaseSync(dbPath);
  t.after(() => db.close());
  db.exec('CREATE TABLE tasks (owner_alias TEXT NOT NULL, status TEXT NOT NULL)');
  const insert = db.prepare('INSERT INTO tasks (owner_alias, status) VALUES (?, ?)');
  insert.run('3dvr-managed', 'queued');
  insert.run('unrelated-owner', 'queued');

  const run = (path = dbPath) => spawnSync(process.execPath, ['-e', preflight], {
    encoding: 'utf8',
    env: { ...process.env, THREEDVR_AGENT_QUEUE_DB: path, THREEDVR_AGENT_OWNER_ALIAS: '3dvr-managed' }
  });

  const queued = run();
  assert.notEqual(queued.status, 0);
  assert.match(queued.stderr, /queued\/running tasks require review/);
  assert.equal(db.prepare("SELECT status FROM tasks WHERE owner_alias = '3dvr-managed'").get().status, 'queued');

  db.exec("UPDATE tasks SET status = 'review_required' WHERE owner_alias = '3dvr-managed'");
  assert.equal(run().status, 0, 'other owners and quarantined tasks must not block this owner');

  db.exec("UPDATE tasks SET status = 'running' WHERE owner_alias = '3dvr-managed'");
  assert.notEqual(run().status, 0, 'an in-flight task must block daemon restart');
  assert.notEqual(run(join(dir, 'missing.sqlite')).status, 0, 'missing authority must fail closed');
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


test('manual deployment verification is read-only and never enqueues an unapproved health task', () => {
  const verification = workflow.match(/^      - name: Verify deployed revision without queue mutation\n([\s\S]*?)(?=^      - name: Publish worker deployment status|$(?![\s\S]))/m)?.[1];
  assert.ok(verification, 'deploy verification must be present and explicitly read-only');
  assert.match(verification, /git -C "\$repo" merge-base --is-ancestor "\$GITHUB_SHA" HEAD/);
  assert.match(verification, /worker execution unverified/);
  assert.doesNotMatch(workflow, /agent-task-queue\.js enqueue|--backend health --risk read_only/,
    'deployment must not create an unapproved task or trigger queue execution for verification');
  assert.doesNotMatch(workflow, /worker alive and consuming managed queue tasks/,
    'revision verification is not proof of runtime execution');
});
