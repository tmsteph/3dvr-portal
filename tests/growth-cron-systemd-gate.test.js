import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../scripts/ops/deploy-self-host-portal.sh', import.meta.url),
  'utf8'
);

test('disabled homepage growth cron exits cleanly before the HTTP trigger', () => {
  const line = source
    .split('\n')
    .find((candidate) => candidate.includes('/api/growth/homepage-hero-cron'));

  assert.ok(line, 'growth cron ExecStart should exist');
  assert.match(line, /GROWTH_HOMEPAGE_CRON_ENABLED/);
  assert.match(line, /case .*enabled.* in 1\|true\|yes\|on/);
  assert.ok(
    line.indexOf('GROWTH_HOMEPAGE_CRON_ENABLED') < line.indexOf('/usr/bin/curl'),
    'the enabled gate must run before curl'
  );
});
