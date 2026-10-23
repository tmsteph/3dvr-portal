import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/auth/sea.js';
import SEA from 'gun/sea.js';
import { openCellInvitations } from '../cell/invitations.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 35));
function network() {
  const values = new Map();
  const streams = new Set();
  const writes = [];
  let online = true;
  let acknowledgeShares = true;
  function node(owner, path = [], writer = '') {
    const prefix = `${owner}/${path.join('/')}`;
    return {
      get(key) { return node(owner, [...path, key], writer); },
      put(value, ack) {
        assert.equal(writer, owner, 'cannot write another account graph');
        if (!online) { ack?.({err:'offline'}); return; }
        values.set(prefix, structuredClone(value)); writes.push({path:prefix, value:structuredClone(value)});
        for (const stream of streams) {
          const parent = prefix.slice(0, prefix.lastIndexOf('/'));
          if (stream.prefix === parent) stream.callback(structuredClone(value), path.at(-1));
        }
        if (acknowledgeShares || !prefix.includes('/shares/')) ack?.({ok:1});
      },
      map() {
        let subscription;
        return {
          on(callback) {
            subscription = {prefix, callback}; streams.add(subscription);
            for (const [key, value] of values) {
              if (key.startsWith(prefix + '/') && !key.slice(prefix.length + 1).includes('/')) {
                callback(structuredClone(value), key.slice(prefix.length + 1));
              }
            }
          },
          off() { streams.delete(subscription); }
        };
      }
    };
  }
  return {
    values, writes, online(value) { online = value; },
    acknowledgeShares(value) { acknowledgeShares = value; },
    async account() {
      const pair = await SEA.pair();
      const data = new Map([['signedIn','true'],['userPubKey',pair.pub],['alias','test-account']]);
      const storage = {data, get length(){return data.size;}, key:i=>[...data.keys()][i],
        getItem:key=>data.get(key) ?? null, setItem:(key,value)=>data.set(key,value)};
      const user = {...node(pair.pub, [], pair.pub), is:{pub:pair.pub}};
      const gun = {user:pub=>node(pub)};
      const account = {pair, user, gun, sea:SEA};
      const shared = new Map();
      const members = new Map();
      const options = {getAccount:async()=>account, storage, timeoutMs:25,
        onSharedCell:(record,id)=>record ? shared.set(id,record) : shared.delete(id),
        onMembers:(id,list)=>members.set(id,list)};
      return {pair, storage, user, shared, members, options};
    }
  };
}
const cell = {id:'test-cell', name:'Secret Cell title', purpose:'Private invitation purpose',
  focus:'Builder community', size:'10 people', updatedAt:'2026-10-23T01:00:00.000Z'};

test('recipient-bound invitation grants live read-only access and revocation stops future updates', async () => {
  const net = network();
  const owner = await net.account();
  const member = await net.account();
  const outsider = await net.account();
  const host = await openCellInvitations(owner.options);
  const guest = await openCellInvitations(member.options);
  const other = await openCellInvitations(outsider.options);
  try {
    const invite = await host.invite(cell, await guest.memberCode(), 'https://portal.test/cell/');
    assert.equal(invite.pendingSync, false);
    await assert.rejects(other.accept(invite.url), /another account/);
    await guest.accept(invite.url);
    assert.equal([...member.shared.values()][0].name, cell.name);
    assert.equal([...member.shared.values()][0].readOnly, true);
    await assert.rejects(guest.invite({...cell,readOnly:true}, await other.memberCode(), invite.url), /Only the Cell owner/);
    await host.publishCell({...cell,name:'Updated private title',updatedAt:'2026-10-24T01:00:00.000Z'});
    await flush();
    assert.equal([...member.shared.values()][0].name, 'Updated private title');
    const grant = owner.members.get(cell.id)[0];
    await host.revoke(grant.id);
    await flush();
    assert.equal(member.shared.size, 0);
    const shareCount = net.writes.filter(x=>x.path.includes('/shares/')).length;
    await host.publishCell({...cell,name:'After revocation',updatedAt:'2026-10-25T01:00:00.000Z'});
    assert.equal(net.writes.filter(x=>x.path.includes('/shares/')).length, shareCount);
    await assert.rejects(guest.accept(invite.url), /revoked/);
    const persisted = JSON.stringify([...net.values, ...owner.storage.data, ...member.storage.data]);
    assert.doesNotMatch(persisted,/Secret Cell title|Private invitation purpose|Updated private title|After revocation/);
    assert.ok(net.writes.every(x=>Object.keys(x.value).join(',')==='ciphertext'));
  } finally {host.close();guest.close();other.close();}
});

test('signed account codes reject tampering; accepted memberships restore with owner signatures', async () => {
  const net = network();
  const owner = await net.account();
  const member = await net.account();
  const host = await openCellInvitations(owner.options);
  let guest = await openCellInvitations(member.options);
  try {
    const code = await guest.memberCode();
    const tampered = JSON.parse(decodeURIComponent(code.split('3dvr-cell-member:')[1]));
    tampered.pub = owner.pair.pub;
    await assert.rejects(host.invite(cell,'3dvr-cell-member:'+encodeURIComponent(JSON.stringify(tampered)),'https://portal.test/cell/'),/verified/);
    const invite = await host.invite(cell,code,'https://portal.test/cell/');
    await guest.accept(invite.url);
    guest.close(); member.shared.clear();
    guest = await openCellInvitations(member.options);
    await flush();
    assert.equal([...member.shared.values()][0].purpose,cell.purpose);
    host.close();
  } finally { host.close();guest.close(); }
});

test('offline invitation intent retries after reopening without leaking plaintext', async () => {
  const net = network();
  const owner = await net.account();
  const member = await net.account();
  let host = await openCellInvitations(owner.options);
  const guest = await openCellInvitations(member.options);
  try {
    net.online(false);
    const invite = await host.invite(cell,await guest.memberCode(),'https://portal.test/cell/');
    assert.equal(invite.pendingSync,true);
    host.close();net.online(true);
    host = await openCellInvitations(owner.options);
    await host.retryPending();
    await guest.accept(invite.url);
    assert.equal(member.shared.size,1);
  } finally {host.close();guest.close();}
});

test('account change during invitation encryption prevents shared writes', async () => {
  const net = network();
  const owner = await net.account();
  const member = await net.account();
  const guest = await openCellInvitations(member.options);
  const realAccount = await owner.options.getAccount();
  let change = false;
  const sea = {...SEA, async encrypt(...args) {
    if (change) owner.storage.setItem('userPubKey',member.pair.pub);
    return SEA.encrypt(...args);
  }};
  const host = await openCellInvitations({...owner.options,getAccount:async()=>({...realAccount,sea})});
  try {
    change=true;
    await assert.rejects(host.invite(cell,await guest.memberCode(),'https://portal.test/cell/'),/Account changed/);
    assert.equal(net.writes.filter(x=>x.path.includes('/shares/')).length,0);
  } finally {host.close();guest.close();}
});

test('background share retries do not delay recording owner revocation intent', async () => {
  const net = network();
  const owner = await net.account();
  const member = await net.account();
  const host = await openCellInvitations({...owner.options,timeoutMs:150});
  const guest = await openCellInvitations(member.options);
  try {
    net.acknowledgeShares(false);
    await host.invite(cell,await guest.memberCode(),'https://portal.test/cell/');
    const grant = owner.members.get(cell.id)[0];
    const retry = host.retryPending();
    const revoke = host.revoke(grant.id);
    await flush();
    assert.equal(owner.members.get(cell.id)[0].revoked,true);
    await Promise.all([retry,revoke]);
  } finally {host.close();guest.close();}
});
