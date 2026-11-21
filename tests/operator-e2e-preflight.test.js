import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const harness = readFileSync(new URL('../scripts/operator-portal-e2e.mjs', import.meta.url), 'utf8');
const signInPage = readFileSync(new URL('../sign-in.html', import.meta.url), 'utf8');

test('sign-in accepts a bare or suffixed legacy username without duplicate @3dvr', () => {
  assert.match(signInPage, /const username = .*\.replace\(\/@3dvr\$\/i, ''\)/);
  assert.match(signInPage, /const alias = username \+ '@3dvr'/);
  assert.match(harness, /const signInUsername = alias\.replace\(\/@3dvr\$\/i, ''\)/);
  assert.equal((harness.match(/\.locator\('#username'\)\.fill\(signInUsername\)/g) || []).length, 2);
});

test('initial sign-in failure logs only pathname and coarse page state', () => {
  const initial = harness.split('async function signInExistingAccount()')[1]?.split('async function signInFreshPage')[0];
  assert.ok(initial);
  assert.match(initial, /E2E_INITIAL_SIGN_IN_PATH/);
  assert.match(initial, /E2E_INITIAL_SIGN_IN_READY_STATE/);
  assert.match(initial, /E2E_INITIAL_SIGN_IN_FORM_VISIBLE/);
  assert.match(initial, /E2E_INITIAL_SIGN_IN_RELOAD_VISIBLE/);
  assert.doesNotMatch(initial, /log\('E2E_INITIAL_SIGN_IN_(?:QUERY|PASSWORD|BODY|HTML)'/);
  // The outer failure handler must not save pages before verifying the signed-in identity.
  assert.match(harness, /if \(signInVerified\) await saveArtifacts\('failure'\)/);
  assert.match(harness, /signInVerified = true;/);
  const fresh = harness.split('async function signInFreshPage')[1]?.split('async function runCrossDeviceSyncAcceptance')[0];
  assert.ok(fresh);
  assert.doesNotMatch(fresh, /\.screenshot\(/);
});

test('live E2E refuses missing and public credentials before browser launch', () => {
  const publicAlias = harness.match(/^const publicAlias = '([^']+)';$/m)?.[1];
  const publicPassword = harness.match(/^const publicPassword = '([^']+)';$/m)?.[1];
  assert.ok(publicAlias && publicPassword);
  const scratch = mkdtempSync(join(tmpdir(), '3dvr-e2e-preflight-'));
  try {
    mkdirSync(join(scratch, 'scripts'), { recursive: true });
    const stub = join(scratch, 'node_modules', 'playwright');
    mkdirSync(stub, { recursive: true });
    writeFileSync(join(scratch, 'scripts', 'operator-portal-e2e.mjs'), harness);
    writeFileSync(join(stub, 'package.json'), JSON.stringify({
      name: 'playwright', type: 'module', exports: './index.js'
    }));
    writeFileSync(join(stub, 'index.js'), "export const chromium = { launch() { throw new Error('STUB_BROWSER_REACHED'); } };");
    const run = (alias, password) => {
      const env = { PATH: process.env.PATH || '', HOME: scratch,
        PORTAL_E2E_URL: 'https://portal.3dvr.tech' };
      if (alias !== undefined) env.PORTAL_E2E_ALIAS = alias;
      if (password !== undefined) env.PORTAL_E2E_PASSWORD = password;
      return spawnSync(process.execPath, ['scripts/operator-portal-e2e.mjs'], {
        cwd: scratch, env, encoding: 'utf8', timeout: 7000
      });
    };
    for (const [name, alias, password] of [
      ['missing', undefined, undefined],
      ['blank', ' ', ' '],
      ['missing-password', 'test-ci@3dvr', undefined],
      ['public-pair', publicAlias, publicPassword],
      ['public-alias-private-password', publicAlias, 'isolated-stub-only'],
      ['private-alias-public-password', 'private-ci@3dvr', publicPassword],
    ]) {
      const result = run(alias, password);
      assert.equal(result.status, 1, name);
      assert.match(result.stderr, /refusing public fallback/, name);
      assert.doesNotMatch(result.stderr, /STUB_BROWSER_REACHED/, name);
    }
    const control = run('private-ci@3dvr', 'isolated-stub-only');
    assert.equal(control.status, 1);
    assert.match(control.stderr, /STUB_BROWSER_REACHED/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
