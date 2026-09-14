import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('access matrix is a read-only view over authorization profiles', async () => {
  const [ui, focusUi] = await Promise.all([
    read('assembly/access-ui.js'),
    read('assembly/focus-ui.js'),
  ]);

  assert.match(ui, /ACCESS_PROFILES/);
  assert.match(ui, /Read workspace/);
  assert.match(ui, /Manage access/);
  assert.match(ui, /Authorize sync/);
  assert.match(ui, /remote grants and sync remain disabled/);
  assert.doesNotMatch(ui, /localStorage\.setItem/);
  assert.doesNotMatch(ui, /fetch\(/);
  assert.doesNotMatch(ui, /WebSocket/);
  assert.match(focusUi, /import '\.\/access-ui\.js';/);
});
