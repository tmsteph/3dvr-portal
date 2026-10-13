import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Operator-first home exposes existing searchable apps dialog through menu', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<a href="#appsDialog" data-open-apps>All apps<\/a>/);
  assert.match(html, /<dialog id="appsDialog"/);
  assert.match(html, /id="appSearch" type="search"/);
  assert.match(html, /data-open-apps'\]\'\)\.forEach|querySelectorAll\('\[data-open-apps\]'\)/);
  assert.match(html, /event\.preventDefault\(\); openApps\(\)/);
  assert.match(html, /id="homeOperatorForm"/);
});
