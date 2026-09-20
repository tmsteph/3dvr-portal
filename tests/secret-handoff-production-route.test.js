import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readProjectFile = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const headerValue = (headers, key) => headers.find(header => header.key === key)?.value ?? null;

test('Secret Handoff pages are never served from stale caches', async () => {
  const config = JSON.parse(await readProjectFile('vercel.json'));
  for (const source of ['/secret-handoff', '/secret-handoff/', '/secret-handoff/:path*']) {
    const rule = config.headers?.find(entry => entry.source === source);
    assert.ok(rule, `missing cache rule for ${source}`);
    assert.equal(headerValue(rule.headers, 'Cache-Control'), 'no-store, max-age=0');
    assert.equal(headerValue(rule.headers, 'CDN-Cache-Control'), 'no-store');
    assert.equal(headerValue(rule.headers, 'Vercel-CDN-Cache-Control'), 'no-store');
  }

  const server = await readProjectFile('scripts/self-host-server.mjs');
  assert.ok(server.includes("pathname === '/secret-handoff'"));
  assert.ok(server.includes("pathname.startsWith('/secret-handoff/')"));
  assert.ok(server.includes("url.pathname === '/api/secret-handoff'"));
  assert.match(server, /secretHandoffHandler/);
});

test('public handoff keeps the capability in the URL fragment and encrypts before submit', async () => {
  const app = await readProjectFile('secret-handoff/app.js');
  assert.match(app, /location\.hash/);
  assert.match(app, /history\.replaceState/);
  assert.match(app, /sessionStorage\.setItem/);
  assert.match(app, /ECDH/);
  assert.match(app, /HKDF/);
  assert.match(app, /AES-GCM/);
  assert.match(app, /action: 'submit'/);
});

test('Access exposes owner-side secret request creation', async () => {
  const html = await readProjectFile('access/index.html');
  const app = await readProjectFile('access/app.js');
  assert.match(html, /id="openSecretHandoff"/);
  assert.match(html, /id="secretHandoffDialog"/);
  assert.match(app, /createSignedPortalProof\('secret-handoff-owner', 'create'/);
  assert.match(app, /handoffRequestHash/);
});
