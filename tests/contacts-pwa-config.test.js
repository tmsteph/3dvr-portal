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
    assert.equal(manifest.short_name, '3DVR Contacts');
    assert.equal(manifest.scope, '/contacts/');
    assert.match(manifest.start_url, /^\/contacts\//);
    assert.equal(manifest.display, 'standalone');
  });

  it('ships a portable contacts webmanifest for standalone deployments', async () => {
    const manifestText = await readProjectFile('contacts/contacts.webmanifest');
    const manifest = JSON.parse(manifestText);

    assert.equal(manifest.id, './');
    assert.equal(manifest.short_name, '3DVR Contacts');
    assert.equal(manifest.scope, './');
    assert.equal(manifest.start_url, './?source=pwa');
    assert.equal(manifest.display, 'standalone');
  });

  it('registers the contacts service worker with contacts scope', async () => {
    const html = await readProjectFile('contacts/index.html');

    assert.match(html, /src="\.\/*pwa-install\.js"/);
    assert.match(html, /data-sw-url="\.\/*service-worker\.js"/);
    assert.match(html, /data-sw-scope="\.\//);
    assert.match(html, /href="\.\/*contacts\.webmanifest"/);
  });

  it('keeps shared runtime scripts root-absolute for portal and standalone roots', async () => {
    const html = await readProjectFile('contacts/index.html');

    assert.match(html, /<script src="\/gun-init\.js"><\/script>/);
    assert.match(html, /<script src="\/score\.js"><\/script>/);
  });

  it('ships an app-specific contacts service worker', async () => {
    const workerSource = await readProjectFile('contacts/service-worker.js');

    assert.match(workerSource, /contacts-static-/);
    assert.match(workerSource, /contacts-html-/);
    assert.match(workerSource, /scopeAsset\('index\.html'\)/);
    assert.match(workerSource, /scopeAsset\('gun-init\.js'\)/);
    assert.match(workerSource, /scopeAsset\('score\.js'\)/);
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
    const contactsPwaInstallIndex = rules.findIndex(
      (rule) => rule.source === '/contacts/pwa-install.js'
    );
    const rootWorkerIndex = rules.findIndex((rule) => rule.source === '/service-worker.js');
    const contactsWorkerIndex = rules.findIndex(
      (rule) => rule.source === '/contacts/service-worker.js'
    );
    const contactsManifestIndex = rules.findIndex(
      (rule) => rule.source === '/contacts/contacts.webmanifest'
    );

    assert.notEqual(staticAssetsIndex, -1);
    assert.notEqual(pwaInstallIndex, -1);
    assert.notEqual(contactsPwaInstallIndex, -1);
    assert.notEqual(rootWorkerIndex, -1);
    assert.notEqual(contactsWorkerIndex, -1);
    assert.notEqual(contactsManifestIndex, -1);

    assert.equal(staticAssetsIndex < pwaInstallIndex, true);
    assert.equal(staticAssetsIndex < contactsPwaInstallIndex, true);
    assert.equal(staticAssetsIndex < rootWorkerIndex, true);
    assert.equal(staticAssetsIndex < contactsWorkerIndex, true);

    const pwaInstallRule = rules[pwaInstallIndex];
    const contactsPwaInstallRule = rules[contactsPwaInstallIndex];
    const rootWorkerRule = rules[rootWorkerIndex];
    const contactsWorkerRule = rules[contactsWorkerIndex];
    const contactsManifestRule = rules[contactsManifestIndex];

    assert.equal(findHeaderValue(pwaInstallRule.headers, 'Cache-Control'), 'no-cache');
    assert.equal(findHeaderValue(contactsPwaInstallRule.headers, 'Cache-Control'), 'no-cache');
    assert.equal(findHeaderValue(rootWorkerRule.headers, 'Cache-Control'), 'no-cache');
    assert.equal(findHeaderValue(rootWorkerRule.headers, 'Service-Worker-Allowed'), '/');
    assert.equal(findHeaderValue(contactsWorkerRule.headers, 'Cache-Control'), 'no-cache');
    assert.equal(
      findHeaderValue(contactsWorkerRule.headers, 'Service-Worker-Allowed'),
      '/contacts/'
    );
    assert.equal(
      findHeaderValue(contactsManifestRule.headers, 'Cache-Control'),
      'public, max-age=0, must-revalidate'
    );
  });

  it('ships standalone Vercel headers inside the contacts directory', async () => {
    const vercelText = await readProjectFile('contacts/vercel.json');
    const config = JSON.parse(vercelText);
    const rules = Array.isArray(config.headers) ? config.headers : [];

    const staticAssetsRule = rules.find(
      (rule) => rule.source === '/(.*)\\.(css|js|png|jpg|jpeg|gif|svg|webp|woff2?)'
    );
    const pwaInstallRule = rules.find((rule) => rule.source === '/pwa-install.js');
    const workerRule = rules.find((rule) => rule.source === '/service-worker.js');
    const manifestRule = rules.find((rule) => rule.source === '/contacts.webmanifest');

    assert.ok(staticAssetsRule);
    assert.ok(pwaInstallRule);
    assert.ok(workerRule);
    assert.ok(manifestRule);

    assert.equal(findHeaderValue(pwaInstallRule.headers, 'Cache-Control'), 'no-cache');
    assert.equal(findHeaderValue(workerRule.headers, 'Cache-Control'), 'no-cache');
    assert.equal(findHeaderValue(workerRule.headers, 'Service-Worker-Allowed'), '/');
    assert.equal(
      findHeaderValue(manifestRule.headers, 'Cache-Control'),
      'public, max-age=0, must-revalidate'
    );
  });
});
