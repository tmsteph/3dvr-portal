import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pageUrl = new URL('../attention-shield/index.html', import.meta.url);
const indexUrl = new URL('../index.html', import.meta.url);

describe('attention shield page', () => {
  it('ships the concept page with MVP, modes, and local-first framing', async () => {
    const html = await readFile(pageUrl, 'utf8');

    assert.match(html, /3DVR Attention Shield/);
    assert.match(html, /Local-first AI protection layer/);
    assert.match(html, /Human Mode/);
    assert.match(html, /Android listener/);
    assert.match(html, /Portal dashboard/);
    assert.match(html, /AI protection layer/);
  });

  it('links the page from the portal app dock', async () => {
    const html = await readFile(indexUrl, 'utf8');

    assert.match(html, /href="attention-shield\/"/);
    assert.match(html, /<span class="app-card__title">Attention Shield<\/span>/);
    assert.match(html, /filters phone notifications/);
  });
});
