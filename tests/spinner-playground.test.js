import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('spinner playground stands alone as the full-screen spinner toy', async () => {
  const [homepage, playground] = await Promise.all([
    read('index.html'),
    read('spinner/index.html')
  ]);

  assert.match(playground, /data-portal-swirl-logo/);
  assert.match(playground, /portal-swirl-logo\.js/);
  assert.match(playground, /double-click/i);
  assert.match(playground, /wheel/i);
  // The homepage spinner no longer auto-routes playful visitors here:
  // the playground is reached by its own URL, not by playing at home.
  assert.doesNotMatch(homepage, /spinner-direction\.js/);
  assert.doesNotMatch(homepage, /data-spinner-nav-toggle/);
});
