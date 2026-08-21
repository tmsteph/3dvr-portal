const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseTaskTopic,
  routeMessage,
  shouldRouteMessage,
} = require('../thomas-agent/node/context-task-router');

test('task topics map to explicit risk classes', () => {
  assert.deepEqual(parseTaskTopic('task'), { matches: true, riskClass: 'draft' });
  assert.deepEqual(parseTaskTopic('task:workspace-write'), { matches: true, riskClass: 'workspace_write' });
  assert.deepEqual(parseTaskTopic('task:money'), { matches: true, riskClass: 'money' });
  assert.equal(parseTaskTopic('execution').matches, false);
  assert.equal(parseTaskTopic('task:unknown').matches, false);
});

test('router only accepts explicit open tasks addressed to do-worker', () => {
  assert.equal(shouldRouteMessage({
    id: 'm1',
    status: 'open',
    to: 'do-worker',
    topic: 'task',
    body: 'Prepare the next release notes.',
  }).ok, true);

  assert.equal(shouldRouteMessage({
    id: 'm2',
    status: 'open',
    to: 'all',
    topic: 'task',
    body: 'Do not auto-route broadcasts.',
  }).ok, false);

  assert.equal(shouldRouteMessage({
    id: 'm3',
    status: 'open',
    to: 'do-worker',
    topic: 'execution',
    body: 'Existing Context HQ operating note.',
  }).ok, false);
});

test('router creates deterministic managed task and acknowledges source message', async () => {
  const calls = { enqueue: [], mark: [], ack: [] };
  const result = await routeMessage({
    id: 'message-123',
    status: 'open',
    from: 'founder-agent',
    to: 'do-worker',
    topic: 'task:workspace_write',
    body: 'Update the public status page with the latest release.',
  }, {
    contextOwnerAlias: 'founder-context',
    taskOwnerAlias: 'managed-work',
    isHandledImpl: async () => ({ handled: false }),
    enqueueTaskImpl: async (body, options) => {
      calls.enqueue.push({ body, options });
      return { id: options.id };
    },
    markHandledImpl: async (...args) => {
      calls.mark.push(args);
      return { marked: true };
    },
    acknowledgeMessageImpl: async (...args) => {
      calls.ack.push(args);
      return { status: 'acknowledged' };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.routed, true);
  assert.equal(result.riskClass, 'workspace_write');
  assert.equal(result.approvalStatus, 'not_required');
  assert.match(result.taskId, /^context-task-/);
  assert.equal(calls.enqueue.length, 1);
  assert.equal(calls.enqueue[0].options.ownerAlias, 'managed-work');
  assert.equal(calls.enqueue[0].options.requestedBy, 'context:founder-agent');
  assert.equal(calls.mark.length, 1);
  assert.equal(calls.ack.length, 1);
  assert.equal(calls.ack[0][1].ownerAlias, 'founder-context');
});

test('money tasks are queued but require approval', async () => {
  let enqueueOptions;
  const result = await routeMessage({
    id: 'money-1',
    status: 'open',
    from: 'founder-agent',
    to: 'do-worker',
    topic: 'task:money',
    body: 'Prepare a charge for review.',
  }, {
    isHandledImpl: async () => ({ handled: false }),
    enqueueTaskImpl: async (body, options) => {
      enqueueOptions = options;
      return { id: options.id };
    },
    markHandledImpl: async () => ({ marked: true }),
    acknowledgeMessageImpl: async () => ({ status: 'acknowledged' }),
  });

  assert.equal(result.riskClass, 'money');
  assert.equal(result.approvalStatus, 'required');
  assert.equal(enqueueOptions.approvalStatus, 'required');
});

test('already handled messages do not enqueue twice', async () => {
  let enqueueCount = 0;
  const result = await routeMessage({
    id: 'message-repeat',
    status: 'open',
    to: 'do-worker',
    topic: 'task',
    body: 'Generate a draft.',
  }, {
    isHandledImpl: async () => ({ handled: true, record: { details: { taskId: 'existing-task' } } }),
    enqueueTaskImpl: async () => {
      enqueueCount += 1;
      return { id: 'should-not-happen' };
    },
  });

  assert.equal(result.skipped, true);
  assert.equal(result.taskId, 'existing-task');
  assert.equal(enqueueCount, 0);
});
