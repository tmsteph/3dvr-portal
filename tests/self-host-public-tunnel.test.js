import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('self-host deploy has a persistent public tunnel recovery path', async () => {
  const ensure = await read('scripts/ops/ensure-portal-public-tunnel.sh');
  const bridge = await read('scripts/ops/install-organism-owner-bridge.sh');

  assert.match(ensure, /3dvr-portal-public-tunnel/);
  assert.match(ensure, /tmux has-session/);
  assert.match(ensure, /if is_running && \[ -n "\$existing_url" \]/);
  assert.match(ensure, /for delay in 0 15 45 90/);
  assert.match(ensure, /PORTAL_SELF_HOST_URL/);
  assert.match(ensure, /PORTAL_ORGANISM_BRIDGE_URL/);
  assert.match(bridge, /ensure-portal-public-tunnel\.sh/);
  assert.doesNotMatch(bridge, /state\/tunnel\.log/);
});
