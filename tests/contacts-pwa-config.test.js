import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const readProjectFile = async (path) =>
  readFile(resolve(projectRoot, path), 'utf8');

describe('contacts PWA configuration', () => {
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
});
