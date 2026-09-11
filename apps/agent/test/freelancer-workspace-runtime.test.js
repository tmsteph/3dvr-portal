const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  buildDockerRunArgs,
  createFreelancerWorkspaceRuntime,
} = require('../thomas-agent/node/freelancer-workspace-runtime');

test('docker workspace is isolated, agent-enabled and only loopback-published by default', () => {
  const metadata = {
    workspaceId: 'fw-test-worker',
    containerName: '3dvr-fw-test-worker',
    rootDir: '/tmp/fw-test-worker',
    port: 32123,
    timezone: 'America/Los_Angeles',
    password: 'secret',
  };
  const args = buildDockerRunArgs(metadata, {
    FREELANCER_WORKSPACE_CGROUP_PARENT: '3dvr-workspaces.slice',
  });
  assert.ok(args.includes('127.0.0.1:32123:3001'));
  assert.ok(args.includes('/tmp/fw-test-worker/config:/config'));
  assert.ok(args.includes('START_DOCKER=false'));
  assert.ok(args.includes('PELORUS=true'));
  assert.ok(args.includes('PIXELFLUX_WAYLAND=true'));
  assert.ok(args.includes('MAX_RES=1920x1080'));
  assert.ok(args.includes('1024m'));
  assert.ok(args.includes('1.0'));
  assert.ok(args.includes('--pids-limit'));
  assert.ok(args.includes('1024'));
  assert.ok(args.includes('--cgroup-parent'));
  assert.ok(args.includes('3dvr-workspaces.slice'));
  assert.ok(args.some(arg => String(arg).includes('linuxserver/firefox')));
  assert.equal(args.includes('--privileged'), false);
  assert.equal(args.some(arg => String(arg).includes('/var/run/docker.sock')), false);
});

test('runtime provisions persistent metadata and starts/stops same container', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), '3dvr-fw-'));
  const calls = [];
  let running = false;
  const run = async (command, args) => {
    calls.push([command, ...args]);
    if (args[0] === 'run') running = true;
    if (args[0] === 'start') running = true;
    if (args[0] === 'stop') running = false;
    if (args[0] === 'inspect') return { ok: true, stdout: running ? 'true\n' : 'false\n', stderr: '' };
    return { ok: true, stdout: '', stderr: '' };
  };
  const env = {
    FREELANCER_WORKSPACE_ROOT: root,
    FREELANCER_WORKSPACE_PORT_START: '32888',
    FREELANCER_WORKSPACE_PORT_END: '32899',
  };
  const runtime = createFreelancerWorkspaceRuntime({
    env,
    run,
    now: () => new Date('2026-08-31T02:00:00Z'),
    getFreeMemoryMb: () => 8192,
  });
  const created = await runtime.provision('fw-test-worker');
  assert.equal(created.status, 'running');
  assert.equal(created.profile, 'browser-agent');
  assert.equal(created.agentPath, '/pelorus/');
  const metadata = JSON.parse(await readFile(path.join(root, 'fw-test-worker', '.workspace.json'), 'utf8'));
  assert.equal(metadata.workspaceId, 'fw-test-worker');
  assert.equal(metadata.profile, 'browser-agent');
  assert.ok(metadata.password.length >= 24);
  await runtime.stop('fw-test-worker');
  assert.equal((await runtime.status('fw-test-worker')).status, 'stopped');
  await runtime.start('fw-test-worker');
  assert.equal((await runtime.status('fw-test-worker')).status, 'running');
  assert.equal(calls.filter(call => call[1] === 'run').length, 1);
  const second = await runtime.provision('fw-second-worker');
  const secondMetadata = JSON.parse(await readFile(path.join(root, 'fw-second-worker', '.workspace.json'), 'utf8'));
  assert.equal(second.status, 'running');
  assert.notEqual(secondMetadata.port, metadata.port);
  await rm(root, { recursive: true, force: true });
});

test('runtime recreates a workspace without rotating metadata or config', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), '3dvr-fw-recreate-'));
  const calls = [];
  let running = false;
  const run = async (command, args) => {
    calls.push([command, ...args]);
    if (args[0] === 'run') running = true;
    if (args[0] === 'stop') running = false;
    if (args[0] === 'rm') running = false;
    if (args[0] === 'inspect') return { ok: true, stdout: running ? 'true\n' : 'false\n', stderr: '' };
    return { ok: true, stdout: '', stderr: '' };
  };
  const env = {
    FREELANCER_WORKSPACE_ROOT: root,
    FREELANCER_WORKSPACE_CGROUP_PARENT: '3dvr-workspaces.slice',
  };
  let currentTime = '2026-08-31T02:00:00Z';
  const runtime = createFreelancerWorkspaceRuntime({
    env,
    run,
    now: () => new Date(currentTime),
    getFreeMemoryMb: () => 8192,
  });
  await runtime.provision('fw-test-worker');
  const before = JSON.parse(await readFile(path.join(root, 'fw-test-worker', '.workspace.json'), 'utf8'));
  currentTime = '2026-09-11T06:00:00Z';
  const recreated = await runtime.recreate('fw-test-worker');
  const after = JSON.parse(await readFile(path.join(root, 'fw-test-worker', '.workspace.json'), 'utf8'));
  assert.equal(recreated.status, 'running');
  assert.equal(after.password, before.password);
  assert.equal(after.port, before.port);
  assert.equal(after.rootDir, before.rootDir);
  assert.equal(after.createdAt, before.createdAt);
  assert.equal(after.lastStartedAt, '2026-09-11T06:00:00.000Z');
  assert.equal(calls.filter(call => call[1] === 'run').length, 2);
  assert.ok(calls.some(call => call[1] === 'stop'));
  assert.ok(calls.some(call => call[1] === 'rm'));
  const recreateRun = calls.filter(call => call[1] === 'run').at(-1);
  assert.ok(recreateRun.includes('--cgroup-parent'));
  assert.ok(recreateRun.includes('3dvr-workspaces.slice'));
  assert.ok(recreateRun.includes(`${path.join(root, 'fw-test-worker', 'config')}:/config`));
  await rm(root, { recursive: true, force: true });
});

test('runtime refuses to start a workspace when the host would be starved', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), '3dvr-fw-capacity-'));
  let commandCalls = 0;
  const runtime = createFreelancerWorkspaceRuntime({
    env: { FREELANCER_WORKSPACE_ROOT: root },
    run: async () => {
      commandCalls += 1;
      return { ok: true, stdout: '', stderr: '' };
    },
    getFreeMemoryMb: () => 1200,
  });
  await assert.rejects(() => runtime.provision('fw-low-memory'), /needs at least 1792 MB free/);
  assert.equal(commandCalls, 0);
  await rm(root, { recursive: true, force: true });
});
