import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const rootDir = new URL('../', import.meta.url);
const sprintPageUrl = new URL('ideas/client-onboarding-sprint.html', rootDir);
const ideasIndexUrl = new URL('ideas/index.html', rootDir);
const portalIndexUrl = new URL('index.html', rootDir);

async function fileExists(url) {
  try {
    await access(url, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

describe('Client Onboarding Sprint offer', () => {
  it('ships a buyable paid sprint page with Gun-backed intake', async () => {
    assert.equal(await fileExists(sprintPageUrl), true, 'client onboarding sprint page should exist');
    const html = await readFile(sprintPageUrl, 'utf8');

    assert.match(html, /Turn a yes into a clean client start\./);
    assert.match(html, /freelancers and small agencies/);
    assert.match(html, /\$300 setup sprint/);
    assert.match(html, /72-hour delivery/);
    assert.match(html, /Client start map/);
    assert.match(html, /Intake and checklist/);
    assert.match(html, /Follow-up sequence/);
    assert.match(html, /Decision rule/);
    assert.match(html, /Start \$300 sprint/);
    assert.match(html, /redirect=%2Fbilling%2F%3Fplan%3Dcustom%26amount%3D300/);
    assert.match(html, /label%3DClient%2520Onboarding%2520Sprint/);
    assert.match(html, /data-audience-key="client-onboarding-sprint"/);
    assert.match(html, /3dvr-audience-tests\/v1\/client-onboarding-sprint\/signups/);
  });

  it('links the sprint from the Ideas Lab and portal app dock', async () => {
    const [ideas, portal] = await Promise.all([
      readFile(ideasIndexUrl, 'utf8'),
      readFile(portalIndexUrl, 'utf8')
    ]);

    assert.match(ideas, /\/ideas\/client-onboarding-sprint\.html/);
    assert.match(ideas, /A \$300 paid sprint that turns a yes into intake, checklist, and first-week follow-up\./);
    assert.match(portal, /ideas\/client-onboarding-sprint\.html/);
    assert.match(portal, /Client Onboarding Sprint/);
  });
});
