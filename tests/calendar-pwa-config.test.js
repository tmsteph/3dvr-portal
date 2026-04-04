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
    assert.match(html, /href="\.\/*global\.css"/);
    assert.match(html, /href="\.\/*install-banner\.css"/);
    assert.match(html, /src="\.\/*calendar\.js"/);
    assert.match(html, /src="\.\/*gun-init\.js"/);
    assert.match(html, /src="\.\/*oauth\.js"/);
    assert.match(html, /href="\.\/*icons\/icon-192\.png"/);
    assert.match(html, /data-portal-home-link/);
  });

  it('ships a calendar-specific service worker', async () => {
    const workerSource = await readProjectFile('calendar/service-worker.js');

    assert.match(workerSource, /const CACHE_VERSION = 'v2';/);
    assert.match(workerSource, /calendar-static-/);
    assert.match(workerSource, /calendar-html-/);
    assert.match(workerSource, /scopeAsset\('global\.css'\)/);
    assert.match(workerSource, /scopeAsset\('calendar\.css'\)/);
    assert.match(workerSource, /scopeAsset\('install-banner\.css'\)/);
    assert.match(workerSource, /scopeAsset\('calendar\.js'\)/);
    assert.match(workerSource, /scopeAsset\('gun-init\.js'\)/);
    assert.match(workerSource, /scopeAsset\('oauth\.js'\)/);
    assert.match(workerSource, /scopeAsset\('pwa-install\.js'\)/);
    assert.match(workerSource, /scopeAsset\('calendar\.webmanifest'\)/);
    assert.match(workerSource, /scopeAsset\('icons\/icon-192\.png'\)/);
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

  it('keeps the portal calendar install files scoped under /calendar in the main Vercel project', async () => {
    const vercelText = await readProjectFile('vercel.json');
    const config = JSON.parse(vercelText);
    const rules = Array.isArray(config.headers) ? config.headers : [];
    const rewrites = Array.isArray(config.rewrites) ? config.rewrites : [];

    const manifestRule = rules.find((rule) => rule.source === '/calendar/calendar.webmanifest');
    const pwaInstallRule = rules.find((rule) => rule.source === '/calendar/pwa-install.js');
    const workerRule = rules.find((rule) => rule.source === '/calendar/service-worker.js');

    assert.ok(manifestRule);
    assert.ok(pwaInstallRule);
    assert.ok(workerRule);
    assert.equal(
      findHeaderValue(manifestRule.headers, 'Cache-Control'),
      'public, max-age=0, must-revalidate'
    );
    assert.equal(findHeaderValue(pwaInstallRule.headers, 'Cache-Control'), 'no-cache');
    assert.equal(findHeaderValue(workerRule.headers, 'Cache-Control'), 'no-cache');
    assert.equal(
      findHeaderValue(workerRule.headers, 'Service-Worker-Allowed'),
      '/calendar/'
    );
    assert.equal(
      rewrites.some(
        (rule) =>
          Array.isArray(rule.has)
          && rule.has.some(
            (entry) =>
              entry.type === 'host'
              && (entry.value === 'calendar.3dvr.tech' || entry.value === 'calendar-staging.3dvr.tech')
          )
      ),
      false
    );
  });

  it('ships standalone Vercel headers and an API proxy inside the calendar directory', async () => {
    const vercelText = await readProjectFile('calendar/vercel.json');
    const config = JSON.parse(vercelText);
    const rules = Array.isArray(config.headers) ? config.headers : [];
    const rewrites = Array.isArray(config.rewrites) ? config.rewrites : [];

    const staticAssetsRule = rules.find(
      (rule) => rule.source === '/(.*)\\.(css|js|png|jpg|jpeg|gif|svg|webp|woff2?)'
    );
    const manifestRule = rules.find((rule) => rule.source === '/calendar.webmanifest');
    const pwaInstallRule = rules.find((rule) => rule.source === '/pwa-install.js');
    const workerRule = rules.find((rule) => rule.source === '/service-worker.js');
    const apiProxyRewrite = rewrites.find((rule) => rule.source === '/api/:path((?!_proxy$).*)');

    assert.ok(staticAssetsRule);
    assert.ok(manifestRule);
    assert.ok(pwaInstallRule);
    assert.ok(workerRule);
    assert.ok(apiProxyRewrite);
    assert.equal(config.ignoreCommand, 'sh ./ignore-build.sh');
    assert.equal(
      findHeaderValue(manifestRule.headers, 'Cache-Control'),
      'public, max-age=0, must-revalidate'
    );
    assert.equal(findHeaderValue(pwaInstallRule.headers, 'Cache-Control'), 'no-cache');
    assert.equal(findHeaderValue(workerRule.headers, 'Cache-Control'), 'no-cache');
    assert.equal(findHeaderValue(workerRule.headers, 'Service-Worker-Allowed'), '/');
    assert.equal(apiProxyRewrite.destination, '/api/_proxy?path=:path*');
  });

  it('ships a calendar-scoped ignored build script for the standalone Vercel project', async () => {
    const source = await readProjectFile('calendar/ignore-build.sh');

    assert.match(source, /git rev-parse HEAD\^/);
    assert.match(source, /git diff --quiet HEAD\^ HEAD -- \./);
  });
});
