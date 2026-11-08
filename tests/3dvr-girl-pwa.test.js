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
  assert.ok(html.includes('src="/pwa-install.js?v=2026-11-07-quiet1"'));
  assert.ok(!html.includes('href="/manifest.webmanifest"'));
  assert.ok(!html.includes('operator.webmanifest'));

  const portalManifest = JSON.parse(
    await readFile(new URL('manifest.webmanifest', root), 'utf8')
  );
  assert.notEqual(portalManifest.id, manifest.id);
  assert.notEqual(portalManifest.name, manifest.name);
});

import vm from 'node:vm';

const girlWorkerSource = await readFile(new URL('3dvr-girl/service-worker.js', root), 'utf8');
const offline = { offline: true };
function girlWorker() {
  const handlers = {};
  const deleted = [];
  vm.runInNewContext(girlWorkerSource, {
    URL,
    self: {
      location: { origin: 'https://ladies.3dvr.tech' },
      addEventListener: (type, handler) => { handlers[type] = handler; },
      skipWaiting() {},
      clients: { claim: async () => {} }
    },
    fetch: async () => { throw new Error('offline'); },
    caches: {
      match: async () => offline,
      keys: async () => ['girl-offline-v0', 'girl-offline-v1', 'helm-offline-v1', 'portal-v1'],
      delete: async (key) => { deleted.push(key); }
    }
  });
  return { handlers, deleted };
}

test('On ladies.3dvr.tech the app uses her dedicated manifest, worker and install button', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('3dvr-girl/girl.webmanifest', root), 'utf8')
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
    manifest.icons.map((icon) => icon.src),
    ['/icons/3dvr-girl-192.png', '/icons/3dvr-girl-512.png', '/icons/3dvr-girl-maskable-512.png']
  );
  assert.equal(manifest.icons[2].purpose, 'maskable');

  for (const page of ['3dvr-girl/index.html', '3dvr-girl/character/index.html']) {
    const html = await readFile(new URL(page, root), 'utf8');
    assert.ok(html.includes("window.location.hostname === 'ladies.3dvr.tech'"), page);
    assert.ok(html.includes('window.__pwaInstallConfig'), page);
    assert.ok(html.includes("swUrl: '/3dvr-girl/service-worker.js'"), page);
    assert.ok(html.includes("'/3dvr-girl/girl.webmanifest'"), page);
    assert.ok(html.includes('src="/pwa-install.js?v=2026-11-07-quiet1"'), page);
    assert.ok(html.includes('data-install-banner'), page);
    assert.ok(html.includes('data-install-button'), page);
  }
});

test('Girl offline navigation returns the reconnect screen', async () => {
  const { handlers } = girlWorker();
  let response;
  handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://ladies.3dvr.tech/3dvr-girl/' }, respondWith: (value) => { response = value; } });
  assert.equal(await response, offline);
});

test('Girl worker leaves API, Gun, writes and other apps untouched', () => {
  const { handlers } = girlWorker();
  for (const [path, method, mode] of [
    ['/api/openclaw', 'POST', 'cors'], ['/api/openclaw', 'GET', 'cors'],
    ['/gun', 'GET', 'cors'], ['/3dvr-girl/app.js', 'GET', 'cors'],
    ['/helm/', 'GET', 'navigate'], ['https://other.example/3dvr-girl/', 'GET', 'navigate']
  ]) {
    handlers.fetch({ request: { url: new URL(path, 'https://ladies.3dvr.tech').href, method, mode }, respondWith: () => assert.fail(`Intercepted ${path}`) });
  }
});

test('Girl updates remove only obsolete Girl caches', async () => {
  const { handlers, deleted } = girlWorker();
  let completion;
  handlers.activate({ waitUntil: (value) => { completion = value; } });
  await completion;
  assert.deepEqual(deleted, ['girl-offline-v0']);
});
