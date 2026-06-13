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

describe('3DVR Seed Deck', () => {
  it('ships a project nursery route with public node surfaces', async () => {
    const html = await readFile(new URL('index.html', baseDir), 'utf8');

    assert.equal(await fileExists(new URL('index.html', baseDir)), true);
    assert.equal(await fileExists(new URL('projects.css', baseDir)), true);
    assert.equal(await fileExists(new URL('app.js', baseDir)), true);
    assert.match(html, /3DVR Seed Deck/);
    assert.match(html, /Start before you're ready/);
    assert.match(html, /Not a social network\. Not a website builder\. Not a CRM\. A seed bed/);
    assert.match(html, /3DVR Seed Deck helps unfinished ideas become real/);
    assert.match(html, /Community garden/);
    assert.match(html, /Regenerative living/);
    assert.match(html, /Open-source tools/);
    assert.match(html, /Spiritual technology/);
    assert.match(html, /id="projectForm"/);
    assert.match(html, /id="projectBoard"/);
    assert.match(html, /id="projectList"/);
    assert.match(html, /id="updateForm"/);
    assert.match(html, /id="launchpadStats"/);
    assert.match(html, /Human-approved AI help/);
    assert.match(html, /summarize interest/);
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
    assert.match(html, /Open Seed Deck to plant ideas with pages, updates, needs, offers, and support links/);
    assert.match(html, /data-app-keywords="[^"]*\bseed deck\b[^"]*"/);
    assert.match(html, /data-app-keywords="[^"]*\blaunchpad\b[^"]*"/);
  });
});
