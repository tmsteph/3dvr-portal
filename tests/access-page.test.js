import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../access/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../access/app.js', import.meta.url), 'utf8');
const home = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('Access page keeps the one-time machine token ephemeral', () => {
  assert.match(page, /without SSH or passwords in chat/i);
  assert.match(page, /type="password"[^>]*autocomplete="off"/i);
  assert.match(app, /bitwardenToken\.value = ''/);
  assert.doesNotMatch(app, /localStorage\.setItem\([^)]*bitwarden|sessionStorage\.setItem\([^)]*bitwarden/i);
  assert.match(app, /accessTokenHash/);
});

test('Access page exposes the owner approval path', () => {
  assert.match(page, /Create 3DVR machine access/);
  assert.match(page, /Bitwarden Secrets Manager/);
  assert.match(page, /3DVR Secrets Broker/);
  assert.match(app, /secrets-broker-owner/);
  assert.match(app, /data-decision=\"approve\"/);
});

test('Portal navigation includes Access', () => {
  assert.match(home, /href="\/access\/"/);
  assert.match(home, /<strong>Access<\/strong>/);
});
