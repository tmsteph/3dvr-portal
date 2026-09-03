import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('full Operator shows the same portal-style busy feedback as the homepage', async () => {
  const busyUi = await read('operator/home-busy-state.js');
  const app = await read('operator/app.js');

  assert.match(app, /form\.querySelector\('button'\)\.disabled=true/);
  assert.match(busyUi, /#operator-form/);
  assert.match(busyUi, /operator-submit__portal/);
  assert.match(busyUi, /portal-logo\.svg/);
  assert.match(busyUi, /operator-full-portal-spin/);
  assert.match(busyUi, /const busy = submit\.disabled/);
  assert.match(busyUi, /form\.setAttribute\('aria-busy', String\(busy\)\)/);
  assert.match(busyUi, /busy \? 'Operator is working' : 'Do it'/);
});
