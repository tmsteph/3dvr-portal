import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgentCore, DEFAULT_CORE_MODEL } from '../src/agent-core/core.js';
import { resolveBrokerSecret } from '../src/agent-core/broker.js';

const usage = { prompt_tokens: 11, completion_tokens: 5, total_tokens: 16, estimated_cost: 0.0000025 };
const providerReply = content => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ model: DEFAULT_CORE_MODEL, choices: [{ message: { role: 'assistant', content } }], usage }),
});

async function setup(t, overrides = {}) {
  const stateDir = await mkdtemp(join(tmpdir(), 'agent-core-'));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  const calls = [];
  const core = createAgentCore({
    config: {},
    stateDir,
    systemPrompt: 'You are the test core.',
    resolveSecret: async alias => { assert.equal(alias, 'deepinfra.api'); return 'test-key'; },
    fetchImpl: async (url, init) => { calls.push({ url, init }); return providerReply('core reply'); },
    log: () => {},
    ...overrides,
  });
  return { core, stateDir, calls };
}

test('a turn resolves the key through the broker and calls DeepInfra with thinking disabled', async t => {
  const { core, calls } = await setup(t);
  const result = await core.run({ session: 'helm-owner-session-a', message: 'Hello core' });
  assert.equal(result.ok, true);
  assert.equal(result.reply, 'core reply');
  assert.equal(result.engine, '3DVR Core');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.deepinfra.com/v1/openai/chat/completions');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-key');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, DEFAULT_CORE_MODEL);
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.deepEqual(body.messages, [
    { role: 'system', content: 'You are the test core.' },
    { role: 'user', content: 'Hello core' },
  ]);
  assert.equal(result.usage.promptTokens, 11);
  assert.equal(result.usage.completionTokens, 5);
  assert.equal(result.usage.estimatedCost, 0.0000025);
});

test('history is server-side, survives across turns, and is partitioned per session', async t => {
  const { core, calls } = await setup(t);
  await core.run({ session: 'helm-owner-session-a', message: 'first' });
  await core.run({ session: 'helm-owner-session-a', message: 'second' });
  const secondTurn = JSON.parse(calls[1].init.body);
  assert.deepEqual(secondTurn.messages.slice(1), [
    { role: 'user', content: 'first' },
    { role: 'assistant', content: 'core reply' },
    { role: 'user', content: 'second' },
  ]);
  await core.run({ session: 'helm-owner-session-b', message: 'unrelated' });
  const otherSession = JSON.parse(calls[2].init.body);
  assert.deepEqual(otherSession.messages.slice(1), [{ role: 'user', content: 'unrelated' }]);
});

test('usage is metered to the state dir log', async t => {
  const { core, stateDir } = await setup(t);
  await core.run({ session: 'helm-owner-session-a', message: 'meter me' });
  const lines = (await readFile(join(stateDir, 'core-usage.jsonl'), 'utf8')).trim().split('\n');
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.model, DEFAULT_CORE_MODEL);
  assert.equal(entry.totalTokens, 16);
  assert.equal(entry.estimatedCost, 0.0000025);
  assert.equal(typeof entry.session, 'string');
  assert.equal(entry.session.length, 16);
});

test('history is capped so a long conversation cannot grow without bound', async t => {
  const { core, calls } = await setup(t);
  for (let i = 0; i < 25; i++) await core.run({ session: 'helm-owner-session-a', message: `turn ${i}` });
  const last = JSON.parse(calls.at(-1).init.body);
  // system prompt + at most 40 history entries + the new user turn
  assert.ok(last.messages.length <= 42);
});

test('a broker failure returns the reason instead of throwing or going silent', async t => {
  const { core } = await setup(t, {
    resolveSecret: async () => { throw new Error('Secrets broker request denied (secret-policy-not-found)'); },
  });
  const result = await core.run({ session: 'helm-owner-session-a', message: 'Hello' });
  assert.equal(result.ok, false);
  assert.match(result.error, /secrets broker/);
  assert.match(result.error, /secret-policy-not-found/);
  const status = await core.status();
  assert.equal(status.ok, false);
  assert.match(status.error, /secret-policy-not-found/);
});

test('a provider failure returns the provider reason', async t => {
  const { core } = await setup(t, {
    fetchImpl: async () => ({ ok: false, status: 500, text: async () => JSON.stringify({ error: { message: 'model overloaded' } }) }),
  });
  const result = await core.run({ session: 'helm-owner-session-a', message: 'Hello' });
  assert.equal(result.ok, false);
  assert.match(result.error, /DeepInfra error 500: model overloaded/);
});

test('an empty provider reply is an explicit failure, not a blank message', async t => {
  const { core } = await setup(t, { fetchImpl: async () => providerReply('  ') });
  const result = await core.run({ session: 'helm-owner-session-a', message: 'Hello' });
  assert.equal(result.ok, false);
  assert.match(result.error, /empty reply/);
});

test('status proves the key path without a model call', async t => {
  const { core, calls } = await setup(t);
  const status = await core.status();
  assert.equal(status.ok, true);
  assert.equal(status.model, DEFAULT_CORE_MODEL);
  assert.equal(calls.length, 0);
});

test('broker resolve speaks the broker protocol and reads the token at call time', async () => {
  let seen;
  const value = await resolveBrokerSecret('deepinfra.api', {
    config: {},
    readFileImpl: async path => { assert.match(path, /muse-broker\.token$/); return ' agent-token\n'; },
    requestImpl: async request => {
      seen = request;
      return { secret: 'resolved-value' };
    },
  });
  assert.equal(value, 'resolved-value');
  assert.equal(seen.token, 'agent-token');
  assert.equal(seen.pathName, '/v1/resolve');
  assert.deepEqual(seen.payload, {
    secret: 'deepinfra.api',
    capability: 'secret.read',
    scope: 'secrets:3dvr-agent',
    purpose: 'agent-core',
  });
});

test('broker resolve fails loudly when the token file is missing', async () => {
  await assert.rejects(
    resolveBrokerSecret('deepinfra.api', { config: {}, readFileImpl: async () => { throw new Error('ENOENT'); } }),
    /not readable/);
});
