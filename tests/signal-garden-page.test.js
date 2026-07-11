import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('Signal Garden portal app', () => {
  it('ships the game page, script, and canvas surface', async () => {
    const html = await readFile(new URL('../signal-garden/index.html', import.meta.url), 'utf8');
    assert.match(html, /<title>Signal Garden - 3DVR Portal<\/title>/);
    assert.match(html, /id="gardenCanvas"/);
    assert.match(html, /type="module" src="app\.js"/);
    assert.match(html, /data-start>Start<\/button>/);
  });

  it('is linked from the game hub and homepage app dock', async () => {
    const [gamesHub, homepage] = await Promise.all([
      readFile(new URL('../games.html', import.meta.url), 'utf8'),
      readFile(new URL('../index.html', import.meta.url), 'utf8'),
    ]);

    assert.match(gamesHub, /href="signal-garden\/"/);
    assert.match(gamesHub, /Signal Garden/);
    assert.match(homepage, /href="signal-garden\/"/);
    assert.match(homepage, /data-app-keywords="signal garden game calm arcade constellation spark focus play"/);
  });

  it('keeps the top navigation above the start overlay', async () => {
    const css = await readFile(new URL('../signal-garden/styles.css', import.meta.url), 'utf8');
    const navZIndex = Number(css.match(/\.signal-nav \{[\s\S]*?z-index: (\d+);/)?.[1]);
    const overlayZIndex = Number(css.match(/\.signal-overlay \{[\s\S]*?z-index: (\d+);/)?.[1]);

    assert.ok(navZIndex > overlayZIndex, 'Signal Garden nav should stay clickable above the overlay');
  });
});
