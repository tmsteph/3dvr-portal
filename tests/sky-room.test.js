import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pageUrl = new URL('../sky-room/index.html', import.meta.url);
const indexUrl = new URL('../index.html', import.meta.url);

describe('sky room page', () => {
  it('ships an outdoor scene with live time and manual controls', async () => {
    const html = await readFile(pageUrl, 'utf8');
    assert.match(html, /Sky Room/);
    assert.match(html, /timeSlider/);
    assert.match(html, /Use live time/);
    assert.match(html, /Golden hour/);
  });
  it('links the page from the portal app dock', async () => {
    const html = await readFile(indexUrl, 'utf8');
    assert.match(html, /href="sky-room\/"/);
    assert.match(html, /<span class="app-card__title">Sky Room<\/span>/);
  });
});
