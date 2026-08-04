import assert from 'node:assert/strict';
import test from 'node:test';
import { createLifeSpaceSync, mergeLifeSpacePayloads } from '../life-space/sync.js';

const state = (updatedAt, spaces) => ({ version: 1, updatedAt, activeSpaceId: spaces[0]?.id, spaces });
const space = (id, updatedAt, items = []) => ({ id, name: id, updatedAt, view: { x: 0, y: 0, zoom: 1 }, items, strokes: [] });
const payload = value => ({ format: '3dvr-life-space', version: 1, state: value, files: [] });

function makeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function makeSyncHarness({ replicate = true, signedIn = true } = {}) {
  const localValues = new Map();
  const remoteValues = new Map();
  const localSubscribers = new Map();
  const remoteSubscribers = new Map();
  let shouldReplicate = replicate;

  const notify = (subscribers, path, value) => {
    for (const callback of subscribers.get(path) || []) callback(value);
  };
  const makeNode = (path, values, subscribers, write) => {
    const node = {
      get(key) { return makeNode(`${path}/${key}`, values, subscribers, write); },
      once(callback) { callback(values.get(path) ?? null); return node; },
      on(callback) {
        if (!subscribers.has(path)) subscribers.set(path, new Set());
        subscribers.get(path).add(callback);
        callback(values.get(path) ?? null);
        return {
          off() { subscribers.get(path)?.delete(callback); }
        };
      },
      off() {},
      put(value, callback) {
        values.set(path, value);
        notify(subscribers, path, value);
        write?.(path, value);
        callback?.({ ok: 1 });
        return node;
      }
    };
    return node;
  };

  const remoteRoot = makeNode('user', remoteValues, remoteSubscribers);
  const localRoot = makeNode('user', localValues, localSubscribers, (path, value) => {
    if (!shouldReplicate) return;
    remoteValues.set(path, value);
    notify(remoteSubscribers, path, value);
  });
  const user = {
    is: signedIn ? { pub: 'account' } : null,
    _: signedIn ? { sea: { priv: 'secret' } } : {},
    recall() {},
    auth(_alias, _password, callback) { callback?.({ ok: 1 }); },
    get(key) { return localRoot.get(key); }
  };
  const storage = makeStorage(signedIn ? { signedIn: 'true', alias: 'thomas@3dvr', password: 'secret' } : {});
  const listeners = {};
  const windowObj = {
    Gun(options = {}) {
      if (options.localStorage === false) {
        return { get(key) { assert.equal(key, '~account'); return remoteRoot; } };
      }
      return { user() { return user; } };
    },
    SEA: {
      async encrypt(value) { return `encrypted:${value}`; },
      async decrypt(value) { return value.replace('encrypted:', ''); }
    },
    AuthIdentity: {
      syncStorageFromSharedIdentity() {},
      readSharedIdentity() { return signedIn ? { signedIn: true } : null; }
    },
    localStorage: storage,
    __GUN_PEERS__: ['wss://relay.test/gun'],
    setTimeout,
    clearTimeout,
    addEventListener(name, callback) { listeners[name] = callback; },
    document: { visibilityState: 'visible', addEventListener(name, callback) { listeners[`document:${name}`] = callback; } }
  };

  return {
    localValues,
    remoteValues,
    storage,
    user,
    windowObj,
    setReplicate(value) { shouldReplicate = value; },
    emit(name) { listeners[name]?.(); }
  };
}

test('Life Space account sync merges independent spaces and newer card edits', () => {
  const local = payload(state(30, [space('home', 30, [{ id: 'note', text: 'new', updatedAt: 30 }])]));
  const remote = payload(state(20, [space('home', 20, [{ id: 'note', text: 'old', updatedAt: 20 }]), space('work', 20)]));
  const merged = mergeLifeSpacePayloads(local, remote);
  assert.deepEqual(merged.state.spaces.map(value => value.id), ['home', 'work']);
  assert.equal(merged.state.spaces[0].items[0].text, 'new');
});

test('Life Space account sync respects deletion tombstones', () => {
  const localSpace = { ...space('home', 30), deletedItemIds: ['gone'] };
  const remoteSpace = space('home', 20, [{ id: 'gone', text: 'remote', updatedAt: 20 }]);
  const merged = mergeLifeSpacePayloads(payload(state(30, [localSpace])), payload(state(20, [remoteSpace])));
  assert.equal(merged.state.spaces[0].items.length, 0);
});

