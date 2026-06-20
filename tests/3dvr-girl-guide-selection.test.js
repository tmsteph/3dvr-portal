import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const appDir = new URL('../3dvr-girl/', import.meta.url);
const guideIds = ['feminine', 'masculine', 'robot', 'nature', 'cosmic', 'portal'];

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}

describe('3DVR Girl guide selection', () => {
  it('adds a tasteful guide picker and branded portal background', async () => {
    const html = await readFile(new URL('index.html', appDir), 'utf8');
    const js = await readFile(new URL('app.js', appDir), 'utf8');
    const css = await readFile(new URL('styles.css', appDir), 'utf8');

    assert.match(html, /data-guide="feminine"/);
    assert.match(html, /hero__portal-brand/);
    assert.match(html, /heroGuideImage/);
    assert.match(html, /guidePreviewImage/);
    assert.match(html, /Choose your guide/);
    assert.match(html, /Sign-in atmosphere/);
    assert.match(js, /const guides = \[/);
    assert.match(js, /GUIDE_STORAGE_KEY = '3dvrGirlGuide'/);
    assert.match(js, /heroGuideImage\.src = guide\.image/);
    assert.match(js, /guidePreviewTitle\.textContent = guide\.headline/);
    assert.match(css, /body\[data-guide="robot"\]/);
    assert.match(css, /\.hero__guide-image/);
    assert.match(css, /\.guide-preview/);
    assert.match(css, /\.guide-grid/);
  });

  it('ships local guide portraits for each selectable experience', async () => {
    const js = await readFile(new URL('app.js', appDir), 'utf8');

    for (const guideId of guideIds) {
      assert.match(js, new RegExp(`id: '${guideId}'`));
      assert.equal(
        await fileExists(new URL(`assets/guides/${guideId}.png`, appDir)),
        true,
        `${guideId} guide portrait should exist`
      );
    }
  });
});
