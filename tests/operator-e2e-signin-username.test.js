import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const harness = readFileSync(new URL('../scripts/operator-portal-e2e.mjs', import.meta.url), 'utf8');
const signInPage = readFileSync(new URL('../sign-in.html', import.meta.url), 'utf8');

test('the sign-in form adds exactly one @3dvr suffix to its typed username', () => {
  assert.match(signInPage, /const alias\s*=\s*username\s*\+\s*["']@3dvr["']/);
});

test('Operator E2E enters an unsuffixed username in both browser contexts', () => {
  assert.match(
    harness,
    /^const signInUsername = alias\.endsWith\('@3dvr'\) \? alias\.slice\(0, -'@3dvr'\.length\) : alias;$/m
  );
  const normalizedFills = harness.match(/(?:page|targetPage)\.locator\('#username'\)\.fill\(signInUsername\);/g) || [];
  assert.equal(normalizedFills.length, 2, 'initial and fresh-device sign-in should both use signInUsername');
  assert.doesNotMatch(harness, /\.locator\('#username'\)\.fill\(alias\)/);
});


test('production preflight refuses missing and explicitly disclosed E2E identity before browser launch', () => {
  const publicAlias = harness.match(/^const publicAlias = '([^']+)';$/m)?.[1];
  const publicPassword = harness.match(/^const publicPassword = '([^']+)';$/m)?.[1];
  assert.ok(publicAlias && publicPassword, 'source fallback identity should be identifiable');

  const scratch = mkdtempSync(join(tmpdir(), '3dvr-e2e-preflight-'));
  try {
    mkdirSync(join(scratch, 'scripts'), { recursive: true });
    const stubDirectory = join(scratch, 'node_modules', 'playwright');
    mkdirSync(stubDirectory, { recursive: true });
    writeFileSync(join(scratch, 'scripts', 'operator-portal-e2e.mjs'), harness);
    writeFileSync(join(stubDirectory, 'package.json'),
      JSON.stringify({ name: 'playwright', type: 'module', exports: './index.js' }));
    writeFileSync(join(stubDirectory, 'index.js'),
      "export const chromium = { launch() { throw new Error('E2E_STUB_BROWSER_REACHED'); } };");

    const run = (alias, password) => {
      const env = { PATH: process.env.PATH || '', HOME: scratch,
        PORTAL_E2E_URL: 'https://portal.3dvr.tech' };
      if (alias !== undefined) env.PORTAL_E2E_ALIAS = alias;
      if (password !== undefined) env.PORTAL_E2E_PASSWORD = password;
      return spawnSync(process.execPath, ['scripts/operator-portal-e2e.mjs'], {
        cwd: scratch, env, encoding: 'utf8', timeout: 5000
      });
    };

    for (const [name, alias, password] of [
      ['unset', undefined, undefined],
      ['blank', ' ', ' '],
      ['missing-password', 'isolated-ci@3dvr', undefined],
      ['explicit-public-pair', publicAlias, publicPassword]
    ]) {
      const result = run(alias, password);
      assert.equal(result.status, 1, name);
      assert.match(result.stderr, /refusing public fallback/, name);
      assert.doesNotMatch(result.stderr, /E2E_STUB_BROWSER_REACHED/, name);
    }

    // The distinct, non-public placeholder pair passes only the preflight.
    // The local Playwright stub deliberately refuses browser launch.
    const control = run('isolated-ci@3dvr', 'unused-test-value');
    assert.equal(control.status, 1);
    assert.match(control.stderr, /E2E_STUB_BROWSER_REACHED/);
    assert.doesNotMatch(control.stderr, /refusing public fallback/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
