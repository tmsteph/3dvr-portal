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
