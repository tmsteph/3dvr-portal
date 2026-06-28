import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const appDir = new URL('../3dvr-girl/', import.meta.url);
const guideIds = ['feminine', 'masculine', 'robot', 'nature', 'cosmic', 'portal'];
const rescuedSceneAssets = [
  ['sunlit-crouch', 'sunlit-crouch.jpg'],
  ['pool-signal', 'pool-signal.jpg'],
  ['courtyard-meditation', 'courtyard-meditation.jpg'],
  ['courtyard-profile', 'courtyard-profile.jpg'],
  ['sunlit-curve', 'sunlit-curve.jpg'],
  ['wide-flow', 'wide-flow.jpg'],
  ['tree-prayer', 'tree-prayer.jpg'],
  ['blue-portal-stance', 'blue-portal-stance.jpg'],
];

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
    assert.match(html, /assets\/portal-arrival\.png/);
    assert.doesNotMatch(html, /portal-ring\.jpg/);
    assert.doesNotMatch(js, /portal-ring\.jpg/);
    assert.match(html, /studio-console/);
    assert.match(html, /hero__portal-brand/);
    assert.match(html, /heroGuideImage/);
    assert.match(html, /guidePreviewImage/);
    assert.match(html, /sceneRail/);
    assert.match(html, /Choose your guide/);
    assert.match(html, /Sign-in atmosphere/);
    assert.match(js, /const guides = \[/);
    assert.match(js, /id: 'pool-welcome'/);
    assert.match(js, /id: 'meditation-seat'/);
    assert.match(js, /id: 'blue-portal-stance'/);
    assert.match(js, /function createScenes\(\)/);
    assert.match(js, /GUIDE_STORAGE_KEY = '3dvrGirlGuide'/);
    assert.match(js, /refs\.heroGuideImage\.src = guide\.image/);
    assert.match(js, /setText\(refs\.guidePreviewTitle, guide\.headline\)/);
    assert.match(css, /body\[data-guide="robot"\]/);
    assert.match(css, /\.studio-console/);
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

  it('keeps the rescued gallery scenes backed by local optimized assets', async () => {
    const js = await readFile(new URL('app.js', appDir), 'utf8');

    for (const [sceneId, fileName] of rescuedSceneAssets) {
      assert.match(js, new RegExp(`id: '${sceneId}'`));
      assert.match(js, new RegExp(`assets/${fileName.replace('.', '\\.')}`));
      assert.equal(
        await fileExists(new URL(`assets/${fileName}`, appDir)),
        true,
        `${sceneId} image should exist`
      );
    }
  });
});
