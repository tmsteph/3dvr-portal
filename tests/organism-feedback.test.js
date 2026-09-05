import assert from 'node:assert/strict';
import test from 'node:test';

import { createOrganismBridgeHandler } from '../src/organism/bridge.js';
import { approveRetrievalOnOvh } from '../src/organism/remote.js';

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
      requestId: 'feedback-1'
    }),
    approveImpl: async (query, memoryId) => { approved = { query, memoryId }; },
    recallImpl: async () => { recalled = true; return {}; }
  });
  const res = fakeResponse();
  await handler({
    method: 'POST',
    url: '/recall',
    body: { organismFeedback: true }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { ok: true, requestId: 'feedback-1', memoryId: 'mem-1' });
  assert.deepEqual(approved, { query: 'Which memory was right?', memoryId: 'mem-1' });
  assert.equal(recalled, false);
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
      return { stdout: JSON.stringify({ ok: true, memoryId: 'mem-safe-1' }) };
    }
  });

  assert.deepEqual(result, { ok: true, memoryId: 'mem-safe-1' });
  assert.equal(invocation.file, 'ssh');
  const approveIndex = invocation.args.indexOf('approve');
  assert.ok(approveIndex > -1);
  assert.equal(invocation.args[approveIndex + 2], 'mem-safe-1');
  assert.equal(Buffer.from(invocation.args[approveIndex + 1], 'base64url').toString('utf8'), 'what did we decide?');
});
