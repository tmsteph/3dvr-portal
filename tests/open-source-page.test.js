import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const appDir = new URL('../open-source/', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

describe('open source field guide', () => {
  it('ships the field guide page and styles', async () => {
    const indexUrl = new URL('index.html', appDir);
    const stylesUrl = new URL('styles.css', appDir);
    const readmeUrl = new URL('README.md', appDir);

    assert.equal(await fileExists(indexUrl), true, 'open source index should exist');
    assert.equal(await fileExists(stylesUrl), true, 'open source styles should exist');
    assert.equal(await fileExists(readmeUrl), true, 'open source README should exist');

    const html = await readFile(indexUrl, 'utf8');
    assert.match(html, /Open Source Field Guide \| 3DVR Portal/);
    assert.match(html, /Open source is shared infrastructure/);
    assert.match(html, /Debian, Linux, and browsers/);
    assert.match(html, /Krita/);
    assert.match(html, /Blender/);
    assert.match(html, /FreeCAD/);
    assert.match(html, /Ardour/);
    assert.match(html, /Open Source Ecology/);
    assert.match(html, /https:\/\/www\.opensourceecology\.org\//);
    assert.match(html, /<link rel="stylesheet" href="\.\/styles\.css/);
  });

  it('registers the app in the portal dock and installable app list', async () => {
    const portalHtml = await readFile(new URL('../index.html', appDir), 'utf8');
    const readme = await readFile(new URL('../README.md', appDir), 'utf8');

    const techIndex = portalHtml.indexOf('>Human-Scale Tech<');
    const openSourceIndex = portalHtml.indexOf('>Open Source<');
    const jobTrackerIndex = portalHtml.indexOf('>Job Tracker<');

    assert.ok(openSourceIndex !== -1, 'Open Source app card should be listed on the portal');
    assert.ok(techIndex !== -1, 'Human-Scale Tech app card should still be listed');
    assert.ok(jobTrackerIndex !== -1, 'Job Tracker app card should still be listed');
    assert.ok(techIndex < openSourceIndex, 'Open Source should render after Human-Scale Tech');
    assert.ok(openSourceIndex < jobTrackerIndex, 'Open Source should render before Job Tracker');
    assert.match(portalHtml, /href="open-source\/"/);
    assert.match(readme, /\[Open Source\]\(https:\/\/3dvr-portal\.vercel\.app\/open-source\/\)/);
  });
});
