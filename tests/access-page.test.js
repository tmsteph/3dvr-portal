import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../access/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../access/app.js', import.meta.url), 'utf8');
const home = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('Access page keeps secrets out of the browser UI', () => {
  assert.match(page, /without SSH or passwords in chat/i);
  assert.doesNotMatch(page, /type=["']password["']/i);
  assert.doesNotMatch(app, /password|secret\s*=|token\s*=/i);
});

test('Access page exposes the owner approval path', () => {
  assert.match(page, /Create 3DVR machine access/);
  assert.match(page, /Bitwarden Secrets Manager machine account/);
  assert.match(page, /3DVR Secrets Broker/);
});

test('Portal navigation includes Access', () => {
  assert.match(home, /href="\/access\/"/);
  assert.match(home, /<strong>Access<\/strong>/);
});
