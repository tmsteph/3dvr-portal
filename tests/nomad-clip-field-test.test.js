import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const appDir = new URL('../nomad-clip-field-test/', import.meta.url);

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

describe('Nomad Clip field test app', () => {
  it('ships a subscriber hardware beta page', async () => {
    const indexUrl = new URL('index.html', appDir);
    const stylesUrl = new URL('styles.css', appDir);
    const readmeUrl = new URL('README.md', appDir);

    assert.equal(await fileExists(indexUrl), true, 'field test index should exist');
    assert.equal(await fileExists(stylesUrl), true, 'field test styles should exist');
    assert.equal(await fileExists(readmeUrl), true, 'field test README should exist');

    const html = await readFile(indexUrl, 'utf8');
    const readme = await readFile(readmeUrl, 'utf8');

    assert.match(html, /3DVR Nomad Clip Field Test \| 3DVR Portal/);
    assert.match(html, /Subscriber Hardware Beta/);
    assert.match(html, /grip, stand, tripod, extender/);
    assert.match(html, /Ulanzi MT85 Convertible Tripod/);
    assert.match(html, /R-Go Split Break Keyboard/);
    assert.match(html, /SmallRig Magic Arm/);
    assert.match(html, /Belkin USB-C Hub/);
    assert.match(html, /\$300-700/);
    assert.match(html, /discover geometry, posture, transitions/);
    assert.match(readme, /small field lab/);
  });

  it('registers the field test in the portal and README', async () => {
    const portalHtml = await readFile(new URL('../index.html', appDir), 'utf8');
    const readme = await readFile(new URL('../README.md', appDir), 'utf8');

    const holderIndex = portalHtml.indexOf('>Phone Holder System<');
    const fieldIndex = portalHtml.indexOf('>Nomad Clip Field Test<');
    const newsroomIndex = portalHtml.indexOf('>News Lounge<');

    assert.ok(fieldIndex !== -1, 'Nomad Clip Field Test app card should be listed on the portal');
    assert.ok(holderIndex !== -1, 'Phone Holder System app card should still be listed');
    assert.ok(newsroomIndex !== -1, 'News Lounge app card should still be listed');
    assert.ok(holderIndex < fieldIndex, 'Field Test should render after Phone Holder System');
    assert.ok(fieldIndex < newsroomIndex, 'Field Test should render before News Lounge');
    assert.match(readme, /\[Nomad Clip Field Test\]\(https:\/\/3dvr-portal\.vercel\.app\/nomad-clip-field-test\/\)/);
  });
});
