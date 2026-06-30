import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const pageUrl = new URL('../friends-family/index.html', import.meta.url);
const portalUrl = new URL('../index.html', import.meta.url);

async function fileExists(url) {
  try {
    await access(url, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

test('friends and family pass is a shareable small offer page', async () => {
  assert.equal(await fileExists(pageUrl), true, 'friends-family/index.html should exist');

  const html = await readFile(pageUrl, 'utf8');

  assert.match(html, /Friends &amp; Family Pass \| 3DVR Portal/);
  assert.match(html, /Try 3DVR free\./);
  assert.match(html, /Sort one messy thought\. Pick one small next step\. No card\./);
  assert.match(html, /Support for \$5\/month/);
  assert.match(html, /href="\.\.\/life\/index\.html"/);
  assert.match(html, /href="\.\.\/sign-in\.html\?redirect=%2Fbilling%2F%3Fplan%3Dstarter"/);
  assert.match(html, /Use 3DVR to check in, sort what matters, and pick one small move for today\./);
  assert.match(html, /Support 3DVR and get a light monthly support path as the tools grow\./);
  assert.match(html, /Check in\./);
  assert.match(html, /Pick one step\./);
  assert.match(html, /Start free\. Only pay if you want to help keep it growing\./);
  assert.match(html, /Text this to one person/);
  assert.match(html, /Short, honest, and not awkward\./);
  assert.match(html, /data-copy-message/);
  assert.match(html, /data-invite-message/);
  assert.match(html, /I am testing a simple 3DVR flow/);
  assert.match(html, /https:\/\/portal\.3dvr\.tech\/friends-family\//);
  assert.doesNotMatch(html, /What supporters get/);
  assert.doesNotMatch(html, /The bigger direction/);
  assert.match(html, /navigator\.clipboard\.writeText\(message\)/);
});

test('friends and family page uses defensive mobile sizing', async () => {
  const html = await readFile(pageUrl, 'utf8');

  assert.match(html, /html,\s*body\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*100%;[\s\S]*?overflow-x:\s*hidden;/);
  assert.match(html, /\*,\s*\*::before,\s*\*::after\s*\{[\s\S]*?box-sizing:\s*border-box;/);
  assert.match(html, /\.shell\s*\{[\s\S]*?width:\s*min\(100%, 1080px\);[\s\S]*?max-width:\s*100%;/);
  assert.match(html, /@media \(max-width: 760px\)\s*\{[\s\S]*?\.offer-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr;/);
});

test('portal home links the pass in navigation, support lanes, app dock, and rooms', async () => {
  const html = await readFile(portalUrl, 'utf8');

  assert.match(html, /<nav class="top-buttons" id="landingQuickLinks"[\s\S]*?<a href="friends-family\/">Support<\/a>/);
  assert.match(
    html,
    /<a href="friends-family\/" class="shortcut-card">[\s\S]*?<span class="shortcut-card__title">Friends &amp; Family Pass<\/span>/
  );
  assert.match(html, /Get clear, try free, or help 3DVR for \$5\/month/);
  assert.match(
    html,
    /href="friends-family\/"[\s\S]*?class="app-card"[\s\S]*?<span class="app-card__title">Friends &amp; Family Pass<\/span>/
  );
  assert.match(html, /A free or \$5\/month path to get clear and take one step\./);
  assert.match(html, /data-app-keywords="[^"]*friends family supporter support five 5[^"]*"/);
  assert.match(html, /'Friends & Family Pass'/);
  assert.match(html, /money:\s*\[[\s\S]*?'Friends & Family Pass'/);
  assert.match(html, /community:\s*\[[\s\S]*?'Friends & Family Pass'/);
});
