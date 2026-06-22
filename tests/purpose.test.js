import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('Purpose app', () => {
  it('ships a focused standalone Purpose experience and portal card', async () => {
    const purposeHtml = await readFile(new URL('../purpose/index.html', import.meta.url), 'utf8');
    const purposeCss = await readFile(new URL('../purpose/styles.css', import.meta.url), 'utf8');
    const purposeJs = await readFile(new URL('../purpose/app.js', import.meta.url), 'utf8');
    const portalIndex = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    const vercelConfig = await readFile(new URL('../vercel.json', import.meta.url), 'utf8');

    assert.match(purposeHtml, /Purpose by 3DVR/);
    assert.match(purposeHtml, /Organize your life\. Find your purpose\. Launch meaningful projects\./);
    assert.match(purposeHtml, /Your life has patterns\. Purpose helps you see them\./);
    assert.match(purposeHtml, /Start My Purpose Map/);
    assert.match(purposeHtml, /Your answers stay on this device unless you choose to export, share, or create an account to save\./);
    assert.match(purposeHtml, /What feels scattered or unfinished in your life right now\?/);
    assert.match(purposeHtml, /Want to save this and come back later\?/);
    assert.match(purposeHtml, /Create Account to Save/);
    assert.match(purposeHtml, /Keep Using This Device/);
    assert.match(purposeHtml, /Download Instead/);
    assert.match(purposeHtml, /Copy Purpose Map/);
    assert.match(purposeHtml, /Export JSON/);
    assert.match(purposeHtml, /Import JSON/);
    assert.match(purposeHtml, /Start Over/);
    assert.match(purposeHtml, /href="\/purpose\/styles\.css"/);
    assert.match(purposeHtml, /src="\/purpose\/app\.js"/);

    assert.match(purposeCss, /#purposeScene/);
    assert.match(purposeCss, /@media \(max-width: 720px\)/);
    assert.match(purposeCss, /prefers-reduced-motion/);

    assert.match(purposeJs, /createPurposeStorage/);
    assert.match(purposeJs, /load\(\)/);
    assert.match(purposeJs, /save\(value\)/);
    assert.match(purposeJs, /clear\(\)/);
    assert.match(purposeJs, /export\(value\)/);
    assert.match(purposeJs, /import\(value\)/);
    assert.match(purposeJs, /migrateToAccount\(\)/);
    assert.match(purposeJs, /generatePurposeMap/);
    assert.match(purposeJs, /Current Season/);
    assert.match(purposeJs, /Pattern Showing Up/);
    assert.match(purposeJs, /Possible Purpose Direction/);
    assert.match(purposeJs, /Meaningful Project Seed/);
    assert.match(purposeJs, /This Week\\'s 3 Small Moves/);
    assert.match(purposeJs, /new THREE\.WebGLRenderer/);
    assert.match(purposeJs, /purpose\.3dvr\.tech/);

    assert.match(portalIndex, /href="\/purpose\/" class="app-card"/);
    assert.match(portalIndex, /<span class="app-card__title">Purpose<\/span>/);
    assert.match(portalIndex, /Organize your life\. Find your purpose\. Launch meaningful projects\./);
    assert.match(portalIndex, /<span class="app-card__cta">Open Purpose<\/span>/);

    const config = JSON.parse(vercelConfig);
    assert.ok(config.rewrites.some((rewrite) => (
      rewrite.source === '/'
      && rewrite.destination === '/purpose/index.html'
      && rewrite.has?.some((item) => item.type === 'host' && item.value === 'purpose.3dvr.tech')
    )));
  });
});
