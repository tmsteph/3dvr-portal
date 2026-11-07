import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('3DVR Girl installs as its own app, separate from the portal and Helm', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('app-manifests/3dvr-girl.webmanifest', root), 'utf8')
  );
  assert.equal(manifest.id, '/3dvr-girl/');
  assert.equal(manifest.name, '3DVR Girl');
  assert.equal(manifest.short_name, '3DVR Girl');
  assert.equal(manifest.start_url, '/3dvr-girl/?source=pwa');
  assert.equal(manifest.scope, '/3dvr-girl/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#0b0f0d');
  assert.equal(manifest.background_color, '#0b0f0d');
  assert.deepEqual(
    manifest.icons.map((icon) => icon.sizes),
    ['192x192', '512x512', '512x512']
  );
  assert.equal(manifest.icons[2].purpose, 'maskable');
  for (const icon of manifest.icons) await readFile(new URL(`.${icon.src}`, root));

  const html = await readFile(new URL('3dvr-girl/index.html', root), 'utf8');
  assert.ok(html.includes('href="/app-manifests/3dvr-girl.webmanifest"'));
  assert.ok(html.includes('href="/icons/3dvr-girl-192.png"'));
  assert.ok(html.includes('src="/pwa-install.js"'));
  assert.ok(!html.includes('href="/manifest.webmanifest"'));
  assert.ok(!html.includes('operator.webmanifest'));

  const portalManifest = JSON.parse(
    await readFile(new URL('manifest.webmanifest', root), 'utf8')
  );
  assert.notEqual(portalManifest.id, manifest.id);
  assert.notEqual(portalManifest.name, manifest.name);
});
