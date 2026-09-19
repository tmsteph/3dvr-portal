import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const admitPath = fileURLToPath(new URL('../ops/browser/3dvr-browser-admit', import.meta.url));
const launcherUrl = new URL('../ops/browser/3dvr-browser-lane-start', import.meta.url);
const gatewayUrl = new URL('../apps/agent/thomas-agent/node/human-handoff-gateway.js', import.meta.url);

function runAdmit(extra = {}) {
  return spawnSync('bash', [admitPath, 'identity'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      THREEDVR_BROWSER_TEST_MEM_AVAILABLE_MB: '6000',
      THREEDVR_BROWSER_TEST_LOAD1: '1.0',
      THREEDVR_BROWSER_TEST_CPUS: '4',
      THREEDVR_BROWSER_TEST_ACTIVE: '2',
      ...extra,
    },
  });
}

test('browser admission allows an identity lane with healthy headroom', () => {
  const result = runAdmit();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /browser_admission=allowed/);
});

test('browser admission blocks when host memory reserve would be violated', () => {
  const result = runAdmit({ THREEDVR_BROWSER_TEST_MEM_AVAILABLE_MB: '2500' });
  assert.equal(result.status, 75);
  assert.match(result.stderr, /reason=memory/);
});

test('browser admission allows a fourth lane when host resources are healthy', () => {
  const result = runAdmit({ THREEDVR_BROWSER_TEST_ACTIVE: '4' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /max_active=4/);
});

test('browser admission blocks a fifth concurrent browser lane', () => {
  const result = runAdmit({ THREEDVR_BROWSER_TEST_ACTIVE: '4' });
  assert.equal(result.status, 75);
  assert.match(result.stderr, /reason=browser-count/);
});

test('browser admission blocks high load relative to CPU count', () => {
  const result = runAdmit({ THREEDVR_BROWSER_TEST_LOAD1: '5.5', THREEDVR_BROWSER_TEST_CPUS: '4' });
  assert.equal(result.status, 75);
  assert.match(result.stderr, /reason=load/);
});

test('identity lane has its own profile, CDP port, admission guard, and handoff support', async () => {
  const launcher = await readFile(launcherUrl, 'utf8');
  const gateway = await readFile(gatewayUrl, 'utf8');

  assert.match(launcher, /identity\)/);
  assert.match(launcher, /port=9666/);
  assert.match(launcher, /browser-profiles\/identity/);
  assert.match(launcher, /3dvr-browser-admit/);
  assert.match(gateway, /identity:\s*9666/);
});
