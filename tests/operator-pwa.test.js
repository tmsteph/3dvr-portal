import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('operator/service-worker.js', root), 'utf8');
const offline = { offline: true };
function worker() {
  const handlers = {};
  const deleted = [];
  vm.runInNewContext(source, {
    URL,
    self: {
      location: { origin: 'https://portal.3dvr.tech' },
      addEventListener: (type, handler) => { handlers[type] = handler; },
      skipWaiting() {},
      clients: { claim: async () => {} }
    },
    fetch: async () => { throw new Error('offline'); },
    caches: {
      match: async () => offline,
      keys: async () => ['operator-offline-v0', 'operator-offline-v1', 'contacts-static-v4', 'portal-v1'],
      delete: async (key) => { deleted.push(key); }
    }
  });
  return { handlers, deleted };
}

test('Operator installs as a distinct app and references available public assets', async () => {
  const manifest = JSON.parse(await readFile(new URL('operator/operator.webmanifest', root), 'utf8'));
  assert.equal(manifest.id, '/operator/');
  assert.equal(manifest.start_url, '/operator/');
  assert.equal(manifest.scope, '/operator/');
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) await readFile(new URL(`.${icon.src}`, root));
  const html = await readFile(new URL('operator/index.html', root), 'utf8');
  assert.ok(html.includes('href="/operator/operator.webmanifest"'));
  assert.ok(html.includes('data-sw-url="/operator/service-worker.js" data-sw-scope="/operator/"'));
});

test('offline navigation returns the reconnect screen', async () => {
  const { handlers } = worker();
  let response;
  handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://portal.3dvr.tech/operator/?conversation=private' }, respondWith: (value) => { response = value; } });
  assert.equal(await response, offline);
});

test('worker leaves API, Gun, writes, external requests and embedded apps untouched', () => {
  const { handlers } = worker();
  for (const [path, method, mode] of [
    ['/api/operator', 'GET', 'cors'], ['/api/operator', 'POST', 'cors'],
    ['/gun', 'GET', 'cors'], ['/operator/app.js', 'GET', 'cors'],
    ['/contacts/', 'GET', 'navigate'], ['https://other.example/operator/', 'GET', 'navigate']
  ]) {
    handlers.fetch({ request: { url: new URL(path, 'https://portal.3dvr.tech').href, method, mode }, respondWith: () => assert.fail(`Intercepted ${path}`) });
  }
});

test('updates remove only obsolete Operator caches', async () => {
  const { handlers, deleted } = worker();
  let completion;
  handlers.activate({ waitUntil: (value) => { completion = value; } });
  await completion;
  assert.deepEqual(deleted, ['operator-offline-v0']);
});
