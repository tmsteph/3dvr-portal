import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_EPHEMERAL_MAX_JOB_USD,
  getEphemeralComputeConfig,
  invokeEphemeralText,
  planEphemeralCompute
} from '../src/operator/ephemeral-compute.js';

const configured = overrides => getEphemeralComputeConfig({
  THREEDVR_EPHEMERAL_LLM_URL: 'https://example.test/v1/chat/completions',
  THREEDVR_EPHEMERAL_LLM_TOKEN: 'secret',
  THREEDVR_EPHEMERAL_LLM_MODEL: 'open-model',
  THREEDVR_EPHEMERAL_GPU_USD_PER_HOUR: '3',
  ...overrides
});

test('ephemeral compute stays dormant until a provider is configured', () => {
  const plan = planEphemeralCompute({
    prompt: 'Use our own model for this.',
    config: getEphemeralComputeConfig({})
  });
  assert.equal(plan.useEphemeral, false);
  assert.equal(plan.reason, 'not_configured');
});

test('explicit open-model requests select configured ephemeral compute', () => {
  const plan = planEphemeralCompute({
    prompt: 'Use our own model for this.',
    config: configured()
  });
  assert.equal(plan.useEphemeral, true);
  assert.equal(plan.explicit, true);
  assert.equal(plan.model, 'open-model');
  assert.equal(plan.maxJobUsd, DEFAULT_EPHEMERAL_MAX_JOB_USD);
});

test('automatic escape routing is opt-in', () => {
  const prompt = "This model won't generate what I need.";
  assert.equal(planEphemeralCompute({ prompt, config: configured() }).useEphemeral, false);
  assert.equal(planEphemeralCompute({
    prompt,
    config: configured({ THREEDVR_EPHEMERAL_AUTO: 'true' })
  }).useEphemeral, true);
});

test('job budget shortens runtime when hourly rate would exceed the ceiling', () => {
  const plan = planEphemeralCompute({
    prompt: 'Use our own model for this.',
    config: configured({
      THREEDVR_EPHEMERAL_GPU_USD_PER_HOUR: '6',
      THREEDVR_EPHEMERAL_MAX_JOB_USD: '1'
    })
  });
  assert.equal(plan.maxRuntimeMs, 600000);
  assert.equal(plan.estimatedCeilingUsd, 1);
});

test('ephemeral text adapter sends an OpenAI-compatible request without leaking config in output', async () => {
  const config = configured();
  const plan = planEphemeralCompute({ prompt: 'Use our own model for this.', config });
  let captured = null;
  const result = await invokeEphemeralText({
    prompt: 'hello',
    history: [{ role: 'assistant', content: 'previous' }],
    system: 'system',
    config,
    plan,
    fetchImpl: async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'world' } }],
          usage: { total_tokens: 12 }
        })
      };
    }
  });

  assert.equal(result.text, 'world');
  assert.equal(captured.url, config.endpoint);
  assert.equal(captured.options.headers.Authorization, 'Bearer secret');
  assert.equal(captured.body.model, 'open-model');
  assert.equal(captured.body.messages.at(-1).content, 'hello');
  assert.equal(captured.options.headers['X-3DVR-Max-Job-Usd'], '2');
});
