import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostedTaskHandler } from '../src/operator-runtime/hosted-task-handler.js';

function res() {
  return { setHeader() {}, end(text) { this.body = JSON.parse(text); } };
}
const tasks = new Map();
const store = {
  async submit(tenantId, request) {
    const task = { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', tenantId, status: 'queued', ...request };
    tasks.set(task.id, task);
    return { ok: true, duplicate: false, task };
  },
  async get(tenantId, id) {
    const task = tasks.get(id);
    return task?.tenantId === tenantId ? task : null;
  }
};
const handler = createHostedTaskHandler({
  store, origin: 'https://portal.3dvr.tech',
  verify: async body => ({ ok: Boolean(body.authPub), identity: { pub: body.authPub, action: body.action }, verified: body })
});
async function run(method, url, body) {
  const output = res();
  await handler({ method, url, body: { ...body, action: url === '/tasks' ? 'submit' : 'status' } }, output);
  return output;
}

test('requires verified identity', async () => {
  assert.equal((await run('POST', '/tasks', { kind: 'repo-status' })).statusCode, 401);
});
test('enforces derived tenant on submission and status', async () => {
  const created = await run('POST', '/tasks', {
    authPub: 'alice', tenantId: 'sea:bob', kind: 'repo-status',
    repository: 'tmsteph/3dvr-portal', idempotencyKey: 'sample-key-123'
  });
  assert.equal(created.statusCode, 202);
  const taskId = created.body.id;
  assert.equal((await run('POST', '/tasks/status', { authPub: 'bob', taskId })).statusCode, 404);
  assert.equal((await run('POST', '/tasks/status', { authPub: 'alice', taskId })).statusCode, 200);
});
test('disallows unsupported routes and methods', async () => {
  assert.equal((await run('DELETE', '/tasks', { authPub: 'alice' })).statusCode, 405);
  assert.equal((await run('GET', '/tasks', { authPub: 'alice' })).statusCode, 404);
});
