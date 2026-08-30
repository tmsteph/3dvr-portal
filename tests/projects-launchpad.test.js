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
    assert.match(js, /LAUNCH_ROOM_PREFILL_KEY = '3dvr\.launch-room\.project-prefill\.v1'/);
    assert.match(js, /WEB_BUILDER_PREFILL_KEY = 'web-builder-prefill-request'/);
    assert.match(js, /GROWTH_OPERATOR_PROJECT_BRIEF_KEY = '3dvr\.growthOperator\.project-lead-brief\.v1'/);
    assert.match(js, /findPeople\.textContent = 'Find people'/);
    assert.match(js, /sessionStorage\.setItem\(GROWTH_OPERATOR_PROJECT_BRIEF_KEY/);
    assert.match(js, /window\.location\.href = '\.\.\/growth-operator\/\?from=project'/);
    assert.match(js, /buildPage\.textContent = 'Build page'/);
    assert.match(js, /sessionStorage\.setItem\(WEB_BUILDER_PREFILL_KEY/);
    assert.match(js, /window\.location\.href = '\.\.\/web-builder-app\/'/);
    assert.match(js, /Page draft prepared\. Opening Web Builder for review/);
    assert.match(js, /new URLSearchParams\(window\.location\.search\)/);
    assert.match(js, /sessionStorage\.getItem\(LAUNCH_ROOM_PREFILL_KEY\)/);
    assert.match(js, /sessionStorage\.removeItem\(LAUNCH_ROOM_PREFILL_KEY\)/);
    assert.match(js, /Project draft prefilled from Launch Room\. Review it, then save when ready\./);
    assert.match(js, /applyLaunchRoomPrefill\(\)/);
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

    assert.match(html, /href="\/projects\/"/);
    assert.match(html, /<strong>Projects<\/strong>/);
    assert.match(html, /Active work and next steps\./);
    assert.match(html, /data-app="[^"]*\bprojects\b[^"]*"/);
  });
});
