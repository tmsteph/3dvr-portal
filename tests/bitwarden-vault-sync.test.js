import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcile, publish } from '../scripts/ops/sync-bitwarden-vault.mjs';
const item = { id: 'a123', type: 1, name: 'Example', login: { username: 'owner', password: 'new', uris: [] } };
test('renames keep the previous alias while deleted items are tombstoned', () => {
 const previous = { items: [{ sourceItemId: 'a123', key: 'VAULT_ITEM__OLD' }, { sourceItemId: 'deleted', key: 'VAULT_ITEM__DELETED' }] };
 const plan = reconcile({ items: [{ ...item, name: 'Renamed' }] }, previous);
 assert.equal(plan.records[0].key, 'VAULT_ITEM__OLD');
 assert.equal(plan.index.items[0].key, 'VAULT_ITEM__OLD');
 assert.deepEqual(JSON.parse(plan.retired[0].value), { deleted: true, source: 'bitwarden-password-manager' });
 assert.equal(plan.retired[0].key, 'VAULT_ITEM__DELETED');
});
test('invalid snapshots cannot retire credentials', () => {
 assert.throws(() => reconcile({}));
 assert.throws(() => reconcile({ items: [{ type: 1 }] }));
 assert.throws(() => reconcile({ items: [item, item] }));
});
test('root items are retired when they become excluded', () => {
 const plan = reconcile({ items: [{ ...item, name: 'Bitwarden master password' }] },
  { items: [{ sourceItemId: item.id, key: 'VAULT_ITEM__OLD' }] });
 assert.equal(plan.records.length, 0);
 assert.equal(plan.retired.length, 1);
});
test('index is withheld after any read-back failure', async () => {
 const writes = [];
 await assert.rejects(publish({ records: [{ key: 'item', value: 'value' }], retired: [], index: {} }, {
  write: async key => writes.push(key), verify: async () => { throw Error('read-back failure'); },
 }));
 assert.deepEqual(writes, ['item']);
});
test('index publishes after all active and retired values verify', async () => {
 const order = [];
 await publish({ records: [{ key: 'current', value: 'v' }], retired: [{ key: 'old', value: 't' }], index: {} }, {
  write: async key => order.push('write:'+key), verify: async key => order.push('verify:'+key),
 });
 assert.deepEqual(order, ['write:current','verify:current','write:old','verify:old','write:VAULT_INDEX','verify:VAULT_INDEX']);
});
