import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const releaseUrl = new URL('../releases/v0.0.62.html', import.meta.url);

describe('release v0.0.62 candidate', () => {
  it('documents the Thursday snapshot and continuous-integration release model', async () => {
    const release = await readFile(releaseUrl, 'utf8');

    assert.match(release, /<h1>Release v0\.0\.62 Candidate<\/h1>/);
    assert.match(release, /Week of September 7, 2026/);
    assert.match(release, /Internal snapshot:<\/strong> Thursday, September 10, 2026/);
    assert.match(release, /Testing and fixes:<\/strong> Friday, September 11 through Sunday, September 13, 2026/);
    assert.match(release, /Stable public milestone:<\/strong> Monday, September 14, 2026/);
    assert.match(release, /continuously integrate useful changes into <code>main<\/code>/);
    assert.match(release, /Thursday is our team checkpoint, not a wall around development/);
    assert.match(release, /href="v0\.0\.61\.html">Previous release<\/a>/);

    assert.match(release, /href="\.\.\/noteverse\/">Noteverse<\/a>/);
    assert.match(release, /href="\.\.\/driftspace\/">Driftspace<\/a>/);
    assert.match(release, /href="\.\.\/life-lab\/">Life Lab<\/a>/);
    assert.match(release, /href="\.\.\/access\/">Access Center<\/a>/);
    assert.match(release, /href="\.\.\/cleaning-network\/">Cleaning Network<\/a>/);
    assert.match(release, /What to test this weekend/);
  });
});
