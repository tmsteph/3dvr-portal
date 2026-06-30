import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readProjectFile = async (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const findHeaderValue = (headers, key) => {
  const match = headers.find((header) => header.key === key);
  return match ? match.value : null;
};

test('portal root and unversioned styles/scripts revalidate on mobile browsers', async () => {
  const vercelText = await readProjectFile('vercel.json');
  const config = JSON.parse(vercelText);
  const rules = Array.isArray(config.headers) ? config.headers : [];

  const rootRule = rules.find((rule) => rule.source === '/');
  const indexRule = rules.find((rule) => rule.source === '/index.html');
  const cacheResetRule = rules.find((rule) => rule.source === '/cache-reset.html');
  const codeAssetRule = rules.find((rule) => rule.source === '/(.*)\\.(css|js)');
  const mediaAssetRule = rules.find((rule) => rule.source === '/(.*)\\.(png|jpg|jpeg|gif|svg|webp|woff2?)');

  assert.ok(rootRule);
  assert.ok(indexRule);
  assert.ok(cacheResetRule);
  assert.ok(codeAssetRule);
  assert.ok(mediaAssetRule);
  assert.equal(findHeaderValue(rootRule.headers, 'Cache-Control'), 'public, max-age=0, must-revalidate');
  assert.equal(findHeaderValue(indexRule.headers, 'Cache-Control'), 'public, max-age=0, must-revalidate');
  assert.equal(findHeaderValue(cacheResetRule.headers, 'Cache-Control'), 'no-store');
  assert.equal(findHeaderValue(cacheResetRule.headers, 'Clear-Site-Data'), '"cache"');
  assert.equal(findHeaderValue(codeAssetRule.headers, 'Cache-Control'), 'public, max-age=0, must-revalidate');
  assert.equal(findHeaderValue(mediaAssetRule.headers, 'Cache-Control'), 'public, max-age=31536000, immutable');
});

test('homepage includes a dark critical fallback before external styles load', async () => {
  const html = await readProjectFile('index.html');
  const criticalStyleIndex = html.indexOf('<style>');
  const globalCssIndex = html.indexOf('<link rel="stylesheet" href="styles/global.css">');
  const indexCssIndex = html.indexOf('<link rel="stylesheet" href="index-style.css">');

  assert.ok(criticalStyleIndex > -1);
  assert.ok(globalCssIndex > criticalStyleIndex);
  assert.ok(indexCssIndex > criticalStyleIndex);
  assert.match(html, /body\.landing\s*\{[\s\S]*background:\s*#0d1117;/);
  assert.match(html, /\.top-nav__toggle,[\s\S]*\.top-nav__search,[\s\S]*\.cta,[\s\S]*\.top-buttons a\s*\{/);
  assert.match(html, /\.app-ready \.app-boot\s*\{[\s\S]*display:\s*none;/);
});

test('root service worker does not cache stale portal HTML or Vercel checkpoints', async () => {
  const source = await readProjectFile('service-worker.js');
  const staticAssetsBlock = source.match(/const STATIC_ASSETS = \[[\s\S]*?\];/)?.[0] || '';

  assert.match(source, /const CACHE_VERSION = 'v18';/);
  assert.match(source, /const AUTH_CRITICAL_HTML_PATHS = new Set\(\[/);
  assert.match(source, /'\/index\.html'/);
  assert.match(source, /'\/profile\.html'/);
  assert.match(source, /'\/sign-in\.html'/);
  assert.match(source, /const isAuthCriticalHtmlRequest = \(request\) =>/);
  assert.doesNotMatch(staticAssetsBlock, /'\/'/);
  assert.match(source, /SECURITY_CHECKPOINT_PATTERN/);
  assert.match(source, /Vercel Security Checkpoint/);
  assert.match(source, /Failed to verify your browser/);
  assert.match(source, /verifying\|checking/);
  assert.match(source, /705\|805/);
  assert.match(source, /networkFirstHtml/);
  assert.match(source, /SECURITY_CHECKPOINT_PATTERN\.test\(text\)/);
  assert.match(source, /if \(isAuthCritical\) \{[\s\S]*?return fresh;[\s\S]*?\}/);
  assert.match(source, /return getCachedHtmlFallback\(request\)/);
  assert.match(source, /shouldCacheHtmlResponse/);
  assert.match(source, /if \(isAuthCriticalHtmlRequest\(request\)\) return;/);
  assert.match(source, /fresh\.ok && !isAuthCritical/);
  assert.match(source, /fetch\(request,\s*\{\s*cache:\s*'reload'\s*\}\)/);
  assert.match(source, /caches\.match\(request,\s*\{\s*ignoreSearch:\s*true\s*\}\)/);
  assert.match(source, /createOfflinePortalFallbackResponse/);
});

test('root PWA installer prevents controllerchange reload loops', async () => {
  const source = await readProjectFile('pwa-install.js');

  assert.match(source, /reloadGuardKey/);
  assert.match(source, /reloadCooldownMs = 30000/);
  assert.match(source, /authCacheRecoveryVersion = '2026-06-30-auth-cache-v2'/);
  assert.match(source, /authCriticalPaths = new Set\(\['\/', '\/index\.html', '\/profile\.html', '\/sign-in\.html'\]\)/);
  assert.match(source, /const clearPortalOriginCaches = async \(\) =>/);
  assert.match(source, /window\.caches\.keys\(\)/);
  assert.match(source, /keys\.map\(\(key\) => window\.caches\.delete\(key\)\)/);
  assert.match(source, /unregisterPortalServiceWorkers/);
  assert.match(source, /navigator\.serviceWorker\.getRegistrations\(\)/);
  assert.match(source, /registration\.unregister\(\)/);
  assert.match(source, /recoverPortalAuthCache\(\)/);
  assert.match(source, /window\.addEventListener\('pageshow'/);
  assert.match(source, /event\.persisted/);
  assert.match(source, /sessionStorage\.getItem\(reloadGuardKey\)/);
  assert.match(source, /document\.visibilityState === 'hidden'/);
  assert.match(source, /shouldReloadForControllerChange\(\)/);
  assert.match(source, /window\.location\.reload\(\)/);
});

test('cache reset page aggressively clears only browser cache infrastructure', async () => {
  const html = await readProjectFile('cache-reset.html');

  assert.match(html, /Reset 3DVR Portal Cache/);
  assert.match(html, /Saved app data and sign-in data stay in this browser/);
  assert.match(html, /window\.caches\.keys\(\)/);
  assert.match(html, /window\.caches\.delete\(key\)/);
  assert.match(html, /navigator\.serviceWorker\.getRegistrations\(\)/);
  assert.match(html, /registration\.unregister\(\)/);
  assert.match(html, /3dvr-auth-cache-recovery-version/);
  assert.match(html, /2026-06-30-auth-cache-v2/);
  assert.match(html, /window\.location\.replace\(nextUrl\)/);
  assert.doesNotMatch(html, /localStorage\.clear\(\)/);
  assert.doesNotMatch(html, /indexedDB\.deleteDatabase/);
  assert.doesNotMatch(html, /document\.cookie\s*=/);
});
