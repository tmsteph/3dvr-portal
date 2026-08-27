import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('3DVR Idea Garden', () => {
  it('keeps capture simple while exposing nurturing tools', async () => {
    const html = await readFile(new URL('../garden/index.html', import.meta.url), 'utf8');

    assert.match(html, /Your ideas deserve somewhere to live/);
    assert.match(html, /data-garden-filter="all"/);
    assert.match(html, /id="gardenSearch"/);
    assert.match(html, /id="focusShelf"/);
    assert.match(html, /id="downloadGarden"/);
    assert.match(html, /Stored only in this browser/);
    assert.doesNotMatch(html, /credit card/i);
    assert.doesNotMatch(html, /pricing/i);
  });

  it('stores a richer project model and migrates the v1 garden', async () => {
    const app = await readFile(new URL('../garden/app.js', import.meta.url), 'utf8');

    assert.match(app, /3dvr\.ideaGarden\.v2/);
    assert.match(app, /3dvr\.ideaGarden\.v1/);
    assert.match(app, /why:/);
    assert.match(app, /nextStep:/);
    assert.match(app, /focused:/);
    assert.match(app, /function normalizeIdea/);
    assert.match(app, /function migrateLegacyIdeas/);
    assert.match(app, /function setFocus/);
    assert.match(app, /function downloadGarden/);
    assert.match(app, /function toolForStage/);
    assert.match(app, /encodeURIComponent\(idea\.text\)/);
    assert.match(app, /Seed/);
    assert.match(app, /Exploring/);
    assert.match(app, /Project/);
    assert.match(app, /Finished/);
  });

  it('keeps the layout mobile-first and avoids horizontal overflow', async () => {
    const css = await readFile(new URL('../garden/style.css', import.meta.url), 'utf8');

    assert.match(css, /overflow-x:\s*hidden/);
    assert.match(css, /\.garden-toolbar/);
    assert.match(css, /\.focus-shelf/);
    assert.match(css, /\.nurture-grid/);
    assert.match(css, /@media \(max-width: 720px\)/);
    assert.match(css, /grid-template-columns:\s*1fr/);
  });
});
