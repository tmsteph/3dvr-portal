import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const deploy = await readFile(new URL('../scripts/ops/deploy-self-host-portal.sh', import.meta.url), 'utf8');
const handler = await readFile(new URL('../src/money/autopilot-cron-handler.js', import.meta.url), 'utf8');

test('installed money cron uses the same bearer secret precedence as its handler', () => {
  const line = deploy.split('\n').find(value => value.includes('/api/money/autopilot-cron'));
  assert.ok(line, 'installed cron service ExecStart exists');
  assert.match(line, /MONEY_AUTOPILOT_CRON_ENABLED/);
  assert.match(line, /MONEY_AUTOPILOT_CRON_RUN_AUTHORIZED/);
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

test('generated shell gate trims whitespace like the handler, without invoking curl', () => {
  const line = deploy.split('\n').find(value => value.includes('/api/money/autopilot-cron'));
  const command = line?.match(/^ExecStart=\/bin\/sh -lc '(.*)'$/)?.[1]?.replace(/\\\$/g, '$');
  assert.ok(command, 'shell command can be extracted from unit template');

  const run = (enabled, authorized = 'false') => spawnSync('/bin/sh', ['-lc', command], {
    env: {
      PATH: process.env.PATH || '/usr/bin:/bin',
      MONEY_AUTOPILOT_CRON_ENABLED: enabled,
      MONEY_AUTOPILOT_CRON_RUN_AUTHORIZED: authorized,
      CRON_SECRET: '',
      MONEY_AUTOPILOT_CRON_SECRET: ''
    },
    encoding: 'utf8',
    timeout: 2000
  });

  const unapproved = run(' TRUE ', 'false');
  assert.equal(unapproved.status, 0, unapproved.stderr);
  assert.match(unapproved.stderr, /awaits explicit run authorization/);
  assert.doesNotMatch(unapproved.stderr, /cron secret is missing/);

  const enabled = run(' TRUE ', 'true');
  assert.equal(enabled.status, 1, enabled.stderr);
  assert.match(enabled.stderr, /cron secret is missing/);

  const disabled = run(' FALSE ');
  assert.equal(disabled.status, 0, disabled.stderr);
  assert.doesNotMatch(disabled.stderr, /cron secret is missing/);
});

test('scheduled money cron is a no-publish, no-promotion dry-run even if live feature flags are configured', () => {
  const line = deploy.split('\n').find(value => value.includes('/api/money/autopilot-cron'));
  assert.ok(line);
  assert.match(line, /\/api\/money\/autopilot-cron\?dryRun=true&publish=false&vercelDeploy=false&promotion=false/);
  assert.match(handler, /MONEY_AUTOPILOT_CRON_RUN_AUTHORIZED/);
  assert.match(handler, /dryRun: true/);
  assert.match(handler, /publishEnabled: false/);
  assert.match(handler, /vercelDeploy: false/);
  assert.match(handler, /promotionEnabled: false/);
  assert.doesNotMatch(handler, /readQueryValue\(req, '(?:dryRun|publish|vercelDeploy|promotion)'\)/);
});
