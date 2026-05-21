import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('portal logo branding', () => {
  it('brands the SVG app logo and boot text as 3dvr portal', async () => {
    const logo = await readFile(new URL('../brand/portal-logo.svg', import.meta.url), 'utf8');
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

    assert.match(logo, /3dvr portal logo/);
    assert.match(logo, />3dvr</);
    assert.match(logo, />portal</);
    assert.match(html, /window\.__APP_NAME__ = window\.__APP_NAME__ \|\| '3dvr-portal'/);
    assert.match(html, /<strong>3dvr portal<\/strong>/);
  });
});
