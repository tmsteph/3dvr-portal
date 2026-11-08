import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('helm/service-worker.js', root), 'utf8');
const offline = { offline: true };
function worker() {
  const handlers = {};
  const deleted = [];
  vm.runInNewContext(source, {
    URL,
    self: {
      location: { origin: 'https://helm.3dvr.tech' },
      addEventListener: (type, handler) => { handlers[type] = handler; },
      skipWaiting() {},
      clients: { claim: async () => {} }
    },
    fetch: async () => { throw new Error('offline'); },
    caches: {
      match: async () => offline,
      keys: async () => ['helm-offline-v0', 'helm-offline-v1', 'operator-offline-v1', 'portal-v1'],
      delete: async (key) => { deleted.push(key); }
    }
  });
  return { handlers, deleted };
}

test('Helm installs as its own app, separate from Operator and the portal', async () => {
  const manifest = JSON.parse(await readFile(new URL('helm/helm.webmanifest', root), 'utf8'));
  assert.equal(manifest.id, '/helm/');
  assert.equal(manifest.name, 'Helm');
  assert.equal(manifest.short_name, 'Helm');
  assert.equal(manifest.start_url, '/helm/');
  assert.equal(manifest.scope, '/helm/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#101819');
  assert.equal(manifest.background_color, '#101819');
  assert.deepEqual(
    manifest.icons.map((icon) => icon.src),
    ['/icons/helm-192.png', '/icons/helm-512.png', '/icons/helm-maskable-512.png']
  );
  assert.equal(manifest.icons[2].purpose, 'maskable');
  for (const icon of manifest.icons) await readFile(new URL(`.${icon.src}`, root));

  const html = await readFile(new URL('helm/index.html', root), 'utf8');
  assert.ok(html.includes('href="/helm/helm.webmanifest"'));
  assert.ok(html.includes('href="/icons/helm-192.png"'));
  assert.ok(html.includes('>Install Helm</button>'));
  assert.ok(html.includes('data-install-banner'));
  assert.ok(html.includes('data-install-button'));
  assert.ok(html.includes('src="/pwa-install.js?v=2026-11-07-quiet1"'));
  assert.ok(html.includes('data-sw-url="/helm/service-worker.js"'));
  assert.ok(html.includes('data-sw-scope="/helm/"'));
  assert.ok(!html.includes('helm-install-help'));
  assert.ok(!html.includes('<dialog'));
  assert.ok(!html.includes('operator.webmanifest'));
  await assert.rejects(readFile(new URL('helm/install.js', root), 'utf8'));

  const operatorManifest = JSON.parse(
    await readFile(new URL('operator/operator.webmanifest', root), 'utf8')
  );
  assert.equal(operatorManifest.name, '3DVR Operator');
  assert.notEqual(operatorManifest.id, manifest.id);
  const portalManifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'));
  assert.notEqual(portalManifest.id, manifest.id);
  assert.notEqual(portalManifest.name, manifest.name);
});

test('Helm offline navigation returns the reconnect screen', async () => {
  const { handlers } = worker();
  let response;
  handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://helm.3dvr.tech/helm/' }, respondWith: (value) => { response = value; } });
  assert.equal(await response, offline);
});

test('Helm worker leaves API, Gun, writes and other apps untouched', () => {
  const { handlers } = worker();
  for (const [path, method, mode] of [
    ['/api/openclaw', 'POST', 'cors'], ['/api/openclaw', 'GET', 'cors'],
    ['/gun', 'GET', 'cors'], ['/helm/app.js', 'GET', 'cors'],
    ['/operator/', 'GET', 'navigate'], ['https://other.example/helm/', 'GET', 'navigate']
  ]) {
    handlers.fetch({ request: { url: new URL(path, 'https://helm.3dvr.tech').href, method, mode }, respondWith: () => assert.fail(`Intercepted ${path}`) });
  }
});

test('Helm updates remove only obsolete Helm caches', async () => {
  const { handlers, deleted } = worker();
  let completion;
  handlers.activate({ waitUntil: (value) => { completion = value; } });
  await completion;
  assert.deepEqual(deleted, ['helm-offline-v0']);
});
