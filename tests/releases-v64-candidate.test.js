import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const releasesDir = new URL('../releases/', import.meta.url);

describe('release catch-up through v0.0.64 candidate', () => {
  it('publishes v0.0.63 as stable and exposes v0.0.64 as the current candidate', async () => {
    const index = await readFile(new URL('index.html', releasesDir), 'utf8');
    const release62 = await readFile(new URL('v0.0.62.html', releasesDir), 'utf8');
    const release63 = await readFile(new URL('v0.0.63.html', releasesDir), 'utf8');
    const release64 = await readFile(new URL('v0.0.64.html', releasesDir), 'utf8');

    assert.match(index, /<h2>Latest Release<\/h2>[\s\S]*href="v0\.0\.63\.html">v0\.0\.63/);
    assert.match(index, /<h2>Current Candidate<\/h2>[\s\S]*href="v0\.0\.64\.html">v0\.0\.64/);
    assert.match(release62, /href="v0\.0\.63\.html">Next release<\/a>/);
    assert.match(release63, /<h1>Release v0\.0\.63<\/h1>/);
    assert.match(release63, /Stable public milestone:<\/strong> Monday, September 21, 2026/);
    assert.match(release63, /href="v0\.0\.64\.html">Next release candidate<\/a>/);
    assert.match(release64, /<h1>Release v0\.0\.64 Candidate<\/h1>/);
    assert.match(release64, /Stable public milestone target:<\/strong> Monday, September 28, 2026/);
    assert.match(release64, /Current candidate/);
  });
});
