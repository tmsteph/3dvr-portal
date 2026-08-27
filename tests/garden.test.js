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
    assert.match(html, /Saved locally · Checking encrypted account sync/);
    assert.match(html, /cdn\.jsdelivr\.net\/npm\/gun\/gun\.js/);
    assert.match(html, /cdn\.jsdelivr\.net\/npm\/gun\/sea\.js/);
    assert.match(html, /src="\/auth-identity\.js"/);
    assert.match(html, /type="module" src="\.\/app\.js"/);
    assert.doesNotMatch(html, /credit card/i);
    assert.doesNotMatch(html, /pricing/i);
  });

  it('stores a richer project model, tombstones, and migrates the v1 garden', async () => {
    const app = await readFile(new URL('../garden/app.js', import.meta.url), 'utf8');

    assert.match(app, /import \{ createGardenSync \} from '\.\/sync\.js'/);
    assert.match(app, /3dvr\.ideaGarden\.v2/);
    assert.match(app, /3dvr\.ideaGarden\.v1/);
    assert.match(app, /3dvr\.ideaGarden\.deleted\.v1/);
    assert.match(app, /why:/);
    assert.match(app, /nextStep:/);
    assert.match(app, /focused:/);
    assert.match(app, /function normalizeIdea/);
    assert.match(app, /function normalizeDeleted/);
    assert.match(app, /function markDeleted/);
    assert.match(app, /function reconcileDeleted/);
    assert.match(app, /function migrateLegacyIdeas/);
    assert.match(app, /function setFocus/);
    assert.match(app, /function buildGardenPayload/);
    assert.match(app, /version:\s*3/);
    assert.match(app, /function startSync/);
    assert.match(app, /sync\.load\(buildGardenPayload\(\)\)/);
    assert.match(app, /sync\.save\(buildGardenPayload\(\)\)/);
    assert.match(app, /accountLink\.href = signedIn \? '\/profile\.html'/);
    assert.match(app, /function downloadGarden/);
    assert.match(app, /function toolForStage/);
    assert.doesNotMatch(app, /encodeURIComponent\(idea\.text\)/);
    assert.doesNotMatch(app, /[?&]idea=/);
    assert.match(app, /href: '\.\.\/forge\/'/);
    assert.match(app, /href: '\.\.\/launch-room\/\?mode=start-project'/);
    assert.match(app, /Seed/);
    assert.match(app, /Exploring/);
    assert.match(app, /Project/);
    assert.match(app, /Finished/);
  });

  it('keeps the layout mobile-first and avoids horizontal overflow', async () => {
    const css = await readFile(new URL('../garden/style.css', import.meta.url), 'utf8');

    assert.match(css, /\[hidden\]\s*\{\s*display:\s*none !important;/);
    assert.match(css, /overflow-x:\s*hidden/);
    assert.match(css, /\.garden-toolbar/);
    assert.match(css, /\.focus-shelf/);
    assert.match(css, /\.nurture-grid/);
    assert.match(css, /@media \(max-width: 720px\)/);
    assert.match(css, /grid-template-columns:\s*1fr/);
  });
});
