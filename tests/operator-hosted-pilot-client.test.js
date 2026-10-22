import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostedPilotClient } from '../operator/hosted-pilot-client.js';

test('mobile client signs each action and task fields', async () => {
  const calls = [];
  const client = createHostedPilotClient({
    sign: async (scope, action, fields) => {
      calls.push({ scope, action, fields });
      return { authPub: 'alice.pub', authProof: 'signed-proof' };
    },
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(url, '/api/hosted-operator');
      assert.equal(init.credentials, 'same-origin');
      assert.equal(body.authPub, 'alice.pub');
      return { ok: true, json: async () => ({ status: body.action === 'status' ? 'completed' : 'queued' }) };
    }
  });
  assert.equal((await client.submit('tmsteph/3dvr-portal', 'request-key-123')).status, 'queued');
  assert.equal((await client.status('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa')).status, 'completed');
  assert.deepEqual(calls.map(call => call.action), ['submit', 'status']);
  assert.equal(calls[0].scope, 'hosted-operator-task');
  assert.equal(calls[0].fields.repository, 'tmsteph/3dvr-portal');
  assert.equal(calls[1].fields.taskId, 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
});

test('mobile client refuses missing signed identity', async () => {
  const client = createHostedPilotClient({
    sign: async () => null,
    fetchImpl: async () => { throw new Error('must not send'); }
  });
  await assert.rejects(client.submit('tmsteph/3dvr-portal', 'request-key-123'), /sign_in_required/);
});
