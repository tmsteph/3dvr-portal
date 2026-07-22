import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('Wenzo art gallery', () => {
  it('ships an artist gallery with upload and about surfaces', async () => {
    const html = await readFile(new URL('../wenzo/index.html', import.meta.url), 'utf8');
    assert.match(html, /Wendy/); assert.match(html, /id="gallery"/); assert.match(html, /id="uploadForm"/); assert.match(html, /type="file"/); assert.match(html, /id="about"/); assert.match(html, /cdn\.jsdelivr\.net\/npm\/gun\/gun\.js/);
  });
  it('stores resized work in Gun with a local fallback', async () => {
    const app = await readFile(new URL('../wenzo/app.js', import.meta.url), 'utf8');
    assert.match(app, /wenzoGallery/); assert.match(app, /localStorage\.setItem\(LOCAL_KEY/); assert.match(app, /toDataURL\('image\/jpeg', \.82\)/); assert.match(app, /root\?\.get\('works'\)\.get\(work\.id\)\.put\(work\)/); assert.match(app, /root\.get\('works'\)\.map\(\)/);
  });
});
