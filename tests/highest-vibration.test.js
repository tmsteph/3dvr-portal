import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('highest vibration is a real portal experience with an evidence-aware research source', async () => {
  const [page, app, researchPage, researchNote, portal, researchIndex, architecture] = await Promise.all([
    read('../highest-vibration/index.html'),
    read('../highest-vibration/app.js'),
    read('../research/highest-vibration/index.html'),
    read('../docs/research/highest-vibration-human-flourishing.md'),
    read('../index.html'),
    read('../research/index.html'),
    read('../docs/product-architecture.md'),
  ]);

  assert.match(page, /State.*Purpose.*Vision.*Movement.*Creation.*Service/s);
  assert.match(page, /Saved only in this browser/);
  assert.match(app, /localStorage/);
  assert.match(app, /quietest signal today/);
  assert.match(researchPage, /data-document="\/docs\/research\/highest-vibration-human-flourishing\.md"/);
  assert.match(researchNote, /Measured:/);
  assert.match(researchNote, /Traditional:/);
  assert.match(researchNote, /Interpretive:/);
  assert.match(researchNote, /Personal:/);
  assert.match(portal, /href="\/highest-vibration\/"/);
  assert.match(researchIndex, /Highest Vibration as Human Flourishing/);
  assert.match(architecture, /### Highest Vibration/);
});
