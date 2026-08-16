import assert from 'node:assert/strict';
import test from 'node:test';

import { createPolicy } from '../src/policy.mjs';
import { createRuntime } from '../src/runtime.mjs';

test('unknown capabilities require approval by default', async () => {
  const runtime = createRuntime({
    policy: createPolicy(),
    adapters: {
      'browser.open': async () => ({ opened: true })
    }
  });

  const receipt = await runtime.request('browser.open', { url: 'https://3dvr.tech' });

  assert.equal(receipt.decision, 'ask');
  assert.equal(receipt.status, 'needs_approval');
});

test('denied capabilities never execute adapters', async () => {
  let executed = false;
  const runtime = createRuntime({
    policy: createPolicy({ 'os.notify': 'deny' }),
    adapters: {
      'os.notify': async () => {
        executed = true;
      }
    }
  });

  const receipt = await runtime.request('os.notify', { title: 'nope' });

  assert.equal(receipt.status, 'blocked');
  assert.equal(executed, false);
});

test('allowed capabilities execute and return a receipt', async () => {
  const runtime = createRuntime({
    policy: createPolicy({ 'browser.open': 'allow' }),
    adapters: {
      'browser.open': async ({ url }) => ({ opened: url })
    }
  });

  const receipt = await runtime.request('browser.open', { url: 'https://3dvr.tech' });

  assert.equal(receipt.status, 'executed');
  assert.deepEqual(receipt.result, { opened: 'https://3dvr.tech' });
  assert.ok(receipt.requestedAt);
  assert.ok(receipt.completedAt);
});
