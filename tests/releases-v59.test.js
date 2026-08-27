import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const releasesDir = new URL('../releases/', import.meta.url);

describe('release v0.0.59', () => {
  it('publishes v0.0.59 as the latest completed weekly milestone', async () => {
    const index = await readFile(new URL('index.html', releasesDir), 'utf8');
    const release = await readFile(new URL('v0.0.59.html', releasesDir), 'utf8');
    const release58 = await readFile(new URL('v0.0.58.html', releasesDir), 'utf8');

    assert.match(index, /<h2>Latest Release<\/h2>[\s\S]*href="v0\.0\.59\.html">v0\.0\.59/);
    assert.match(index, /href="v0\.0\.58\.html">v0\.0\.58/);
    assert.match(release, /<h1>Release v0\.0\.59<\/h1>/);
    assert.match(release, /Week of August 17, 2026/);
    assert.match(release, /href="v0\.0\.58\.html">Previous release<\/a>/);
    assert.match(release, /aria-disabled="true">Next release<\/span>/);
    assert.match(release58, /href="v0\.0\.59\.html">Next release<\/a>/);
    assert.match(release, /Android Assistant voice loop/);
    assert.match(release, /native Forge permissions/);
    assert.match(release, /3DVR Workspace/);
    assert.match(release, /free website promise is actually free/i);
    assert.match(release, /Open source moved beyond software/);
    assert.match(release, /Safety notes/);
  });
});
