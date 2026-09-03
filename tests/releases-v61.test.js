import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const releasesDir = new URL('../releases/', import.meta.url);

describe('release v0.0.61', () => {
  it('publishes v0.0.61 with the internal-test-public weekly cadence', async () => {
    const index = await readFile(new URL('index.html', releasesDir), 'utf8');
    const previous = await readFile(new URL('v0.0.60.html', releasesDir), 'utf8');
    const release = await readFile(new URL('v0.0.61.html', releasesDir), 'utf8');

    assert.match(index, /<h2>Latest Release<\/h2>[\s\S]*href="v0\.0\.61\.html">v0\.0\.61/);
    assert.match(index, /<h2>Release History<\/h2>[\s\S]*href="v0\.0\.61\.html">v0\.0\.61[\s\S]*href="v0\.0\.60\.html">v0\.0\.60/);
    assert.match(previous, /href="v0\.0\.61\.html">Next release<\/a>/);
    assert.match(release, /<h1>Release v0\.0\.61<\/h1>/);
    assert.match(release, /Week of August 31, 2026/);
    assert.match(release, /Internal release:<\/strong> Thursday, September 3, 2026/);
    assert.match(release, /Testing:<\/strong> Friday, September 4 through Sunday, September 6, 2026/);
    assert.match(release, /Public release:<\/strong> Monday, September 7, 2026/);
    assert.doesNotMatch(release, /Release Candidate/);
    assert.match(release, /href="v0\.0\.60\.html">Previous release<\/a>/);
    assert.match(release, /Operator can understand screenshots/);
    assert.match(release, /The Portal can remember useful information/);
    assert.match(release, /Operator can safely test editing code/);
    assert.match(release, /Regular computers can become Show-Tech AV nodes/);
    assert.match(release, /<h2>Safety<\/h2>/);
    assert.match(release, /<h2>In short<\/h2>/);
  });
});
