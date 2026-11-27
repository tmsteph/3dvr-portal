import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, unlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const script = new URL('../scripts/ops/browser-lane-lease.sh', import.meta.url).pathname;

function run(stateDir, args) {
  return spawnSync(script, args, {
    encoding: 'utf8',
    env: { ...process.env, THREEDVR_BROWSER_LEASE_DIR: stateDir },
  });
}

test('browser lanes allow one writer and hide lease tokens from status', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), '3dvr-browser-lease-'));
  try {
    const first = run(stateDir, ['acquire', 'general', 'agent-a', '60']);
    assert.equal(first.status, 0, first.stderr);
    const token = first.stdout.trim();
    assert.ok(token.length >= 16);

    const sameOwner = run(stateDir, ['acquire', 'general', 'agent-a', '60']);
    assert.equal(sameOwner.status, 75);
    assert.equal(sameOwner.stdout.includes(token), false);

    const blocked = run(stateDir, ['acquire', 'general', 'agent-b', '60']);
    assert.equal(blocked.status, 75);
    assert.match(blocked.stderr, /owner=agent-a/);

    const status = run(stateDir, ['status', 'general']);
    assert.equal(status.status, 0, status.stderr);
    assert.match(status.stdout, /state=leased owner=agent-a/);
    assert.equal(status.stdout.includes(token), false);

    const renewed = run(stateDir, ['renew', 'general', token, '120']);
    assert.equal(renewed.status, 0, renewed.stderr);

    const wrongRelease = run(stateDir, ['release', 'general', 'wrong-token']);
    assert.equal(wrongRelease.status, 77);

    const released = run(stateDir, ['release', 'general', token]);
    assert.equal(released.status, 0, released.stderr);

    const second = run(stateDir, ['acquire', 'general', 'agent-b', '60']);
    assert.equal(second.status, 0, second.stderr);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test('runtime exposes two action lanes plus protected identity and interactive lanes', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), '3dvr-browser-runtime-'));
  try {
    for (const lane of ['action-1', 'action-2', 'identity', 'interactive']) {
      const acquired = run(stateDir, ['acquire', lane, `worker-${lane}`, '60']);
      assert.equal(acquired.status, 0, `${lane}: ${acquired.stderr}`);
    }

    const status = run(stateDir, ['status']);
    assert.equal(status.status, 0, status.stderr);
    assert.match(status.stdout, /lane=action-1 state=leased owner=worker-action-1/);
    assert.match(status.stdout, /lane=action-2 state=leased owner=worker-action-2/);
    assert.match(status.stdout, /lane=identity state=leased owner=worker-identity/);
    assert.match(status.stdout, /lane=interactive state=leased owner=worker-interactive/);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test('maintenance admission blocks new writers, permits completion, and never implies restart safety', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), '3dvr-browser-maintenance-'));
  try {
    assert.equal(run(stateDir, ['aggregate-status']).status, 69);
    assert.deepEqual(await readdir(stateDir), []);
    const first = run(stateDir, ['acquire', 'general', 'private-owner', '60']);
    assert.equal(first.status, 0, first.stderr);
    const token = first.stdout.trim();
    const marker = join(stateDir, '.maintenance');
    await writeFile(marker, 'fixture only');
    await writeFile(join(stateDir, 'encore.lease'), 'expired-owner\texpired-token\t1\n');
    await writeFile(join(stateDir, 'messaging.lease'), 'malformed\n');
    const before = run(stateDir, ['aggregate-status']);
    assert.equal(before.status, 0, before.stderr);
    assert.match(before.stdout, /writer_admission=closed live=1 expired=1 missing=5 invalid=1 readers=untracked restart_safe=unknown/);
    assert.equal(before.stdout.includes(token), false);
    assert.equal(before.stdout.includes('private-owner'), false);
    assert.equal(await readFile(join(stateDir, 'encore.lease'), 'utf8'), 'expired-owner\texpired-token\t1\n');
    assert.equal(await readFile(join(stateDir, 'messaging.lease'), 'utf8'), 'malformed\n');
    for (const lane of ['general', 'interactive', 'identity', 'action-1']) {
      const blocked = run(stateDir, ['acquire', lane, 'another', '60']);
      assert.equal(blocked.status, 75, blocked.stderr);
      assert.match(blocked.stderr, /maintenance/);
    }
    assert.equal(run(stateDir, ['renew', 'general', token, '120']).status, 0);
    assert.equal(run(stateDir, ['release', 'general', token]).status, 0);
    assert.match(run(stateDir, ['aggregate-status']).stdout, /live=0 .*restart_safe=unknown/);
    await unlink(marker);
    assert.equal(run(stateDir, ['acquire', 'interactive', 'another', '60']).status, 0);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
