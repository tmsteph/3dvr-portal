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
  assert.match(ensure, /portal_is_ready\(\)/);
  assert.match(ensure, /\/__3dvr-health/);
  assert.match(ensure, /wait_for_portal "\$existing_url" 20/);
  assert.match(ensure, /is_running && portal_is_ready "\$url"/);
  assert.match(ensure, /THREEDVR_PUBLIC_TUNNEL_MAX_WAIT_SECONDS/);
  assert.match(ensure, /deadline_epoch/);
  assert.match(ensure, /for delay in 0 15/);
  assert.match(ensure, /stop_tunnel\(\)/);
  assert.match(ensure, /start_tunnel\(\) \{\s+stop_tunnel/);
  assert.match(ensure, /PORTAL_SELF_HOST_URL/);
  assert.match(ensure, /PORTAL_ORGANISM_BRIDGE_URL/);
  assert.match(bridge, /THREEDVR_PORTAL_CANONICAL_URL:-https:\/\/portal\.3dvr\.tech/);
  assert.match(bridge, /3dvr-organism-owner-bridge/);
  assert.ok(
    bridge.indexOf('canonical_url=') < bridge.indexOf('ensure-portal-public-tunnel.sh'),
    'Organism bridge should reuse the canonical portal route before fallback tunneling',
  );
  assert.match(bridge, /ensure-portal-public-tunnel\.sh/);
  assert.doesNotMatch(bridge, /state\/tunnel\.log/);
});
