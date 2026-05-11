import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const baseDir = new URL('../clipboard/', import.meta.url);

describe('clipboard app', () => {
  it('ships a signed-in, encrypted clipboard experience', async () => {
    const html = await readFile(new URL('index.html', baseDir), 'utf8');
    const app = await readFile(new URL('app.js', baseDir), 'utf8');
    const signIn = await readFile(new URL('../sign-in.html', import.meta.url), 'utf8');

    assert.match(html, /3DVR Clipboard/);
    assert.match(html, /data-auth-gate/);
    assert.match(html, /data-clipboard-workspace/);
    assert.match(html, /cdn\.jsdelivr\.net\/npm\/gun\/gun\.js/);
    assert.match(html, /cdn\.jsdelivr\.net\/npm\/gun\/sea\.js/);
    assert.match(app, /localStorage\.getItem\('signedIn'\) === 'true'/);
    assert.match(app, /SEA\.encrypt/);
    assert.match(app, /SEA\.decrypt/);
    assert.match(app, /portalClipboard/);
    assert.match(app, /Public and guest clipboards are disabled|showAuthGate/);
    assert.match(app, /redirect=\$\{encodeURIComponent\('\/clipboard\/'\)\}/);
    assert.match(signIn, /params\.get\('redirect'\) \|\| params\.get\('next'\)/);
  });
});
