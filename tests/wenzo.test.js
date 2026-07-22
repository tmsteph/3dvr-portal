import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('Wenzo art gallery', () => {
  it('ships an artist gallery with upload and about surfaces', async () => {
    const html = await readFile(new URL('../wenzo/index.html', import.meta.url), 'utf8');
    assert.match(html, /Wendy/); assert.match(html, /id="gallery"/); assert.match(html, /id="uploadForm"/); assert.match(html, /type="file"/); assert.match(html, /id="artPreview"/); assert.match(html, /optional.*Untitled/); assert.match(html, /id="about"/); assert.match(html, /cdn\.jsdelivr\.net\/npm\/gun\/gun\.js/);
  });
  it('stores resized work in Gun with a local fallback', async () => {
    const app = await readFile(new URL('../wenzo/app.js', import.meta.url), 'utf8');
    assert.match(app, /wenzoGallery/); assert.match(app, /localStorage\.setItem\(LOCAL_KEY/); assert.match(app, /toDataURL\('image\/jpeg', \.82\)/); assert.match(app, /root\?\.get\('works'\)\.get\(work\.id\)\.put\(work\)/); assert.match(app, /root\.get\('works'\)\.map\(\)/);
  });
  it('lets Wendy remove a work from Gun and the local fallback', async () => {
    const app = await readFile(new URL('../wenzo/app.js', import.meta.url), 'utf8');
    assert.match(app, /function removeWork\(id\)/);
    assert.match(app, /state\.works\.delete\(id\)/);
    assert.match(app, /deleted: true/);
    assert.match(app, /!work\.deleted/);
    assert.match(app, /function showPreview\(file\)/);
    assert.match(app, /URL\.createObjectURL\(file\)/);
    assert.match(app, /title: clean\(els\.title\.value\) \|\| 'Untitled'/);
  });
  it('opens artwork in an accessible full-screen viewer', async () => {
    const html = await readFile(new URL('../wenzo/index.html', import.meta.url), 'utf8');
    const app = await readFile(new URL('../wenzo/app.js', import.meta.url), 'utf8');
    assert.match(html, /id="lightbox".*role="dialog"/s);
    assert.match(html, /id="lightboxClose"/);
    assert.match(app, /function openLightbox\(work\)/);
    assert.match(app, /event\.key === 'Escape'/);
    assert.match(app, /aria-label', `View .* full screen`/);
  });
  it('supports rotating uploads and existing shared works', async () => {
    const html = await readFile(new URL('../wenzo/index.html', import.meta.url), 'utf8');
    const app = await readFile(new URL('../wenzo/app.js', import.meta.url), 'utf8');
    assert.match(html, /id="rotatePreview"/);
    assert.match(app, /function rotateDataUrl\(dataUrl\)/);
    assert.match(app, /function rotateWork\(id, button\)/);
    assert.match(app, /uploadRotation = \(uploadRotation \+ 1\) % 4/);
    assert.match(app, /publishWork\(updated\)/);
  });
  it('links back to the public 3DVR site from the footer', async () => {
    const html = await readFile(new URL('../wenzo/index.html', import.meta.url), 'utf8');
    assert.match(html, /<footer><a href="https:\/\/3dvr\.tech">3DVR Portal<\/a>/);
  });
});
