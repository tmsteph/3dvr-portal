import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const releasesDir = new URL('../releases/', import.meta.url);

describe('release v0.0.57', () => {
  it('publishes v0.0.57 as the latest weekly release in plain language', async () => {
    const index = await readFile(new URL('index.html', releasesDir), 'utf8');
    const release = await readFile(new URL('v0.0.57.html', releasesDir), 'utf8');

    assert.match(index, /<h2>Latest Release<\/h2>[\s\S]*href="v0\.0\.57\.html">v0\.0\.57/);
    assert.match(index, /Week of August 3, 2026/);

    assert.match(release, /<h1>Release v0\.0\.57<\/h1>/);
    assert.match(release, /href="v0\.0\.56\.html">Previous release<\/a>/);
    assert.match(release, /aria-disabled="true">Next release<\/span>/);
    assert.match(release, /This week, the portal got easier and safer to use/);
    assert.match(release, /Find new work/);
    assert.match(release, /Better Chat/);
    assert.match(release, /Easier Life Space/);
    assert.match(release, /Safe CRM move/);
    assert.match(release, /Safety notes/);
    assert.match(release, /pull\/1289/);
  });
});
