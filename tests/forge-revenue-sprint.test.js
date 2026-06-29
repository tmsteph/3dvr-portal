import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const rootDir = new URL('../', import.meta.url);
const sprintPageUrl = new URL('ideas/forge-revenue-sprint.html', rootDir);
const ideasIndexUrl = new URL('ideas/index.html', rootDir);
const portalIndexUrl = new URL('index.html', rootDir);
const forgeIndexUrl = new URL('forge/index.html', rootDir);

async function fileExists(url) {
  try {
    await access(url, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

describe('Forge Revenue Sprint offer', () => {
  it('ships a buyable paid sprint page with Gun-backed intake', async () => {
    assert.equal(await fileExists(sprintPageUrl), true, 'forge revenue sprint page should exist');
    const html = await readFile(sprintPageUrl, 'utf8');

    assert.match(html, /Turn your Forge brief into a paid offer in 72 hours\./);
    assert.match(html, /\$300 Forge Revenue Sprint/);
    assert.match(html, /72-hour delivery/);
    assert.match(html, /Offer sharpened/);
    assert.match(html, /Offer page or checkout path/);
    assert.match(html, /First test message/);
    assert.match(html, /Reply tracker/);
    assert.match(html, /Start \$300 sprint/);
    assert.match(html, /redirect=%2Fbilling%2F%3Fplan%3Dcustom%26amount%3D300/);
    assert.match(html, /label%3DForge%2520Revenue%2520Sprint/);
    assert.match(html, /data-audience-key="forge-revenue-sprint"/);
    assert.match(html, /3dvr-audience-tests\/v1\/forge-revenue-sprint\/signups/);
    assert.match(html, /Not a fit if you need guaranteed income/);
  });

  it('links the sprint from Forge, Ideas Lab, and the portal app dock', async () => {
    const [ideas, portal, forge] = await Promise.all([
      readFile(ideasIndexUrl, 'utf8'),
      readFile(portalIndexUrl, 'utf8'),
      readFile(forgeIndexUrl, 'utf8')
    ]);

    assert.match(ideas, /\/ideas\/forge-revenue-sprint\.html/);
    assert.match(ideas, /A \$300 paid sprint that turns a Movement Brief into a buyable offer page/);
    assert.match(portal, /ideas\/forge-revenue-sprint\.html/);
    assert.match(portal, /Forge Sprint/);
    assert.match(portal, /buyable 72-hour offer page/);
    assert.match(forge, /href="\.\.\/ideas\/forge-revenue-sprint\.html"/);
  });
});
