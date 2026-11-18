import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
