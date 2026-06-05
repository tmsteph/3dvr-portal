import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('portal homepage links to the public 3dvr.tech vision page', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /href="https:\/\/3dvr\.tech\/vision\/"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener"/);
  assert.match(html, /<span class="app-card__title">Vision<\/span>/);
  assert.match(html, /open hardware and nomad ecosystem roadmap/);
  assert.match(html, /data-app-keywords="vision roadmap open hardware backpack car laptop phone e-bike tent yurt nomad ecosystem"/);
});
