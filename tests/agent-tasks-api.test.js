import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAgentTasksHandler,
  enqueuePortalAgentTask,
  normalizeAgentTaskPayload
} from '../api/agent/tasks.js';

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
}

function createFakeGun() {
  const store = new Map();
  return {
    store,
    gun: new FakeGunNode(store)
  };
}

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end(payload) {
      this.ended = true;
      this.body = payload ?? this.body;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    }
  };
}

test('normalizeAgentTaskPayload builds tenant-aware queued task records', () => {
  const record = normalizeAgentTaskPayload({
    task: 'Update the landing page',
    identity: {
      authProvider: 'google',
      sub: '123',
      alias: 'builder@example.com'
    },
    tenantPlan: 'builder',
    backend: 'codex',
    risk: 'workspace_write',
    requires: 'codex,node'
  }, {
    now: Date.parse('2026-05-11T12:00:00.000Z'),
    entropy: 'abc123'
  });

  assert.equal(record.status, 'queued');
  assert.equal(record.tenantId, 'google:123');
  assert.equal(record.tenantAlias, 'builder@example.com');
  assert.equal(record.tenantPlan, 'builder');
  assert.equal(record.backend, 'codex');
  assert.equal(record.riskClass, 'workspace_write');
  assert.equal(record.approvalStatus, 'not_required');
  assert.equal(record.requiredCapabilities, 'codex,node');
  assert.equal(record.createdAt, '2026-05-11T12:00:00.000Z');
});

test('normalizeAgentTaskPayload marks high-risk tasks as approval required unless unsafe', () => {
  const blocked = normalizeAgentTaskPayload({
    task: 'Publish the site',
    risk: 'external_write',
    backend: 'codex'
  }, {
    now: Date.parse('2026-05-11T12:00:00.000Z'),
    entropy: 'abc123'
  });
  const approved = normalizeAgentTaskPayload({
    task: 'Publish the site',
    risk: 'external_write',
    backend: 'codex',
    unsafe: true
  }, {
    now: Date.parse('2026-05-11T12:00:00.000Z'),
    entropy: 'abc123'
  });

  assert.equal(blocked.approvalStatus, 'required');
  assert.equal(approved.approvalStatus, 'approved');
});

test('enqueuePortalAgentTask writes task and latest summary under managed queue owner', async () => {
  const fake = createFakeGun();
  const result = await enqueuePortalAgentTask({
    task: 'Research the customer',
    tenantId: 'email:user@example.com',
    tenantAlias: 'user@example.com',
    backend: 'openai',
    risk: 'read_only'
  }, {
    gun: fake.gun,
    now: Date.parse('2026-05-11T12:00:00.000Z'),
    entropy: 'abc123'
  }, {
    THREEDVR_AGENT_SHARED_OWNER_ALIAS: '3dvr-managed'
  });

  const taskPath = `3dvr-portal/agentOps/3dvr-managed/taskQueue/tasks/${result.task.id}`;
  const latestPath = `3dvr-portal/agentOps/3dvr-managed/taskQueue/latest/${result.task.id}`;

  assert.equal(result.ok, true);
  assert.equal(result.queueOwnerAlias, '3dvr-managed');
  assert.equal(fake.store.get(taskPath).tenantId, 'email:user@example.com');
  assert.equal(fake.store.get(taskPath).backend, 'openai');
  assert.equal(fake.store.get(latestPath).status, 'queued');
});

test('agent tasks handler returns 202 for queued portal requests', async () => {
  const fake = createFakeGun();
  const handler = createAgentTasksHandler({
    gun: fake.gun,
    now: Date.parse('2026-05-11T12:00:00.000Z'),
    entropy: 'abc123'
  }, {
    THREEDVR_AGENT_SHARED_OWNER_ALIAS: '3dvr-managed'
  });
  const res = createMockRes();

  await handler({
    method: 'POST',
    body: {
      task: 'Summarize this support request',
      tenantId: 'guest:abc',
      risk: 'draft'
    }
  }, res);

  assert.equal(res.statusCode, 202);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.task.tenantId, 'guest:abc');
  assert.equal(res.headers['Access-Control-Allow-Methods'], 'POST, OPTIONS');
});
