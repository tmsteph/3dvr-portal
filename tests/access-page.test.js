import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../access/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../access/app.js', import.meta.url), 'utf8');
const home = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const abilitiesPage = await readFile(new URL('../abilities/index.html', import.meta.url), 'utf8');
const abilitiesApp = await readFile(new URL('../abilities/app.js', import.meta.url), 'utf8');
const abilities = JSON.parse(await readFile(new URL('../abilities/abilities.json', import.meta.url), 'utf8'));

test('Access page keeps the one-time machine token ephemeral', () => {
  assert.match(page, /without SSH or passwords in chat/i);
  assert.match(page, /type="password"[^>]*autocomplete="off"/i);
  assert.match(app, /bitwardenToken\.value = ''/);
  assert.doesNotMatch(app, /localStorage\.setItem\([^)]*bitwarden|sessionStorage\.setItem\([^)]*bitwarden/i);
  assert.match(app, /accessTokenHash/);
});

test('Access page sends broker requests directly to the published OVH control plane', () => {
  assert.match(app, /runtime\/organism-bridge\.json/);
  assert.match(app, /trycloudflare\.com/);
  assert.match(app, /fetch\(`\$\{brokerOrigin\}\/api\/secrets-broker`/);
  assert.match(app, /credentials: 'omit'/);
});

test('Access page keeps a persistent connected state after Bitwarden is ready', () => {
  assert.match(app, /Bitwarden connected ✅/);
  assert.match(app, /Connected ✓/);
  assert.match(app, /brokerDot.*status-dot/);
  assert.match(app, /approvalButton\.disabled = connected/);
});

test('Access page can save a secret through the owner-gated broker without persisting the value', () => {
  assert.match(page, /Save to 3DVR Secrets/);
  assert.match(page, /id="secretValue"[^>]*type="password"/);
  assert.match(app, /brokerAction\('store-secret'/);
  assert.match(app, /secretValueHash/);
  assert.match(app, /result\?\.decision !== 'allowed'/);
  assert.equal((app.match(/secretValue\.value = ''/g) || []).length, 1);
  assert.doesNotMatch(app, /localStorage\.setItem\([^)]*secretValue|sessionStorage\.setItem\([^)]*secretValue/i);
});

test('Access page exposes the owner approval path', () => {
  assert.match(page, /Create 3DVR machine access/);
  assert.match(page, /Bitwarden Secrets Manager/);
  assert.match(page, /3DVR Secrets Broker/);
  assert.match(app, /secrets-broker-owner/);
  assert.match(app, /data-decision=\"approve\"/);
});

test('Access page and abilities registry converge on one capability map', () => {
  assert.match(page, /How Operator reaches your systems/);
  assert.match(page, /Full registry/);
  assert.match(app, /\/abilities\/abilities\.json/);
  assert.match(app, /capability\.showInAccess/);
  assert.match(abilitiesPage, /Check the map before saying/);
  assert.match(abilitiesApp, /How to use & recover/);

  const remoteLinux = abilities.capabilities.find(capability => capability.id === 'remote-linux');
  const whatsapp = abilities.capabilities.find(capability => capability.id === 'whatsapp');
  const bitwarden = abilities.capabilities.find(capability => capability.id === 'bitwarden-vault');
  const selfVerify = abilities.capabilities.find(capability => capability.id === 'self-verify');
  assert.equal(remoteLinux?.showInAccess, true);
  assert.match(remoteLinux?.healthCheck || '', /real command|hostname\/uptime/i);
  assert.equal(whatsapp?.showInAccess, true);
  assert.match(whatsapp?.healthCheck || '', /authenticated/i);
  assert.equal(bitwarden?.showInAccess, true);
  assert.equal(selfVerify?.status, 'partial');
  assert.deepEqual(Object.keys(abilities.healthLevels || {}), ['configured', 'reachable', 'operational', 'session']);
});

test('Portal navigation includes Access', () => {
  assert.match(home, /href="\/access\/"/);
  assert.match(home, /<strong>Access<\/strong>/);
});


test('Access page documents the persistent-session recovery contract', () => {
  assert.match(page, /Connect once, recover automatically/);
  assert.match(page, /Verify before reconnecting/);
  assert.match(page, /UKG\/Lighthouse and messaging stay on OVH/);
  assert.match(page, /One human checkpoint/);
});
