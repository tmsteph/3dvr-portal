import assert from 'node:assert/strict';
import test from 'node:test';

import { createOrganismBridgeHandler } from '../src/organism/bridge.js';
import { approveRetrievalOnOvh, rejectRetrievalOnOvh } from '../src/organism/remote.js';

function fakeResponse() {
  return {
    statusCode: 200,
    headers: {},
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

test('owner bridge routes an explicitly signed feedback request to approval, not recall', async () => {
  let approved = null;
  let recalled = false;
  const handler = createOrganismBridgeHandler({
    feedbackAccessImpl: async () => ({
      ok: true,
      query: 'Which memory was right?',
      memoryId: 'mem-1',
      requestId: 'feedback-1',
      outcome: 'approved'
    }),
    approveImpl: async (query, memoryId) => { approved = { query, memoryId }; return { duplicate: false }; },
    rejectImpl: async () => { throw new Error('reject transport should not run'); },
    recallImpl: async () => { recalled = true; return {}; }
  });
  const res = fakeResponse();
  await handler({
    method: 'POST',
    url: '/recall',
    body: { organismFeedback: true }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { ok: true, requestId: 'feedback-1', memoryId: 'mem-1', outcome: 'approved', duplicate: false });
  assert.deepEqual(approved, { query: 'Which memory was right?', memoryId: 'mem-1' });
  assert.equal(recalled, false);
});

test('owner bridge routes signed rejection to reject transport and never approval', async () => {
  let rejected = null;
  let approved = false;
  const handler = createOrganismBridgeHandler({
    feedbackAccessImpl: async () => ({
      ok: true,
      query: 'Which memory was wrong?',
      memoryId: 'mem-2',
      requestId: 'feedback-2',
      outcome: 'rejected'
    }),
    approveImpl: async () => { approved = true; },
    rejectImpl: async (query, memoryId) => { rejected = { query, memoryId }; return { duplicate: false }; }
  });
  const res = fakeResponse();
  await handler({ method: 'POST', url: '/feedback', body: { organismFeedback: true } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(approved, false);
  assert.deepEqual(rejected, { query: 'Which memory was wrong?', memoryId: 'mem-2' });
  assert.equal(res.payload.outcome, 'rejected');
});

test('owner bridge never invokes approval when feedback authorization fails', async () => {
  let approved = false;
  const handler = createOrganismBridgeHandler({
    feedbackAccessImpl: async () => ({ ok: false, status: 403, reason: 'wrong memory id' }),
    approveImpl: async () => { approved = true; }
  });
  const res = fakeResponse();
  await handler({ method: 'POST', url: '/recall', body: { organismFeedback: true } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(approved, false);
});

test('OVH approval transport sends the query encoded and memory id as separate argv', async () => {
  let invocation;
  const result = await approveRetrievalOnOvh('what did we decide?', 'mem-safe-1', {
    sshHost: '3dvr-ovh',
    remoteScript: '/private/bridge.js',
    execFileImpl: async (file, args, options) => {
      invocation = { file, args, options };
      return { stdout: JSON.stringify({ ok: true, memoryId: 'mem-safe-1', outcome: 'approved', duplicate: false }) };
    }
  });

  assert.deepEqual(result, { ok: true, memoryId: 'mem-safe-1', outcome: 'approved', duplicate: false });
  assert.equal(invocation.file, 'ssh');
  const approveIndex = invocation.args.indexOf('approve');
  assert.ok(approveIndex > -1);
  assert.equal(invocation.args[approveIndex + 2], 'mem-safe-1');
  assert.equal(Buffer.from(invocation.args[approveIndex + 1], 'base64url').toString('utf8'), 'what did we decide?');
});


test('OVH rejection transport uses a separate reject command', async () => {
  let invocation;
  const result = await rejectRetrievalOnOvh('what was irrelevant?', 'mem-safe-2', {
    sshHost: '3dvr-ovh',
    remoteScript: '/private/bridge.js',
    execFileImpl: async (file, args) => {
      invocation = { file, args };
      return { stdout: JSON.stringify({ ok: true, memoryId: 'mem-safe-2', outcome: 'rejected', duplicate: false }) };
    }
  });
  assert.equal(result.outcome, 'rejected');
  const rejectIndex = invocation.args.indexOf('reject');
  assert.ok(rejectIndex > -1);
  assert.equal(invocation.args[rejectIndex + 2], 'mem-safe-2');
  assert.equal(Buffer.from(invocation.args[rejectIndex + 1], 'base64url').toString('utf8'), 'what was irrelevant?');
});