test('Life Space writes revision-tagged chunks and verifies them through a cache-free Gun reader', async () => {
  const { remoteValues, windowObj } = makeSyncHarness();
  const sync = createLifeSpaceSync({ windowObj, readTimeoutMs: 0, sessionTimeoutMs: 0 });
  const large = payload(state(1, [space('home', 1, [{ id: 'note', text: 'x'.repeat(30000), updatedAt: 1 }])]));

  assert.equal(await sync.save(large), true);
  const manifest = remoteValues.get('user/life-space-v01/workspace/manifest');
  assert.equal(manifest.schemaVersion, 2);
  assert.ok(manifest.chunks > 1);
  const first = remoteValues.get('user/life-space-v01/workspace/chunks/0');
  assert.equal(first.revision, manifest.revision);
  assert.match(first.value, /^encrypted:/);
  assert.equal(sync.hasPending(), false);
});

test('Life Space seeds an empty signed-in account from the first device with content', async () => {
  const { remoteValues, windowObj } = makeSyncHarness();
  const messages = [];
  const sync = createLifeSpaceSync({ windowObj, onStatus: message => messages.push(message), readTimeoutMs: 0, sessionTimeoutMs: 0 });
  const local = payload(state(10, [space('home', 10, [{ id: 'phone-note', text: 'from phone', updatedAt: 10 }])]));

  assert.deepEqual(await sync.load(local), local);
  assert.match(messages.at(-1), /Uploading this device/);
  assert.equal(await sync.save(local), true);
  assert.equal(remoteValues.get('user/life-space-v01/workspace/manifest').schemaVersion, 2);
});

test('Life Space does not seed a truly empty device when the account read is empty', async () => {
  const { remoteValues, windowObj } = makeSyncHarness();
  const messages = [];
  const sync = createLifeSpaceSync({ windowObj, onStatus: message => messages.push(message), readTimeoutMs: 0, sessionTimeoutMs: 0 });
  const emptyHome = { ...space('space-home', 0), name: 'My Life', updatedAt: undefined };
  const local = payload(state(Date.now(), [emptyHome]));

  assert.equal(await sync.load(local), null);
  assert.equal(messages.at(-1), 'Account sync ready');
  assert.equal(remoteValues.has('user/life-space-v01/workspace/manifest'), false);
});

test('Life Space keeps a pending marker until another Gun instance can reconstruct the save', async () => {
  const harness = makeSyncHarness({ replicate: false });
  const messages = [];
  const sync = createLifeSpaceSync({
    windowObj: harness.windowObj,
    onStatus: message => messages.push(message),
    readTimeoutMs: 5,
    sessionTimeoutMs: 0,
    verifyTimeoutMs: 5
  });
  const local = payload(state(20, [space('home', 20, [{ id: 'note', text: 'must reach relay', updatedAt: 20 }])]));

  assert.equal(await sync.save(local), false);
  assert.equal(sync.hasPending(), true);
  assert.match(messages.at(-1), /pending/i);

  harness.setReplicate(true);
  assert.equal(await sync.retry(), true);
  assert.equal(sync.hasPending(), false);
  assert.equal(messages.at(-1), 'Synced and verified on your account');
});

test('Life Space reads legacy untagged chunk manifests', async () => {
  const harness = makeSyncHarness();
  const remote = payload(state(25, [space('home', 25, [{ id: 'legacy-note', text: 'legacy', updatedAt: 25 }])]));
  const serialized = JSON.stringify(remote);
  const encrypted = `encrypted:${serialized}`;
  harness.localValues.set('user/life-space-v01/workspace/manifest', { schemaVersion: 1, chunks: 1 });
  harness.localValues.set('user/life-space-v01/workspace/chunks/0', { value: encrypted });
  const sync = createLifeSpaceSync({ windowObj: harness.windowObj, readTimeoutMs: 0, sessionTimeoutMs: 0 });
  const local = payload(state(1, [space('home', 1)]));

  const merged = await sync.load(local);
  assert.equal(merged.state.spaces[0].items[0].id, 'legacy-note');
});
