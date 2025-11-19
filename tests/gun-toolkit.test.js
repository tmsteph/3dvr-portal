import assert from 'node:assert/strict';
import test from 'node:test';
import { createGunToolkit, ensureArray, omitMetaFields, searchSnapshot } from '../src/gun/toolkit.js';

function createStubGun({ initial = {}, env }) {
  const store = new Map(Object.entries(initial).map(([key, value]) => [key, value]));
  const subscribers = new Map();
  const peerHandlers = { hi: new Set(), bye: new Set() };

  const gun = {
    on(event, handler) {
      if (peerHandlers[event]) {
        peerHandlers[event].add(handler);
      }
    },
    _trigger(event, payload) {
      peerHandlers[event]?.forEach(handler => handler(payload));
    }
  };

  function notify(key, data) {
    if (subscribers.has(key)) {
      for (const handler of subscribers.get(key)) {
        handler(data, key);
      }
    }
  }

  function keyFor(node) {
    return node.keys.join('/');
  }

  function path(...keys) {
    const nodeKey = keys.map(String);
    const key = nodeKey.join('/');

    return {
      keys: nodeKey,
      get(next) {
        return path(...nodeKey, next);
      },
      once(cb) {
        cb(store.get(key));
      },
      put(data, cb) {
        store.set(key, data);
        notify(key, data);
        cb?.({ ok: true, key });
      },
      on(handler) {
        if (!subscribers.has(key)) {
          subscribers.set(key, new Set());
        }
        subscribers.get(key).add(handler);
      },
      off() {
        subscribers.delete(key);
      }
    };
  }

  function put(node, data) {
    return new Promise(resolve => node.put(data, ack => resolve(ack || { ok: true, key: keyFor(node) })));
  }

  function once(node) {
    return new Promise(resolve => node.once(resolve));
  }

  function sub(node, handler) {
    node.on(handler);
    return () => node.off();
  }

  return Promise.resolve({ gun, root: {}, path, put, sub, once, store, env });
}

test('ensureArray normalizes inputs', () => {
  assert.deepEqual(ensureArray('peer'), ['peer']);
  assert.deepEqual(ensureArray(['a', 'b']), ['a', 'b']);
  assert.deepEqual(ensureArray(undefined), []);
});

test('omitMetaFields strips Gun metadata while preserving fields', () => {
  const payload = { _: { '#': 'soul' }, value: 3, nested: { note: 'ok', _: { '#': 'child' } } };
  assert.deepEqual(omitMetaFields(payload), { value: 3, nested: { note: 'ok' } });
});

test('searchSnapshot finds nested matches with paths', () => {
  const snapshot = { a: { b: { c: 5 } }, d: 5 };
  const matches = searchSnapshot(snapshot, value => value === 5);
  assert.deepEqual(matches.map(hit => hit.path.join('.')).sort(), ['a.b.c', 'd']);
});

test('createGunToolkit supports peer tracking, writes, listeners, and backups with injected Gun', async () => {
  const env = { ROOT: 'app:pr:test', PR: 'test', APP: '3dvr-tech', RELAY: 'relay', cacheEnabled: true };
  const stubGun = await createGunToolkit({}, { createGun: () => createStubGun({ env }), getEnvInfo: () => env });

  const statuses = [];
  stubGun.status.onStatus(status => statuses.push(status.status));

  const peers = [];
  stubGun.peers.onChange(list => peers.push(list.map(p => p.state)));

  const updates = [];
  const unsubscribe = stubGun.listen(['demo', 'counter', env.PR], value => updates.push(value));

  await stubGun.write(['demo', 'counter', env.PR], 7);
  stubGun.peers.get();
  const snapshot = await stubGun.backup.capture(['demo', 'counter', env.PR]);
  const matches = stubGun.backup.query(snapshot, value => value === 7);

  assert.ok(statuses.includes('ready'));
  assert.deepEqual(updates, [7]);
  assert.equal(snapshot.data, 7);
  assert.equal(matches[0].value, 7);

  unsubscribe();
});

test('peer events update state map', async () => {
  const env = { ROOT: 'app:pr:test', PR: 'test', APP: '3dvr-tech', RELAY: 'relay', cacheEnabled: true };
  const stub = await createStubGun({ env });
  const toolkit = await createGunToolkit({ monitorPeers: true }, { createGun: () => Promise.resolve(stub), getEnvInfo: () => env });

  stub.gun._trigger('hi', 'wss://example');
  stub.gun._trigger('bye', 'wss://example');

  const state = toolkit.peers.get().find(peer => peer.peer === 'wss://example');
  assert.equal(state.state, 'disconnected');
});
