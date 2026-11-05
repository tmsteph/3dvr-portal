import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../src/operator-runtime/hosted-operator-api.js';

test('hosted API stays off by default', async () => {
  const prior = process.env.HOSTED_OPERATOR_PILOT_ENABLED;
  delete process.env.HOSTED_OPERATOR_PILOT_ENABLED;
  const res = { setHeader() {}, end(body) { this.body = JSON.parse(body); } };
  try {
    await handler({ method: 'POST', body: { action: 'submit' } }, res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, 'not_found');
  } finally {
    if (prior === undefined) delete process.env.HOSTED_OPERATOR_PILOT_ENABLED;
    else process.env.HOSTED_OPERATOR_PILOT_ENABLED = prior;
  }
});

test('enabled hosted API refuses task submissions without durable spending accounting', async () => {
  const { access, mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const keys = ['HOSTED_OPERATOR_PILOT_ENABLED', 'HOSTED_OPERATOR_PILOT_STORE', 'HOSTED_OPERATOR_PILOT_ORIGIN'];
  const prior = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const dir = await mkdtemp(join(tmpdir(), 'hosted-budget-gate-'));
  const storePath = join(dir, 'tasks.json');
  try {
    process.env.HOSTED_OPERATOR_PILOT_ENABLED = 'true';
    process.env.HOSTED_OPERATOR_PILOT_STORE = storePath;
    process.env.HOSTED_OPERATOR_PILOT_ORIGIN = 'https://portal.3dvr.tech';
    const res = { setHeader() {}, end(body) { this.body = JSON.parse(body); } };
    await handler({
      method: 'POST',
      body: { action: 'submit', kind: 'repo-status', repository: 'tmsteph/3dvr-portal', idempotencyKey: 'budget-gate-test-123' }
    }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'budget_accounting_unavailable');
    await assert.rejects(access(storePath), { code: 'ENOENT' });
  } finally {
    for (const key of keys) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
    await rm(dir, { recursive: true, force: true });
  }
});
