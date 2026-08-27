import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const releasesDir = new URL('../releases/', import.meta.url);

describe('release v0.0.60', () => {
  it('publishes v0.0.60 as the current weekly milestone', async () => {
    const index = await readFile(new URL('index.html', releasesDir), 'utf8');
    const release = await readFile(new URL('v0.0.60.html', releasesDir), 'utf8');
    const release59 = await readFile(new URL('v0.0.59.html', releasesDir), 'utf8');

    assert.match(index, /<h2>Latest Release<\/h2>[\s\S]*href="v0\.0\.60\.html">v0\.0\.60/);
    assert.match(release, /<h1>Release v0\.0\.60<\/h1>/);
    assert.match(release, /Week of August 24, 2026/);
    assert.match(release, /href="v0\.0\.59\.html">Previous release<\/a>/);
    assert.match(release, /aria-disabled="true">Next release<\/span>/);
    assert.match(release59, /href="v0\.0\.60\.html">Next release<\/a>/);
    assert.match(release, /Portal started standing on its own infrastructure/);
    assert.match(release, /Idea Garden became a real project-nurturing space/);
    assert.match(release, /Growth Operator got clearer paths from skill to income/);
    assert.match(release, /Instant Business Audit/);
    assert.match(release, /Rank &amp; File Network/);
    assert.match(release, /calendar became much easier to scan/i);
    assert.match(release, /Safety notes/);
  });
});
