import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../operator/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../operator/secrets.js', import.meta.url), 'utf8');

test('Operator exposes an ephemeral Save to 3DVR Secrets flow', () => {
  assert.match(page, /Save to 3DVR Secrets/);
  assert.match(page, /id="secret-value" type="password"[^>]*autocomplete="off"/);
  assert.match(app, /store-secret/);
  assert.match(app, /secretValueHash/);
  assert.match(app, /runtime\/organism-bridge\.json/);
  assert.match(app, /valueInput\.value=''/);
  assert.doesNotMatch(app, /localStorage\.setItem|sessionStorage\.setItem/);
});
