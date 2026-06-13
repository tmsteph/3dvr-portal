import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const baseDir = new URL('../projects/', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

describe('3DVR Project Launchpad', () => {
  it('ships a project nursery route with public node surfaces', async () => {
    const html = await readFile(new URL('index.html', baseDir), 'utf8');

    assert.equal(await fileExists(new URL('index.html', baseDir)), true);
    assert.equal(await fileExists(new URL('projects.css', baseDir)), true);
    assert.equal(await fileExists(new URL('app.js', baseDir)), true);
    assert.match(html, /3DVR Project Launchpad/);
    assert.match(html, /Where fledgling projects become real/);
    assert.match(html, /A home for projects before they are companies/);
    assert.match(html, /The social network for people building the future/);
    assert.match(html, /id="projectForm"/);
    assert.match(html, /id="projectBoard"/);
    assert.match(html, /id="projectList"/);
    assert.match(html, /id="updateForm"/);
    assert.match(html, /id="launchpadStats"/);
    assert.match(html, /Human-approved AI help/);
    assert.match(html, /project\.3dvr\.tech/);
    assert.match(html, /<script[^>]+src="https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/gun\.js"/);
    assert.match(html, /<script[^>]+src="\.{2}\/gun-init\.js"/);
    assert.match(html, /<script defer src="\.\/app\.js"><\/script>/);
  });

  it('backs project nodes, updates, and followers with Gun plus a local backup', async () => {
    const js = await readFile(new URL('app.js', baseDir), 'utf8');

    assert.match(js, /PROJECT_LAUNCHPAD_ROOT = 'projectLaunchpad'/);
    assert.match(js, /LOCAL_KEY = '3dvr-project-launchpad'/);
    assert.match(js, /gun\.get\('3dvr-portal'\)\.get\(PROJECT_LAUNCHPAD_ROOT\)/);
    assert.match(js, /root\?\.get\('nodes'\)\.get\(node\.slug\)\.put\(node\)/);
    assert.match(js, /root\?\.get\('updates'\)\.get\(update\.id\)\.put\(update\)/);
    assert.match(js, /root\?\.get\('followers'\)\.get\(slug\)\.put/);
    assert.match(js, /localStorage\.setItem\(LOCAL_KEY/);
    assert.match(js, /Regenerative Farm/);
    assert.match(js, /SD Day Traders/);
  });

  it('keeps Projects registered in the portal dock as the launchpad entry', async () => {
    const html = await readFile(new URL('../index.html', baseDir), 'utf8');

    assert.match(html, /href="projects\/index\.html"/);
    assert.match(html, /<span class="app-card__title">Projects<\/span>/);
    assert.match(html, /project nodes with profiles, updates, needs, offers, and support links/);
    assert.match(html, /data-app-keywords="[^"]*\blaunchpad\b[^"]*"/);
  });
});
