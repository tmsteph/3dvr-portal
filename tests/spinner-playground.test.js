import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('spinner playground is discoverable through repeated spinner interaction', async () => {
  const [direction, playground] = await Promise.all([
    read('spinner-direction.js'),
    read('spinner/index.html')
  ]);

  assert.match(direction, /SPINNER_PLAYGROUND_INTERACTIONS_REQUIRED/);
  assert.match(direction, /\/spinner\//);
  assert.match(playground, /data-portal-swirl-logo/);
  assert.match(playground, /portal-swirl-logo\.js/);
  assert.match(playground, /double-click/i);
  assert.match(playground, /wheel/i);
});
