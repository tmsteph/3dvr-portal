'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  SITE_CONFIG,
  chooseVaultItem,
  extractLogin,
  lighthouseIdentityFromTargets,
  scoreVaultItem,
} = require('../apps/agent/thomas-agent/node/browser-login');

const root = path.resolve(__dirname, '..');

test('vault lookup strongly prefers the exact provider host', () => {
  const index = {
    items: [
      { key: 'VAULT_ITEM__LOGIN__ULTIPRO_TIME__AAA', type: 'login', name: 'UltiPro Time', uris: ['https://example.ultiprotime.com/mobile/'] },
      { key: 'VAULT_ITEM__LOGIN__UKG__BBB', type: 'login', name: 'UKG Pro', uris: ['https://n21.ultipro.com/Login.aspx'] },
    ],
  };
  const match = chooseVaultItem(index, SITE_CONFIG.ukg);
  assert.equal(match?.key, 'VAULT_ITEM__LOGIN__UKG__BBB');
  assert.equal(scoreVaultItem(match, SITE_CONFIG.ukg) >= 100, true);
});


test('Portal login matches the Bitwarden item even when its URI has no scheme', () => {
  const index = {
    items: [
      { key: 'VAULT_ITEM__LOGIN__PORTAL__CCC', type: 'login', name: 'portal.3dvr.tech', uris: ['portal.3dvr.tech'] },
    ],
  };
  const match = chooseVaultItem(index, SITE_CONFIG.portal);
  assert.equal(match?.key, 'VAULT_ITEM__LOGIN__PORTAL__CCC');
  assert.equal(scoreVaultItem(match, SITE_CONFIG.portal) >= 100, true);
});

test('Lighthouse never reuses a provider password after the identity step', () => {
  const index = {
    items: [
      { key: 'VAULT_ITEM__LOGIN__UKG__BBB', type: 'login', name: 'UKG Pro', uris: ['https://n21.ultipro.com/Login.aspx'] },
    ],
  };
  const match = chooseVaultItem(index, SITE_CONFIG.lighthouse);
  assert.equal(match?.key, 'VAULT_ITEM__LOGIN__UKG__BBB');
  assert.equal(SITE_CONFIG.lighthouse.allowPasswordAfterEmail, false);
  const source = fs.readFileSync(path.join(root, 'apps/agent/thomas-agent/node/browser-login.js'), 'utf8');
  assert.match(source, /sharepoint-session-required/);
  assert.match(source, /lighthouseIdentityFromSharePoint/);
});

test('Lighthouse prefers the active SharePoint Microsoft identity', () => {
  const identity = lighthouseIdentityFromTargets([
    { type: 'page', url: 'https://psav.sharepoint.com/SitePages/Home.aspx' },
    { type: 'iframe', url: 'https://webshell.suite.office.com/iframe/TokenFactoryIframe?origin=https%3A%2F%2Fpsav.sharepoint.com&upn=worker%40example.test' },
  ]);
  assert.equal(identity, 'worker@example.test');
});

test('Lighthouse input handling triggers blur so Angular enables Continue', () => {
  const source = fs.readFileSync(path.join(root, 'apps/agent/thomas-agent/node/browser-login.js'), 'utf8');
  assert.match(source, /new Event\('blur', \{ bubbles: true \}\)/);
});

test('UKG logout page is never classified as authenticated', () => {
  const source = fs.readFileSync(path.join(root, 'apps/agent/thomas-agent/node/browser-login.js'), 'utf8');
  assert.match(source, /postlogout\\.aspx/i);
  assert.match(source, /session-expired/);
});

test('mirrored login extraction reads only the login record', () => {
  const login = extractLogin(JSON.stringify({
    type: 'login',
    login: { username: 'worker@example.test', password: 'example-only', uris: [] },
  }));
  assert.deepEqual(login, { username: 'worker@example.test', password: 'example-only' });
});

test('browser login route is local-only and precedes bearer-authenticated broker routes', () => {
  const server = fs.readFileSync(path.join(root, 'apps/agent/thomas-agent/node/secrets-broker-server.js'), 'utf8');
  const browserRoute = server.indexOf("url.pathname === '/v1/browser-login'");
  const bearerAuth = server.indexOf('broker.authenticate(bearer(req))');
  assert.ok(browserRoute > 0);
  assert.ok(bearerAuth > browserRoute);
  assert.match(server, /LOCAL_BROWSER_AGENT/);
  assert.match(server, /this server listens on a Unix socket/);
});

test('browser login is restricted to named sites and never returns credentials', () => {
  const source = fs.readFileSync(path.join(root, 'apps/agent/thomas-agent/node/browser-login.js'), 'utf8');
  assert.deepEqual(Object.keys(SITE_CONFIG).sort(), ['iatse', 'lighthouse', 'portal', 'ukg']);
  assert.match(source, /unsupported_site/);
  assert.match(source, /never|credential/i);
  assert.doesNotMatch(source, /body:\s*\{[^}]*password\s*:/);
  assert.doesNotMatch(source, /console\.log\([^)]*(username|password|secret)/i);
});

test('installer publishes the first-class browser login command', () => {
  const installer = fs.readFileSync(path.join(root, 'ops/secrets-broker/install.sh'), 'utf8');
  assert.match(installer, /browser-login\.js/);
  assert.match(installer, /3dvr-browser-login\.mjs/);
  assert.match(installer, /\/usr\/local\/bin\/3dvr-browser-login/);
});
