import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('production deploy reuses the persistent public tunnel helper', async () => {
  const deploy = await read('scripts/ops/deploy-self-host-portal.sh');

  assert.match(deploy, /ensure-portal-public-tunnel\.sh/);
  assert.match(deploy, /THREEDVR_PORTAL_PRODUCTION_DIR="\$base"/);
  assert.match(deploy, /THREEDVR_PORTAL_PORT="\$port"/);
  assert.match(deploy, /Persistent Portal public tunnel/);
  assert.doesNotMatch(deploy, /3dvr-portal-quick-tunnel/);
  assert.doesNotMatch(deploy, /state\/tunnel\.log/);
});
