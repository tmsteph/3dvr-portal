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
  assert.match(deploy, /THREEDVR_PORTAL_CANONICAL_URL:-https:\/\/portal\.3dvr\.tech/);
  assert.match(deploy, /Canonical Portal route already serves the deployed release/);
  assert.match(deploy, /homepage_hash=.*curl -fsS --max-time 5 "\$url\/"[\s\S]*sha256sum/);
  assert.match(deploy, /expected_homepage_hash=.*sha256sum "\$current\/index\.html"/);
  assert.match(deploy, /Health can be routed to self-host while the public root is still an older/);
  assert.ok(
    deploy.indexOf('public_portal_ready "$canonical_portal_url"') <
      deploy.indexOf('ensure-portal-public-tunnel.sh'),
    'canonical public route should be reused before starting a fallback tunnel',
  );
  assert.doesNotMatch(deploy, /3dvr-portal-quick-tunnel/);
  assert.doesNotMatch(deploy, /state\/tunnel\.log/);
});


test('persistent tunnel helper avoids rapid Cloudflare restart churn', async () => {
  const helper = await read('scripts/ops/ensure-portal-public-tunnel.sh');

  assert.match(helper, /for delay in 0 15; do/);
  assert.match(helper, /for _ in \$\(seq 1 120\); do/);
  assert.doesNotMatch(helper, /for delay in 0 10 20 40; do/);
});
