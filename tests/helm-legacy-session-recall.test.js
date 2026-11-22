import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.self = globalThis;
const SEA = require('gun/sea');
const source = await readFile(new URL('../operator/forge.js', import.meta.url), 'utf8');
const syntheticAlias = 'demo-legacy-owner@3dvr';
const ordinaryAlias = 'demo-member@3dvr';
const password = 'synthetic-loopback-fixture-only';
const pair = await SEA.pair();
const another = await SEA.pair();

async function setup(t, { alias = syntheticAlias, pub = pair.pub, hasPassword = true, recall, auth }) {
  const storage = new Map([
    ['signedIn', 'true'],
    ['alias', alias],
    ['userPubKey', pub],
    ...(hasPassword ? [['password', password]] : [])
  ]);
  const calls = [];
  const user = {
    recall() { if (recall) assign(recall, recall.pub); },
    auth(target, secret, ack) {
      calls.push({ target, secret });
      auth?.({ target, secret, ack, assign, storage });
    }
  };
  function assign(sea, activeAlias) { user._ = { sea }; user.is = { pub: sea.pub, alias: activeAlias }; }
  function Gun() { return { user: () => user }; }
  Gun.SEA = SEA;
  const original = [globalThis.Gun, globalThis.localStorage];
  globalThis.Gun = Gun;
  globalThis.localStorage = { getItem: name => storage.get(name) ?? null };
  t.after(() => { [globalThis.Gun, globalThis.localStorage] = original; });

  // Keep this fixture independent of the real account. Exercise the shipping
  // logic with a newly generated SEA pair and a synthetic legacy binding.
  const code = source
    .replace(/const LEGACY_OWNER_ALIAS = '[^']+';/, "const LEGACY_OWNER_ALIAS = '" + syntheticAlias + "';")
    .replace(/const LEGACY_OWNER_PUB = '[^']+';/, "const LEGACY_OWNER_PUB = '" + pair.pub + "';");
  assert.notEqual(code, source);
  const link = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64') + '#'+crypto.randomUUID();
  const mod = await import(link);
  const proof = () => mod.createSignedPortalProof('openclaw-helm', 'status');
  return { calls, proof, storage };
}

test('healthy bound SEA recall signs immediately without reauth or stored password', async t => {
  const { calls, proof } = await setup(t, { recall: pair, hasPassword: false });
  assert.equal((await proof()).authPub, pair.pub);
  assert.deepEqual(calls, []);
});

test('legacy recall miss authenticates the bound public account record and signs', async t => {
  const { calls, proof } = await setup(t, {
    auth({ target, secret, ack, assign }) {
      assert.deepEqual(target, { pub: pair.pub });
      assert.equal(secret, password);
      assign(pair, syntheticAlias);
      ack({ ok: 1 });
    }
  });
  const checked = await proof();
  assert.equal(checked.authPub, pair.pub);
  const payload = await SEA.verify(checked.authProof, pair.pub);
  assert.equal(payload.scope, 'openclaw-helm');
  assert.equal(calls.length, 1);
});

test('ordinary-member recall miss remains alias and password auth', async t => {
  const { calls, proof } = await setup(t, {
    alias: ordinaryAlias,
    auth({ target, ack, assign }) {
      assert.equal(target, ordinaryAlias);
      assign(pair, ordinaryAlias);
      ack({ ok: 1 });
    }
  });
  assert.equal((await proof()).authPub, pair.pub);
  assert.equal(calls.length, 1);
});

test('legacy recall miss with a conflicting stored public key does not reauth', async t => {
  const { calls, proof } = await setup(t, { pub: another.pub });
  assert.equal(await proof(), null);
  assert.deepEqual(calls, []);
});

test('legacy recall miss without a remembered password does not reauth or persist one', async t => {
  const { calls, proof, storage } = await setup(t, { hasPassword: false });
  assert.equal(await proof(), null);
  assert.deepEqual(calls, []);
  assert.equal(storage.has('password'), false);
});

test('legacy fallback does not sign with an unexpected auth public key', async t => {
  const { calls, proof } = await setup(t, {
    auth({ ack, assign }) {
      assign(another, syntheticAlias);
      ack({ ok: 1 });
    }
  });
  assert.equal(await proof(), null);
  assert.equal(calls.length, 1);
});

test('trusted Forge legacy fallback and Portal sign-in use the same published binding', async () => {
  const signIn = await readFile(new URL('../sign-in.html', import.meta.url), 'utf8');
  const [, alias, pub] = signIn.match(/const legacyPub = !creating && alias === '([^']+)'\s*\? '([^']+)'/) ?? [];
  assert.equal(Boolean(alias && pub), true, 'Portal sign-in binding not found');
  assert.equal(source.includes("const LEGACY_OWNER_ALIAS = '" + alias + "';"), true);
  assert.equal(source.includes("const LEGACY_OWNER_PUB = '" + pub + "';"), true);
});

test('legacy fallback does not sign if the authenticated alias differs', async t => {
  const { calls, proof } = await setup(t, {
    auth({ ack, assign }) {
      assign(pair, ordinaryAlias);
      ack({ ok: 1 });
    }
  });
  assert.equal(await proof(), null);
  assert.equal(calls.length, 1);
});

test('legacy fallback does not sign if the local identity changed while authenticating', async t => {
  const { calls, proof } = await setup(t, {
    auth({ ack, assign, storage }) {
      storage.set('alias', ordinaryAlias);
      assign(pair, syntheticAlias);
      ack({ ok: 1 });
    }
  });
  assert.equal(await proof(), null);
  assert.equal(calls.length, 1);
});
