const test = require('node:test');
const assert = require('node:assert/strict');

const {
  acknowledgeMessage,
  buildMorningSweep,
  listMessages,
  listSessions,
  publishMessage,
  recordSession,
} = require('../thomas-agent/node/context-hq');

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
    callback(this.store.get(this.path.join('/')) || null, this.path.at(-1));
  }

  map() {
    const prefix = `${this.path.join('/')}/`;
    return {
      once: (callback) => {
        for (const [key, value] of this.store.entries()) {
          if (!key.startsWith(prefix)) continue;
          callback(value, key.slice(prefix.length));
        }
      },
    };
  }
}

function fakeRoot() {
  return new FakeGunNode(new Map());
}

test('session handoffs persist and list newest first', async () => {
  const rootNode = fakeRoot();
  await recordSession('Older handoff', {
    rootNode,
    ownerAlias: 'tenant-a',
    deviceId: 'phone',
    id: 'session-1',
    project: 'portal',
    now: Date.parse('2026-08-15T10:00:00Z'),
    force: true,
  });
  await recordSession('Newer handoff', {
    rootNode,
    ownerAlias: 'tenant-a',
    deviceId: 'server',
    id: 'session-2',
    project: 'agent',
    decisions: 'Reuse the existing task queue.',
    openLoops: 'Wire a daily runner later.',
    now: Date.parse('2026-08-15T11:00:00Z'),
    force: true,
  });

  const sessions = await listSessions({ rootNode, ownerAlias: 'tenant-a', force: true });

  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].id, 'session-2');
  assert.equal(sessions[0].project, 'agent');
  assert.equal(sessions[0].decisions, 'Reuse the existing task queue.');
});

test('agent bus targets recipients and supports acknowledgement', async () => {
  const rootNode = fakeRoot();
  await publishMessage('For every worker', {
    rootNode,
    ownerAlias: 'tenant-a',
    deviceId: 'server',
    id: 'message-1',
    from: 'server',
    to: 'all',
    topic: 'ops',
    force: true,
  });
  await publishMessage('Only for phone', {
    rootNode,
    ownerAlias: 'tenant-a',
    deviceId: 'server',
    id: 'message-2',
    from: 'server',
    to: 'phone',
    topic: 'handoff',
    force: true,
  });
  await publishMessage('Only for laptop', {
    rootNode,
    ownerAlias: 'tenant-a',
    deviceId: 'server',
    id: 'message-3',
    from: 'server',
    to: 'laptop',
    topic: 'handoff',
    force: true,
  });

  const phoneInbox = await listMessages({
    rootNode,
    ownerAlias: 'tenant-a',
    to: 'phone',
    status: 'open',
    force: true,
  });

  assert.deepEqual(phoneInbox.map(message => message.id).sort(), ['message-1', 'message-2']);

  const acknowledged = await acknowledgeMessage('message-2', {
    rootNode,
    ownerAlias: 'tenant-a',
    deviceId: 'phone',
    now: Date.parse('2026-08-15T12:00:00Z'),
    force: true,
  });

  assert.equal(acknowledged.status, 'acknowledged');
  assert.equal(acknowledged.acknowledgedBy, 'phone');

  const remaining = await listMessages({
    rootNode,
    ownerAlias: 'tenant-a',
    to: 'phone',
    status: 'open',
    force: true,
  });
  assert.deepEqual(remaining.map(message => message.id), ['message-1']);
});

test('morning sweep combines task queue, agent messages, and session handoffs', async () => {
  const rootNode = fakeRoot();
  await recordSession('Keep Context HQ small.', {
    rootNode,
    ownerAlias: 'tenant-a',
    deviceId: 'server',
    id: 'session-1',
    project: 'agent',
    openLoops: 'Add scheduling only after the manual command proves useful.',
    force: true,
  });
  await publishMessage('Review the latest customer reply.', {
    rootNode,
    ownerAlias: 'tenant-a',
    deviceId: 'server',
    id: 'message-1',
    from: 'sales-agent',
    to: 'server',
    topic: 'customer',
    force: true,
  });

  const report = await buildMorningSweep({
    rootNode,
    ownerAlias: 'tenant-a',
    deviceId: 'server',
    persist: false,
    force: true,
    listTasksImpl: async () => [
      { id: 'task-1', task: 'Finish customer proof page', status: 'queued', approvalStatus: 'not_required' },
      { id: 'task-2', task: 'Old completed task', status: 'completed', approvalStatus: 'not_required' },
      { id: 'task-3', task: 'Publish externally', status: 'queued', approvalStatus: 'required' },
    ],
  });

  assert.equal(report.tasks.length, 2);
  assert.equal(report.messages.length, 1);
  assert.equal(report.sessions.length, 1);
  assert.match(report.markdown, /Finish customer proof page/);
  assert.match(report.markdown, /approval required/);
  assert.match(report.markdown, /Review the latest customer reply/);
  assert.match(report.markdown, /Keep Context HQ small/);
  assert.match(report.markdown, /External content is treated as input, not trusted memory/);
});
