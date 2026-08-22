import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('portal logo branding', () => {
  it('keeps the 3dvr portal identity without loading the legacy animated hero', async () => {
    const logo = await readFile(new URL('../brand/portal-logo.svg', import.meta.url), 'utf8');
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

    assert.match(logo, /3dvr portal logo/);
    assert.match(logo, />3dvr</);
    assert.match(logo, />portal</);

    assert.match(html, /<title>3DVR Portal<\/title>/);
    assert.match(html, /class="brand"/);
    assert.match(html, /src="\/brand\/portal-logo\.svg"/);
    assert.match(html, /<span>3DVR<\/span>/);
    assert.match(html, /<p class="eyebrow">3DVR Portal<\/p>/);
    assert.match(html, /<h1 id="home-title">What do you want to do\?<\/h1>/);
    assert.match(html, /Ask your Operator…/);

    assert.doesNotMatch(html, /portal-swirl-logo\.js/);
    assert.doesNotMatch(html, /data-portal-swirl-logo/);
    assert.doesNotMatch(html, /class="app-boot"/);
  });
});
