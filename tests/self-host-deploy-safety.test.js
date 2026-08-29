import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../scripts/ops/deploy-self-host-portal.sh', import.meta.url),
  'utf8'
);

test('self-host deploy validates the candidate before switching current', () => {
  const candidateHealth = source.indexOf('wait_for_release "$candidate_url" "$sha"');
  const candidateWorkboard = source.indexOf('validate_workboard "$candidate_url"');
  const switchCurrent = source.indexOf('ln -sfn "$release" "$current"');

  assert.ok(candidateHealth >= 0, 'candidate health check must exist');
  assert.ok(candidateWorkboard > candidateHealth, 'candidate Workboard check must follow health');
  assert.ok(switchCurrent > candidateWorkboard, 'live symlink must switch only after candidate validation');
});

test('self-host deploy rolls back live health or Workboard failures', () => {
  assert.match(source, /previous_release="\$\(readlink -f "\$current"/);
  assert.match(source, /rollback_live\(\)/);
  assert.match(source, /if ! wait_for_release "\$live_url" "\$sha"; then[\s\S]*?rollback_live/);
  assert.match(source, /if ! validate_workboard "\$live_url"; then[\s\S]*?rollback_live/);
});

test('Cloudflare tunnel changes happen only after live validation', () => {
  const liveWorkboard = source.indexOf('validate_workboard "$live_url"');
  const cloudflared = source.indexOf('cloudflared="$(command -v cloudflared || true)"');
  assert.ok(liveWorkboard >= 0);
  assert.ok(cloudflared > liveWorkboard);
});
