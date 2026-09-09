import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
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
