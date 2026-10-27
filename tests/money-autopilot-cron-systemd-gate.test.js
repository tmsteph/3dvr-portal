import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const deploy = await readFile(new URL('../scripts/ops/deploy-self-host-portal.sh', import.meta.url), 'utf8');
const handler = await readFile(new URL('../src/money/autopilot-cron-handler.js', import.meta.url), 'utf8');

test('installed money cron uses the same bearer secret precedence as its handler', () => {
  const line = deploy.split('\n').find(value => value.includes('/api/money/autopilot-cron'));
  assert.ok(line, 'installed cron service ExecStart exists');
  assert.match(line, /MONEY_AUTOPILOT_CRON_ENABLED/);
  assert.match(line, /case .*enabled.* in 1\|true\|yes\|on/);
  assert.match(line, /CRON_SECRET/);
  assert.match(line, /MONEY_AUTOPILOT_CRON_SECRET/);
  assert.doesNotMatch(line, /MONEY_AUTOPILOT_TOKEN/);
  assert.match(handler, /config\.CRON_SECRET \|\| config\.MONEY_AUTOPILOT_CRON_SECRET/);
  assert.ok(line.indexOf('CRON_SECRET') < line.indexOf('/usr/bin/curl'));
});

test('enabled money cron fails visibly when no bearer secret is configured', () => {
  const line = deploy.split('\n').find(value => value.includes('/api/money/autopilot-cron'));
  assert.ok(line);
  assert.match(line, /cron secret is missing/);
  assert.match(line, /exit 1/);
  assert.ok(line.indexOf('MONEY_AUTOPILOT_CRON_ENABLED') < line.indexOf('/usr/bin/curl'));
});
