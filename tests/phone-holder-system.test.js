import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const appDir = new URL('../phone-holder-system/', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

describe('phone holder system app', () => {
  it('ships the Nomad Clip concept page and styles', async () => {
    const indexUrl = new URL('index.html', appDir);
    const stylesUrl = new URL('styles.css', appDir);
    const readmeUrl = new URL('README.md', appDir);

    assert.equal(await fileExists(indexUrl), true, 'phone holder index should exist');
    assert.equal(await fileExists(stylesUrl), true, 'phone holder styles should exist');
    assert.equal(await fileExists(readmeUrl), true, 'phone holder README should exist');

    const html = await readFile(indexUrl, 'utf8');
    assert.match(html, /3DVR Phone Holder System \| 3DVR Portal/);
    assert.match(html, /Stop holding the phone\. Start docking it\./);
    assert.match(html, /The 3DVR Nomad Clip/);
    assert.match(html, /grip, stand, tripod, and extender/);
    assert.match(html, /id="roadmap"/);
    assert.match(html, /off-the-shelf base platform/);
    assert.match(html, /Joby TelePod Mobile/);
    assert.match(html, /Ulanzi MT70/);
    assert.match(html, /Target geometry/);
    assert.match(html, /Future workstation features/);
    assert.match(html, /joystick-style phone controls/);
    assert.match(html, /Control handle direction/);
    assert.match(html, /The phone becomes the brain/);
    assert.match(html, /id="modes"/);
    assert.match(html, /id="path"/);
    assert.match(html, /class="device-render"/);
    assert.match(html, /<link rel="stylesheet" href="\.\/styles\.css/);
  });

  it('registers the app in the portal dock and installable app list', async () => {
    const portalHtml = await readFile(new URL('../index.html', appDir), 'utf8');
    const readme = await readFile(new URL('../README.md', appDir), 'utf8');

    const workstationIndex = portalHtml.indexOf('>Pocket Workstation<');
    const holderIndex = portalHtml.indexOf('>Phone Holder System<');
    const newsroomIndex = portalHtml.indexOf('>News Lounge<');

    assert.ok(holderIndex !== -1, 'Phone Holder System app card should be listed on the portal');
    assert.ok(workstationIndex !== -1, 'Pocket Workstation app card should still be listed');
    assert.ok(newsroomIndex !== -1, 'News Lounge app card should still be listed');
    assert.ok(workstationIndex < holderIndex, 'Phone Holder System should render after Pocket Workstation');
    assert.ok(holderIndex < newsroomIndex, 'Phone Holder System should render before News Lounge');
    assert.match(portalHtml, /href="phone-holder-system\/index\.html"/);
    assert.match(readme, /\[Phone Holder System\]\(https:\/\/3dvr-portal\.vercel\.app\/phone-holder-system\/\)/);
  });
});
