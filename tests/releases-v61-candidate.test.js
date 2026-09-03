import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const releasesDir = new URL('../releases/', import.meta.url);

describe('release v0.0.61 candidate', () => {
  it('stages v0.0.61 without declaring it released before Monday', async () => {
    const index = await readFile(new URL('index.html', releasesDir), 'utf8');
    const release = await readFile(new URL('v0.0.61.html', releasesDir), 'utf8');

    assert.match(index, /<h2>Latest Release<\/h2>[\s\S]*href="v0\.0\.60\.html">v0\.0\.60/);
    assert.match(release, /<h1>Release v0\.0\.61<\/h1>/);
    assert.match(release, /Week of August 31, 2026/);
    assert.match(release, /Release Candidate/);
    assert.match(release, /September 3, 2026/);
    assert.match(release, /September 4–6, 2026/);
    assert.match(release, /September 7, 2026/);
    assert.match(release, /href="v0\.0\.60\.html">Previous release<\/a>/);
    assert.match(release, /aria-disabled="true">Next release<\/span>/);
    assert.match(release, /Operator became a real multimodal control surface/);
    assert.match(release, /Digital Organism became the Portal's durable local memory layer/);
    assert.match(release, /Self-editing moved from concept toward proved machinery/);
    assert.match(release, /Show-Tech became implementation-backed AV infrastructure/);
    assert.match(release, /Safety notes/);
  });
});
