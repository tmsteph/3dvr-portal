import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const dir = new URL('../releases/', import.meta.url);
const weeks = ['September 28', 'October 5', 'October 12', 'October 19', 'October 26', 'November 2', 'November 9', 'November 16'];
it('keeps retrospective weeks distinct from stable certification and links the full chain', async () => {
  const index = await readFile(new URL('index.html', dir), 'utf8');
  const stable = index.match(/<h2>Latest Recorded Stable Release<\/h2>([\s\S]*?)<\/article>/)[1];
  assert.match(stable, /v0\.0\.63\.html/);
  assert.doesNotMatch(stable, /v0\.0\.(6[4-9]|7[0-2])\.html/);
  for (let n = 65; n <= 72; n++) {
    const html = await readFile(new URL(`v0.0.${n}.html`, dir), 'utf8');
    assert.ok(html.includes(`Week of ${weeks[n - 65]}, 2026`));
    assert.match(html, n === 72 ? /Current weekly checkpoint · validation pending/ : /Retrospective weekly checkpoint · validation not recorded/);
    assert.match(html, /America\/Los_Angeles/);
    assert.match(html, /<h2>The story this week<\/h2>/);
    assert.match(html, /<h2>Validation status<\/h2>/);
    assert.match(html, /https:\/\/github.com\/tmsteph\/3dvr-portal\/(pull|commit)\//);
    assert.ok(html.includes(`href="v0.0.${n - 1}.html"`));
    if (n < 72) assert.ok(html.includes(`href="v0.0.${n + 1}.html"`));
    assert.ok(index.includes(`href="v0.0.${n}.html"`));
    assert.doesNotMatch(html, /<strong>Stable public milestone:<\/strong>/);
  }
});
it('archives the stale candidate without silently promoting it', async () => {
  const html = await readFile(new URL('v0.0.64.html', dir), 'utf8');
  assert.match(html, /href="v0.0.65.html"/);
  assert.match(html, /archived unvalidated candidate/);
  assert.doesNotMatch(html, /is the active candidate|after the current weekend/);
});
