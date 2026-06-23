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

describe('CRM PWA configuration', () => {
  it('keeps the portal CRM manifest scoped to /crm', async () => {
    const manifestText = await readProjectFile('app-manifests/crm.webmanifest');
    const manifest = JSON.parse(manifestText);

    assert.equal(manifest.id, '/crm/');
    assert.equal(manifest.scope, '/crm/');
    assert.equal(manifest.start_url, '/crm/?source=pwa');
    assert.equal(manifest.display, 'standalone');
  });

  it('ships a portable CRM manifest for /crm and the CRM subdomain', async () => {
    const manifestText = await readProjectFile('crm/crm.webmanifest');
    const manifest = JSON.parse(manifestText);

    assert.equal(manifest.id, './');
    assert.equal(manifest.scope, './');
    assert.equal(manifest.start_url, './?source=pwa');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.short_name, '3DVR CRM');
  });

  it('ships a root-scoped CRM manifest for crm.3dvr.tech', async () => {
    const manifestText = await readProjectFile('crm/root.webmanifest');
    const manifest = JSON.parse(manifestText);

    assert.equal(manifest.id, '/');
    assert.equal(manifest.scope, '/');
    assert.equal(manifest.start_url, '/?source=pwa');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.short_name, '3DVR CRM');
  });

  it('registers a CRM-scoped worker and install manifest from the CRM app shell', async () => {
    const html = await readProjectFile('crm/index.html');

    assert.match(html, /manifest\.href = window\.location\.hostname === 'crm\.3dvr\.tech'/);
    assert.match(html, /\? '\/crm\.webmanifest'/);
    assert.match(html, /: '\/crm\/crm\.webmanifest'/);
    assert.match(html, /href="\/crm\/install-banner\.css"/);
    assert.match(html, /src="\/crm\/pwa-install\.js"/);
    assert.match(html, /data-sw-url="\/crm\/service-worker\.js"/);
    assert.match(html, /data-sw-scope="\/crm\/"/);
    assert.match(html, /data-sw-standalone-host="crm\.3dvr\.tech"/);
    assert.match(html, /data-sw-standalone-scope="\/"/);
    assert.match(html, /src="\/crm\/app\.js"/);
    assert.match(html, /href="\/crm\/flow\.html"/);
    assert.match(html, /data-install-banner/);
    assert.match(html, /data-install-button/);
  });

  it('ships a CRM-specific service worker', async () => {
    const workerSource = await readProjectFile('crm/service-worker.js');

    assert.match(workerSource, /const CACHE_VERSION = 'v1';/);
    assert.match(workerSource, /crm-static-/);
    assert.match(workerSource, /crm-html-/);
    assert.match(workerSource, /const APP_BASE_URL = new URL\('\/crm\/', ORIGIN_URL\);/);
    assert.match(workerSource, /scopeAsset\(''\)/);
    assert.match(workerSource, /appAsset\('index\.html'\)/);
    assert.match(workerSource, /appAsset\('app\.js'\)/);
    assert.match(workerSource, /appAsset\('crm-editing\.js'\)/);
    assert.match(workerSource, /appAsset\('install-banner\.css'\)/);
    assert.match(workerSource, /appAsset\('pwa-install\.js'\)/);
    assert.match(workerSource, /appAsset\('crm\.webmanifest'\)/);
    assert.match(workerSource, /appAsset\('root\.webmanifest'\)/);
    assert.match(workerSource, /rootAsset\('icons\/icon-192\.png'\)/);
    assert.match(workerSource, /request\.mode === 'navigate'/);
    assert.match(workerSource, /networkFirst\(request, HTML_CACHE, appAsset\('index\.html'\)\)/);
    assert.match(workerSource, /type === 'SKIP_WAITING'/);
  });

  it('resolves CRM install paths relative to the active page URL', async () => {
    const source = await readProjectFile('crm/pwa-install.js');

    assert.match(source, /const resolutionBaseUrl = new URL\(window\.location\.href\);/);
    assert.match(source, /const standaloneHost = scriptEl\?\.dataset\?\.swStandaloneHost/);
    assert.match(source, /const standaloneScope = scriptEl\?\.dataset\?\.swStandaloneScope/);
    assert.match(source, /new URL\(configuredWorkerUrl,\s*resolutionBaseUrl\)/);
    assert.match(source, /new URL\(configuredScope,\s*resolutionBaseUrl\)/);
    assert.match(source, /postMessage\(\{\s*type:\s*'SKIP_WAITING'\s*\}\)/);
  });

  it('serves CRM PWA files and crm.3dvr.tech from the main Vercel project', async () => {
    const vercelText = await readProjectFile('vercel.json');
    const config = JSON.parse(vercelText);
    const rules = Array.isArray(config.headers) ? config.headers : [];
    const rewrites = Array.isArray(config.rewrites) ? config.rewrites : [];

    const manifestRule = rules.find((rule) => rule.source === '/crm/crm.webmanifest');
    const rootManifestRule = rules.find((rule) => rule.source === '/crm/root.webmanifest');
    const rootAliasManifestRule = rules.find((rule) => rule.source === '/crm.webmanifest');
    const pwaInstallRule = rules.find((rule) => rule.source === '/crm/pwa-install.js');
    const workerRule = rules.find((rule) => rule.source === '/crm/service-worker.js');
    const crmRootManifestRewrite = rewrites.find((rule) =>
      rule.source === '/crm.webmanifest'
      && rule.destination === '/crm/root.webmanifest'
      && Array.isArray(rule.has)
      && rule.has.some((entry) => entry.type === 'host' && entry.value === 'crm.3dvr.tech')
    );
    const crmHostRewrite = rewrites.find((rule) =>
      rule.source === '/'
      && rule.destination === '/crm/index.html'
      && Array.isArray(rule.has)
      && rule.has.some((entry) => entry.type === 'host' && entry.value === 'crm.3dvr.tech')
    );

    assert.ok(manifestRule);
    assert.ok(rootManifestRule);
    assert.ok(rootAliasManifestRule);
    assert.ok(pwaInstallRule);
    assert.ok(workerRule);
    assert.ok(crmRootManifestRewrite);
    assert.ok(crmHostRewrite);
    assert.equal(
      findHeaderValue(manifestRule.headers, 'Cache-Control'),
      'public, max-age=0, must-revalidate'
    );
    assert.equal(
      findHeaderValue(rootManifestRule.headers, 'Cache-Control'),
      'public, max-age=0, must-revalidate'
    );
    assert.equal(
      findHeaderValue(rootAliasManifestRule.headers, 'Cache-Control'),
      'public, max-age=0, must-revalidate'
    );
    assert.equal(findHeaderValue(pwaInstallRule.headers, 'Cache-Control'), 'no-cache');
    assert.equal(findHeaderValue(workerRule.headers, 'Cache-Control'), 'no-cache');
    assert.equal(findHeaderValue(workerRule.headers, 'Service-Worker-Allowed'), '/');
  });
});
