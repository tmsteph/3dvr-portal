import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('AV Freelance Launchpad runs a Gun-backed copy experiment on the free Work Agent CTA', async () => {
  const html = await readFile(new URL('../av-freelance/index.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../av-freelance/experiment.js', import.meta.url), 'utf8');
  assert.match(html, /id="heroCopy"/);
  assert.match(html, /data-work-agent-cta="hero"/);
  assert.match(html, /data-starter-kit-cta="hero"/);
  assert.match(html, /cdn\.jsdelivr\.net\/npm\/gun\/gun\.js/);
  assert.match(html, /type="module" src="\.\/experiment\.js"/);
  assert.match(js, /AV_FREELANCE_HERO_EXPERIMENT/);
  assert.match(js, /assignVariant/);
  assert.match(js, /experimentPath/);
  assert.match(js, /recordEvent\(variant, 'view'\)/);
  assert.match(js, /'work-agent-open'/);
});
