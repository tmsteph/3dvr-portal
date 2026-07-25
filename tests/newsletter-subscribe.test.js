import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('blog signup uses the server CRM route and keeps a relay fallback', async () => {
  const app = await read('blog/app.js');
  const api = await read('api/newsletter/subscribe.js');
  assert.match(app, /fetch\('\/api\/newsletter\/subscribe'/);
  assert.match(app, /saveDirect/);
  assert.match(api, /Explicit consent required/);
  assert.match(api, /portalCrmTouchLogNode/);
});
