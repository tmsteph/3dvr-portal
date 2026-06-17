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
  const codeAssetRule = rules.find((rule) => rule.source === '/(.*)\\.(css|js)');
  const mediaAssetRule = rules.find((rule) => rule.source === '/(.*)\\.(png|jpg|jpeg|gif|svg|webp|woff2?)');

  assert.ok(rootRule);
  assert.ok(indexRule);
  assert.ok(codeAssetRule);
  assert.ok(mediaAssetRule);
  assert.equal(findHeaderValue(rootRule.headers, 'Cache-Control'), 'public, max-age=0, must-revalidate');
  assert.equal(findHeaderValue(indexRule.headers, 'Cache-Control'), 'public, max-age=0, must-revalidate');
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

  assert.match(source, /const CACHE_VERSION = 'v16';/);
  assert.doesNotMatch(staticAssetsBlock, /'\/'/);
  assert.match(source, /SECURITY_CHECKPOINT_PATTERN/);
  assert.match(source, /Vercel Security Checkpoint/);
  assert.match(source, /Failed to verify your browser/);
  assert.match(source, /shouldCacheHtmlResponse/);
  assert.match(source, /fetch\(req,\s*\{\s*cache:\s*'reload'\s*\}\)/);
  assert.match(source, /caches\.match\(req,\s*\{\s*ignoreSearch:\s*true\s*\}\)/);
  assert.match(source, /createOfflinePortalFallbackResponse/);
});

test('root PWA installer prevents controllerchange reload loops', async () => {
  const source = await readProjectFile('pwa-install.js');

  assert.match(source, /reloadGuardKey/);
  assert.match(source, /reloadCooldownMs = 30000/);
  assert.match(source, /window\.addEventListener\('pageshow'/);
  assert.match(source, /event\.persisted/);
  assert.match(source, /sessionStorage\.getItem\(reloadGuardKey\)/);
  assert.match(source, /document\.visibilityState === 'hidden'/);
  assert.match(source, /shouldReloadForControllerChange\(\)/);
  assert.match(source, /window\.location\.reload\(\)/);
});
