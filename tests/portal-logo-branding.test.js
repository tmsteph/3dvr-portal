import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('portal logo branding', () => {
  it('brands the SVG app logo and boot text as 3dvr portal', async () => {
    const logo = await readFile(new URL('../brand/portal-logo.svg', import.meta.url), 'utf8');
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    const css = await readFile(new URL('../index-style.css', import.meta.url), 'utf8');
    const swirlScript = await readFile(new URL('../portal-swirl-logo.js', import.meta.url), 'utf8');

    assert.match(logo, /3dvr portal logo/);
    assert.match(logo, />3dvr</);
    assert.match(logo, />portal</);
    assert.match(html, /window\.__APP_NAME__ = window\.__APP_NAME__ \|\| '3dvr-portal'/);
    assert.match(html, /<strong>3dvr portal<\/strong>/);
    assert.match(html, /app-boot-enabled/);
    assert.match(html, /display-mode: standalone/);
    assert.match(html, /document\.referrer\.startsWith\('android-app:\/\/'\)/);
    assert.match(css, /\.app-boot-enabled \.app-boot/);
    assert.match(html, /portal-swirl-logo\.js/);
    assert.match(html, /data-portal-swirl-logo/);
    assert.match(html, /3dvr portal 3D swirl logo/);
    assert.match(css, /\.portal-swirl-logo/);
    assert.match(swirlScript, /THREE_CDN_URL/);
    assert.match(swirlScript, /three\.js\/r128\/three\.min\.js/);
    assert.match(swirlScript, /CylinderGeometry/);
    assert.match(swirlScript, /TorusGeometry/);
    assert.match(swirlScript, /CanvasTexture/);
    assert.match(swirlScript, /BASE_FACE_SPIN/);
    assert.match(swirlScript, /extraFaceSpin/);
    assert.match(swirlScript, /makeTextTexture/);
    assert.match(swirlScript, /texture\.rotation = state\.faceSpin/);
    assert.match(swirlScript, /const rotationY = state\.currentY \+ state\.flipY/);
    assert.match(swirlScript, /const rotationZ = state\.currentZ/);
    assert.match(swirlScript, /context\.rotate\(\(arm \/ 7\) \* TAU \+ state\.faceSpin \* 0\.7\)/);
    assert.doesNotMatch(swirlScript, /const rotationZ = state\.faceSpin/);
    assert.doesNotMatch(swirlScript, /state\.token\.rotation\.set\(rotationX, rotationY, state\.faceSpin/);
    assert.match(swirlScript, /flipVelocityX/);
    assert.match(swirlScript, /flipVelocityY/);
    assert.match(swirlScript, /state\.targetY = clamp\(\(point\.x - centerX\) \/ centerX/);
    assert.match(swirlScript, /state\.flipVelocityY \+= horizontal/);
    assert.match(swirlScript, /window\.__portalSwirlLogo/);
  });
});
