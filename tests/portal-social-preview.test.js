import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

describe('Portal social preview', () => {
  it('publishes a large Open Graph card for the homepage', async () => {
    const html = await readFile(new URL('index.html', root), 'utf8');
    const image = await stat(new URL('brand/portal-social-card.png', root));

    assert.ok(image.size > 100_000, 'social card should be a real image asset');
    assert.match(html, /<meta name="description" content="Tell the system what you want to do\.">/);
    assert.match(html, /<meta property="og:image" content="https:\/\/portal\.3dvr\.tech\/brand\/portal-social-card\.png">/);
    assert.match(html, /<meta property="og:image:width" content="1200">/);
    assert.match(html, /<meta property="og:image:height" content="630">/);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  });
});
