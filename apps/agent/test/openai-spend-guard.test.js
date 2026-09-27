const test = require('node:test');
const assert = require('node:assert/strict');

const {
  readOpenAiSpendGuard,
  assertOpenAiSpendAllowed,
} = require('../thomas-agent/node/openai-spend-guard');

test('OpenAI spend guard stays out of the way until a ceiling is configured', async () => {
  let calls = 0;
  const status = await readOpenAiSpendGuard({
    env: {},
    fetchImpl: async () => { calls += 1; },
  });
  assert.equal(status.configured, false);
  assert.equal(status.allowed, true);
  assert.equal(calls, 0);
});

test('configured OpenAI spend guard fails closed without an admin key', async () => {
  await assert.rejects(
    assertOpenAiSpendAllowed({ env: { THREEDVR_OPENAI_COST_LIMIT_USD: '5' } }),
    /OPENAI_ADMIN_KEY not set/,
  );
});

test('OpenAI spend guard allows API calls below the ceiling', async () => {
  const status = await assertOpenAiSpendAllowed({
    env: { THREEDVR_OPENAI_COST_LIMIT_USD: '5', OPENAI_ADMIN_KEY: 'admin-test' },
    now: Date.UTC(2026, 8, 27),
    fetchImpl: async (url) => {
      assert.match(url, /organization\/costs/);
      return {
        ok: true,
        json: async () => ({ data: [{ results: [{ amount: { value: 1.25 } }] }] }),
      };
    },
  });
  assert.equal(status.allowed, true);
  assert.equal(status.totalUsd, 1.25);
  assert.equal(status.limitUsd, 5);
});

test('OpenAI spend guard blocks API calls once the ceiling is reached', async () => {
  await assert.rejects(
    assertOpenAiSpendAllowed({
      env: { THREEDVR_OPENAI_COST_LIMIT_USD: '5', OPENAI_ADMIN_KEY: 'admin-test' },
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ data: [{ results: [{ amount: { value: 5.01 } }] }] }),
      }),
    }),
    /ceiling reached/,
  );
});
