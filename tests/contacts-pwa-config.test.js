import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const readProjectFile = async (path) =>
  readFile(resolve(projectRoot, path), 'utf8');

const findHeaderValue = (headers, key) => {
  const match = headers.find((header) => header.key === key);
  return match ? match.value : null;
};

describe('contacts PWA configuration', () => {
  it('keeps portal and contacts manifest identities distinct', async () => {
    const rootManifestText = await readProjectFile('manifest.webmanifest');
    const rootManifest = JSON.parse(rootManifestText);
    const contactsManifestText = await readProjectFile('app-manifests/contacts.webmanifest');
    const contactsManifest = JSON.parse(contactsManifestText);

    assert.equal(rootManifest.id, '/');
    assert.equal(contactsManifest.id, '/contacts/');
    assert.notEqual(rootManifest.id, contactsManifest.id);
  });

  it('uses a contacts-scoped webmanifest identity', async () => {
    const manifestText = await readProjectFile('app-manifests/contacts.webmanifest');
    const manifest = JSON.parse(manifestText);

    assert.equal(manifest.id, '/contacts/');
    assert.equal(manifest.scope, '/contacts/');
    assert.match(manifest.start_url, /^\/contacts\//);
    assert.equal(manifest.display, 'standalone');
  });

  it('registers the contacts service worker with contacts scope', async () => {
    const html = await readProjectFile('contacts/index.html');

    assert.match(html, /src="\/pwa-install\.js"/);
    assert.match(html, /data-sw-url="\/contacts\/service-worker\.js"/);
    assert.match(html, /data-sw-scope="\/contacts\/"/);
  });

  it('ships an app-specific contacts service worker', async () => {
    const workerSource = await readProjectFile('contacts/service-worker.js');

    assert.match(workerSource, /contacts-static-/);
    assert.match(workerSource, /contacts-html-/);
    assert.match(workerSource, /\/contacts\/index\.html/);
    assert.match(workerSource, /self\.addEventListener\('fetch'/);
  });

  it('marks install-critical files as no-cache in Vercel headers', async () => {
    const vercelText = await readProjectFile('vercel.json');
    const config = JSON.parse(vercelText);
    const rules = Array.isArray(config.headers) ? config.headers : [];

    const staticAssetsIndex = rules.findIndex(
      (rule) => rule.source === '/(.*)\\.(css|js|png|jpg|jpeg|gif|svg|webp|woff2?)'
    );
    const pwaInstallIndex = rules.findIndex((rule) => rule.source === '/pwa-install.js');
    const rootWorkerIndex = rules.findIndex((rule) => rule.source === '/service-worker.js');
    const contactsWorkerIndex = rules.findIndex(
      (rule) => rule.source === '/contacts/service-worker.js'
    );

    assert.notEqual(staticAssetsIndex, -1);
    assert.notEqual(pwaInstallIndex, -1);
    assert.notEqual(rootWorkerIndex, -1);
    assert.notEqual(contactsWorkerIndex, -1);

    assert.equal(staticAssetsIndex < pwaInstallIndex, true);
    assert.equal(staticAssetsIndex < rootWorkerIndex, true);
    assert.equal(staticAssetsIndex < contactsWorkerIndex, true);

    const pwaInstallRule = rules[pwaInstallIndex];
    const rootWorkerRule = rules[rootWorkerIndex];
    const contactsWorkerRule = rules[contactsWorkerIndex];

    assert.equal(findHeaderValue(pwaInstallRule.headers, 'Cache-Control'), 'no-cache');
    assert.equal(findHeaderValue(rootWorkerRule.headers, 'Cache-Control'), 'no-cache');
    assert.equal(findHeaderValue(rootWorkerRule.headers, 'Service-Worker-Allowed'), '/');
    assert.equal(findHeaderValue(contactsWorkerRule.headers, 'Cache-Control'), 'no-cache');
    assert.equal(
      findHeaderValue(contactsWorkerRule.headers, 'Service-Worker-Allowed'),
      '/contacts/'
    );
  });
});
