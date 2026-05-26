import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const baseDir = new URL('../community-farming-network/', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

describe('Community Farming Network', () => {
  it('ships a portal project page for neighborhood food and labor sharing', async () => {
    const html = await readFile(new URL('index.html', baseDir), 'utf8');

    assert.equal(await fileExists(new URL('index.html', baseDir)), true);
    assert.equal(await fileExists(new URL('styles.css', baseDir)), true);
    assert.equal(await fileExists(new URL('app.js', baseDir)), true);
    assert.match(html, /Community Farming Network/);
    assert.match(html, /grow and share food and labor/i);
    assert.match(html, /id="shareForm"/);
    assert.match(html, /id="entryType"/);
    assert.match(html, /id="entryNeighborhood"/);
    assert.match(html, /id="networkBoard"/);
    assert.match(html, /Harvest share/);
    assert.match(html, /Growing space/);
    assert.match(html, /Labor request/);
    assert.match(html, /Tool or resource/);
    assert.match(html, /<script[^>]+src="https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/gun\.js"/);
    assert.match(html, /<script[^>]+src="\.{2}\/gun-init\.js"/);
  });

  it('backs the first version with Gun plus a local browser backup', async () => {
    const js = await readFile(new URL('app.js', baseDir), 'utf8');

    assert.match(js, /FARMING_ROOT = 'communityFarmingNetwork'/);
    assert.match(js, /LOCAL_KEY = '3dvr-community-farming-network'/);
    assert.match(js, /gun\.get\('3dvr-portal'\)\.get\(FARMING_ROOT\)/);
    assert.match(js, /root\?\.get\('entries'\)\.get\(entry\.id\)\.put\(entry\)/);
    assert.match(js, /localStorage\.setItem\(LOCAL_KEY/);
    assert.match(js, /data-filter/);
  });

  it('registers the project in the portal dock near Community', async () => {
    const html = await readFile(new URL('../index.html', baseDir), 'utf8');
    const communityIndex = html.indexOf('>Community<');
    const farmingIndex = html.indexOf('>Community Farming<');
    const lifeIndex = html.indexOf('>Life<');

    assert.ok(communityIndex !== -1, 'Community app card should still be listed');
    assert.ok(farmingIndex !== -1, 'Community Farming app card should be listed');
    assert.ok(lifeIndex !== -1, 'Life app card should still be listed');
    assert.ok(communityIndex < farmingIndex, 'Community Farming should render after Community');
    assert.ok(farmingIndex < lifeIndex, 'Community Farming should render before Life');
    assert.match(html, /href="community-farming-network\/"/);
  });
});
