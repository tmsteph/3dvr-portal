import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pageUrl = new URL('../sober-spark/index.html', import.meta.url);
const indexUrl = new URL('../index.html', import.meta.url);

describe('Sober Spark app', () => {
  it('ships the expanded sober stimulation modes and highlighted portal backlink', async () => {
    const html = await readFile(pageUrl, 'utf8');

    assert.match(html, /Back to 3DVR Portal/);
    assert.match(html, /class="portal-link"/);
    assert.match(html, /Weed tunnel/);
    assert.match(html, /Mushroom drift/);
    assert.match(html, /LSD geometry/);
    assert.match(html, /DMT flash/);
    assert.match(html, /Alcohol wobble/);
  });

  it('prevents text selection and captures primary pointer interaction on the canvas', async () => {
    const html = await readFile(pageUrl, 'utf8');

    assert.match(html, /user-select: none/);
    assert.match(html, /-webkit-user-select: none/);
    assert.match(html, /function captureField\(event\)/);
    assert.match(html, /canvas\.setPointerCapture/);
    assert.match(html, /canvas\.addEventListener\("pointerdown", captureField\)/);
    assert.match(html, /selectstart", \(event\) => event\.preventDefault\(\)/);
  });

  it('keeps Sober Spark discoverable from the portal home', async () => {
    const html = await readFile(indexUrl, 'utf8');

    assert.match(html, /href="sober-spark\/"/);
    assert.match(html, /<span class="app-card__title">Sober Spark<\/span>/);
  });
});
