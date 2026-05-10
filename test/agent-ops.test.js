const test = require('node:test');
const assert = require('node:assert/strict');

const {
  claimLease,
  isHandled,
  markHandled,
  releaseLease,
  scopedKey,
  writeHeartbeat,
} = require('../thomas-agent/node/agent-ops');

class FakeGunNode {
  constructor(store, path = []) {
    this.store = store;
    this.path = path;
  }

  get(key) {
    return new FakeGunNode(this.store, [...this.path, key]);
  }

  put(payload, callback) {
    this.store.set(this.path.join('/'), payload);
    callback?.({ ok: true });
  }

  once(callback) {
    callback(this.store.get(this.path.join('/')) || null);
  }
}

function fakeRoot() {
  return new FakeGunNode(new Map());
}

test('agent ops scopes arbitrary ids into stable Gun-safe keys', () => {
  const first = scopedKey('inbox-public-agent-reply', '<message@example.com>');
  const second = scopedKey('inbox-public-agent-reply', '<message@example.com>');
  const other = scopedKey('inbox-public-agent-reply', '<other@example.com>');

  assert.equal(first, second);
  assert.notEqual(first, other);
  assert.match(first, /^inbox-public-agent-reply-[a-f0-9]{24}$/);
});

test('agent ops leases block another device until expiry', async () => {
  const rootNode = fakeRoot();
  const first = await claimLease('inbox', {
    rootNode,
    ownerAlias: 'tenant-a',
    deviceId: 'do-worker',
    now: 1000,
    ttlMs: 5000,
    force: true,
  });
  const blocked = await claimLease('inbox', {
    rootNode,
    ownerAlias: 'tenant-a',
    deviceId: 'termux',
    now: 2000,
    ttlMs: 5000,
    force: true,
  });
  const expired = await claimLease('inbox', {
    rootNode,
    ownerAlias: 'tenant-a',
    deviceId: 'termux',
    now: 7000,
    ttlMs: 5000,
    force: true,
  });

  assert.equal(first.acquired, true);
  assert.equal(blocked.acquired, false);
  assert.equal(blocked.ownerDeviceId, 'do-worker');
  assert.equal(expired.acquired, true);
  assert.equal(expired.lease.deviceId, 'termux');
});

test('agent ops handled records dedupe completed actions', async () => {
  const rootNode = fakeRoot();
  const before = await isHandled('inbox-lead-reply', 'message-1', {
    rootNode,
    ownerAlias: 'tenant-a',
    force: true,
  });
  const marked = await markHandled('inbox-lead-reply', 'message-1', {
    to: 'lead@example.com',
  }, {
    rootNode,
    ownerAlias: 'tenant-a',
    deviceId: 'do-worker',
    now: 1000,
    force: true,
  });
  const after = await isHandled('inbox-lead-reply', 'message-1', {
    rootNode,
    ownerAlias: 'tenant-a',
    force: true,
  });

  assert.equal(before.handled, false);
  assert.equal(marked.marked, true);
  assert.equal(after.handled, true);
  assert.equal(after.record.deviceId, 'do-worker');
  assert.deepEqual(after.record.details, { to: 'lead@example.com' });
});

test('agent ops can release a held lease and write device heartbeat', async () => {
  const rootNode = fakeRoot();
  const lease = await claimLease('public-agent-reply', {
    rootNode,
    ownerAlias: 'tenant-a',
    deviceId: 'do-worker',
    now: 1000,
    ttlMs: 5000,
    force: true,
  });
  const released = await releaseLease('public-agent-reply', lease.lease.token, {
    rootNode,
    ownerAlias: 'tenant-a',
    now: 2000,
    force: true,
  });
  const heartbeat = await writeHeartbeat('inbox-monitor', {
    rootNode,
    ownerAlias: 'tenant-a',
    deviceId: 'do-worker',
    now: 3000,
    status: 'running',
    force: true,
    metadata: { mailbox: 'INBOX' },
  });

  assert.equal(released.released, true);
  assert.equal(heartbeat.ok, true);
  assert.equal(heartbeat.payload.deviceId, 'do-worker');
  assert.deepEqual(heartbeat.payload.metadata, { mailbox: 'INBOX' });
});
