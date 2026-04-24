import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('alive system app', () => {
  it('ships a Gun-backed Alive System portal app', async () => {
    const html = await readFile(new URL('../alive-system/index.html', import.meta.url), 'utf8');
    const js = await readFile(new URL('../alive-system/app.js', import.meta.url), 'utf8');
    const portalIndex = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

    assert.match(html, /3dvr Alive System \| Portal/);
    assert.match(html, /src="https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/gun\.js"/);
    assert.match(html, /src="\.\.\/gun-init\.js"/);
    assert.match(html, /src="\.\.\/score\.js"/);
    assert.match(html, /Morning activation/);
    assert.match(html, /I need dopamine right now/);
    assert.match(html, /Social aliveness/);
    assert.match(html, /Stored under <code>3dvr-portal\/alive-system<\/code> in Gun/);

    assert.match(js, /window\.ScoreSystem\.ensureGun/);
    assert.match(js, /ensureGuestIdentity/);
    assert.match(js, /gun\.get\('3dvr-portal'\)/);
    assert.match(js, /portalRoot\.get\('alive-system'\)/);
    assert.match(js, /aliveRoot\.get\('state'\)\.get\(author\)/);
    assert.match(js, /aliveRoot\.get\('entries'\)/);
    assert.match(js, /portal-alive-system-cache/);

    assert.match(portalIndex, /href="alive-system\/"/);
    assert.match(portalIndex, /<span class="app-card__title">Alive System<\/span>/);
    assert.match(readme, /\[Alive System\]\(https:\/\/3dvr-portal\.vercel\.app\/alive-system\/\)/);
    assert.match(readme, /gun\.get\('3dvr-portal'\)\.get\('alive-system'\)/);
  });
});
