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
  it('ships the evolved 3DVR Phone Dock concept and styles', async () => {
    const indexUrl = new URL('index.html', appDir);
    const stylesUrl = new URL('styles.css', appDir);
    const readmeUrl = new URL('README.md', appDir);

    assert.equal(await fileExists(indexUrl), true, 'phone holder index should exist');
    assert.equal(await fileExists(stylesUrl), true, 'phone holder styles should exist');
    assert.equal(await fileExists(readmeUrl), true, 'phone holder README should exist');

    const html = await readFile(indexUrl, 'utf8');
    assert.match(html, /3DVR Phone Dock \| 3DVR Portal/);
    assert.match(html, /Your phone\. Real controls\./);
    assert.match(html, /Nomad Clip evolution/);
    assert.match(html, /id="orientation"/);
    assert.match(html, /Portrait \+ software keyboard/);
    assert.match(html, /Landscape \+ physical keyboard/);
    assert.match(html, /Soft keyboard present/);
    assert.match(html, /Physical keyboard present/);
    assert.match(html, /90° rotation/);
    assert.match(html, /id="controls"/);
    assert.match(html, /Trackpoint \/ trackball \/ touch/);
    assert.match(html, /USB-C expansion/);
    assert.match(html, /id="modes"/);
    assert.match(html, /id="prototype"/);
    assert.match(html, /Mechanical first/);
    assert.match(html, /The Nomad Clip still matters/);
    assert.match(html, /id="path"/);
    assert.match(html, /Open hardware release/);
    assert.match(html, /class="dock-demo"/);
    assert.match(html, /class="keyboard-toggle"/);
    assert.match(html, /<link rel="stylesheet" href="\.\/styles\.css/);
  });

  it('documents the existing phone-holder-system route as the 3DVR Phone Dock', async () => {
    const readme = await readFile(new URL('README.md', appDir), 'utf8');

    assert.match(readme, /\/phone-holder-system\//);
    assert.match(readme, /3DVR Phone Dock/);
    assert.match(readme, /Software keyboard visible/);
    assert.match(readme, /Physical keyboard available/);
    assert.match(readme, /rotate 90°/);
    assert.match(readme, /Nomad Clip/);
  });
});
