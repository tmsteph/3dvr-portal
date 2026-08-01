import assert from 'node:assert/strict';
import test from 'node:test';
import { createLifeSpaceSync, mergeLifeSpacePayloads } from '../life-space/sync.js';

const state = (updatedAt, spaces) => ({ version: 1, updatedAt, activeSpaceId: spaces[0]?.id, spaces });
const space = (id, updatedAt, items = []) => ({ id, name: id, updatedAt, view: { x: 0, y: 0, zoom: 1 }, items, strokes: [] });
const payload = value => ({ format: '3dvr-life-space', version: 1, state: value, files: [] });

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

test('Life Space encrypts and chunks account backups before writing them', async () => {
  const values = new Map();
  const makeNode = path => ({
    get(key) { return makeNode(`${path}/${key}`); },
    once(callback) { callback(values.get(path) || null); },
    put(value, callback) { values.set(path, value); callback({ ok: 1 }); }
  });
  const root = makeNode('root');
  const user = { is: { pub: 'account' }, _: { sea: { priv: 'secret' } }, recall() {}, get() { return root; } };
  const windowObj = {
    Gun() { return { user() { return user; } }; },
    SEA: { async encrypt(value) { return `encrypted:${value}`; }, async decrypt(value) { return value.replace('encrypted:', ''); } },
    AuthIdentity: { syncStorageFromSharedIdentity() {} }, localStorage: {}, __GUN_PEERS__: [], setTimeout
  };
  const sync = createLifeSpaceSync({ windowObj });
  const large = payload(state(1, [space('home', 1, [{ id: 'note', text: 'x'.repeat(30000), updatedAt: 1 }])]));
  assert.equal(await sync.save(large), true);
  assert.ok(values.get('root/workspace/manifest').chunks > 1);
  assert.match(values.get('root/workspace/chunks/0').value, /^encrypted:/);
});
