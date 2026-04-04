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

describe('calendar PWA configuration', () => {
  it('keeps the portal calendar manifest scoped to /calendar', async () => {
    const manifestText = await readProjectFile('app-manifests/calendar.webmanifest');
    const manifest = JSON.parse(manifestText);

    assert.equal(manifest.id, '/calendar/');
    assert.equal(manifest.scope, '/calendar/');
    assert.equal(manifest.start_url, '/calendar/?source=pwa');
    assert.equal(manifest.display, 'standalone');
  });

  it('ships a portable calendar manifest for both /calendar and calendar subdomains', async () => {
    const manifestText = await readProjectFile('calendar/calendar.webmanifest');
    const manifest = JSON.parse(manifestText);

    assert.equal(manifest.id, './');
    assert.equal(manifest.scope, './');
    assert.equal(manifest.start_url, './?source=pwa');
    assert.equal(manifest.display, 'standalone');
  });

  it('registers a calendar-scoped worker and local manifest from the calendar app shell', async () => {
    const html = await readProjectFile('calendar/index.html');

    assert.match(html, /src="\.\/*pwa-install\.js"/);
    assert.match(html, /data-sw-url="\.\/*service-worker\.js"/);
    assert.match(html, /data-sw-scope="\.\//);
    assert.match(html, /href="\.\/*calendar\.webmanifest"/);
    assert.match(html, /src="\.\/*calendar\.js"/);
    assert.match(html, /src="\.\.\/gun-init\.js"/);
    assert.match(html, /src="\.\.\/oauth\.js"/);
    assert.match(html, /data-portal-home-link/);
  });

  it('ships a calendar-specific service worker', async () => {
    const workerSource = await readProjectFile('calendar/service-worker.js');

    assert.match(workerSource, /const CACHE_VERSION = 'v1';/);
    assert.match(workerSource, /calendar-static-/);
    assert.match(workerSource, /calendar-html-/);
    assert.match(workerSource, /scopeAsset\('calendar\.css'\)/);
    assert.match(workerSource, /scopeAsset\('calendar\.js'\)/);
    assert.match(workerSource, /scopeAsset\('pwa-install\.js'\)/);
    assert.match(workerSource, /scopeAsset\('calendar\.webmanifest'\)/);
    assert.match(workerSource, /scopeAsset\('\.\.\/styles\/global\.css'\)/);
    assert.match(workerSource, /scopeAsset\('\.\.\/oauth\.js'\)/);
    assert.match(workerSource, /request\.mode === 'navigate'/);
    assert.match(workerSource, /type === 'SKIP_WAITING'/);
  });

  it('resolves calendar install paths relative to the active page URL', async () => {
    const source = await readProjectFile('calendar/pwa-install.js');

    assert.match(source, /const resolutionBaseUrl = new URL\(window\.location\.href\);/);
    assert.match(source, /new URL\(configuredWorkerUrl,\s*resolutionBaseUrl\)/);
    assert.match(source, /new URL\(configuredScope,\s*resolutionBaseUrl\)/);
    assert.match(source, /postMessage\(\{\s*type:\s*'SKIP_WAITING'\s*\}\)/);
  });

  it('resolves the portal home from calendar subdomains', async () => {
    const source = await readProjectFile('calendar/calendar.js');

    assert.match(source, /const DEFAULT_PORTAL_ORIGIN = 'https:\/\/portal\.3dvr\.tech';/);
    assert.match(source, /lowerHost\.startsWith\('calendar-staging\.'\)/);
    assert.match(source, /lowerHost\.startsWith\('calendar\.'\)/);
    assert.match(source, /portal-staging\./);
    assert.match(source, /portal\./);
    assert.match(source, /function hydratePortalHomeLink\(\)/);
  });

  it('marks calendar install files as no-cache and rewrites calendar subdomain roots', async () => {
    const vercelText = await readProjectFile('vercel.json');
    const config = JSON.parse(vercelText);
    const rules = Array.isArray(config.headers) ? config.headers : [];
    const rewrites = Array.isArray(config.rewrites) ? config.rewrites : [];

    const manifestRule = rules.find((rule) => rule.source === '/calendar/calendar.webmanifest');
    const subdomainManifestRule = rules.find((rule) => rule.source === '/calendar.webmanifest');
    const pwaInstallRule = rules.find((rule) => rule.source === '/calendar/pwa-install.js');
    const workerRule = rules.find((rule) => rule.source === '/calendar/service-worker.js');

    assert.ok(manifestRule);
    assert.ok(subdomainManifestRule);
    assert.ok(pwaInstallRule);
    assert.ok(workerRule);
    assert.equal(
      findHeaderValue(manifestRule.headers, 'Cache-Control'),
      'public, max-age=0, must-revalidate'
    );
    assert.equal(
      findHeaderValue(subdomainManifestRule.headers, 'Cache-Control'),
      'public, max-age=0, must-revalidate'
    );
    assert.equal(findHeaderValue(pwaInstallRule.headers, 'Cache-Control'), 'no-cache');
    assert.equal(findHeaderValue(workerRule.headers, 'Cache-Control'), 'no-cache');
    assert.equal(
      findHeaderValue(workerRule.headers, 'Service-Worker-Allowed'),
      '/calendar/'
    );

    const productionRootRewrite = rewrites.find(
      (rule) =>
        rule.source === '/'
        && rule.destination === '/calendar/index.html'
        && Array.isArray(rule.has)
        && rule.has.some((entry) => entry.type === 'host' && entry.value === 'calendar.3dvr.tech')
    );
    const productionWorkerRewrite = rewrites.find(
      (rule) =>
        rule.source === '/service-worker.js'
        && rule.destination === '/calendar/service-worker.js'
        && Array.isArray(rule.has)
        && rule.has.some((entry) => entry.type === 'host' && entry.value === 'calendar.3dvr.tech')
    );
    const productionInstallerRewrite = rewrites.find(
      (rule) =>
        rule.source === '/pwa-install.js'
        && rule.destination === '/calendar/pwa-install.js'
        && Array.isArray(rule.has)
        && rule.has.some((entry) => entry.type === 'host' && entry.value === 'calendar.3dvr.tech')
    );
    const stagingRootRewrite = rewrites.find(
      (rule) =>
        rule.source === '/'
        && rule.destination === '/calendar/index.html'
        && Array.isArray(rule.has)
        && rule.has.some((entry) => entry.type === 'host' && entry.value === 'calendar-staging.3dvr.tech')
    );

    assert.ok(productionRootRewrite);
    assert.ok(productionInstallerRewrite);
    assert.ok(productionWorkerRewrite);
    assert.ok(stagingRootRewrite);
  });
});
