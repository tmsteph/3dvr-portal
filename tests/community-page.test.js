import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const baseDir = new URL('../community/', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

describe('community system page', () => {
  it('ships the community workspace route with the MVP surfaces', async () => {
    const html = await readFile(new URL('index.html', baseDir), 'utf8');

    assert.equal(await fileExists(new URL('index.html', baseDir)), true);
    assert.match(html, /3DVR Community System/);
    assert.match(html, /id="profileForm"/);
    assert.match(html, /id="circleForm"/);
    assert.match(html, /id="checkinForm"/);
    assert.match(html, /id="threadForm"/);
    assert.match(html, /id="communityFeed"/);
    assert.match(html, /Small Circles/);
    assert.match(html, /Public Builder Layer/);
    assert.match(html, /<script[^>]+src="https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/gun\.js"/);
    assert.match(html, /<script[^>]+src="\.{2}\/gun-init\.js"/);
    assert.match(html, /<script[^>]+src="\.\/app\.js"/);
  });

  it('uses explicit Gun nodes for profiles, circles, check-ins, and threads', async () => {
    const js = await readFile(new URL('app.js', baseDir), 'utf8');

    assert.match(js, /COMMUNITY_ROOT = 'communitySystem'/);
    assert.match(js, /gun\.get\('3dvr-portal'\)\.get\(COMMUNITY_ROOT\)/);
    assert.match(js, /get\('profiles'\)/);
    assert.match(js, /get\('circles'\)/);
    assert.match(js, /get\('checkins'\)/);
    assert.match(js, /get\('threads'\)/);
    assert.match(js, /sizeTarget: '3-6'/);
  });

  it('registers Community in the portal launcher near Cell', async () => {
    const html = await readFile(new URL('../index.html', baseDir), 'utf8');
    const cellIndex = html.indexOf('>Cell<');
    const communityIndex = html.indexOf('>Community<');
    const lifeIndex = html.indexOf('>Life<');

    assert.ok(cellIndex !== -1, 'Cell app card should still be present');
    assert.ok(communityIndex !== -1, 'Community app card should be listed on the portal');
    assert.ok(lifeIndex !== -1, 'Life app card should still be present');
    assert.ok(cellIndex < communityIndex, 'Community should appear after Cell');
    assert.ok(communityIndex < lifeIndex, 'Community should appear before Life');
    assert.match(html, /href="community\/(?:index\.html)?"/);
  });
});
