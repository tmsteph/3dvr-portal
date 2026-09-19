'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getAgentStatus,
  openShingle
} = require('../thomas-agent/node/frantic');

test('getAgentStatus reads configured agent without auth', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  let seen;
  global.fetch = async (url, options) => {
    seen = { url: String(url), options };
    return new Response(JSON.stringify({ ok: true, agent: { sworn: true } }), { status: 200 });
  };
  const cfg = { baseUrl: 'https://example.test', agentKid: 'agent-test' };
  const result = await getAgentStatus(cfg);
  assert.equal(result.agent.sworn, true);
  assert.equal(seen.url, 'https://example.test/v1/agents/agent-test/status');
  assert.equal(seen.options.headers.authorization, undefined);
});
test('openShingle sends the valid situation shape with bearer auth', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  let seen;
  global.fetch = async (url, options) => {
    seen = { url: String(url), options };
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const cfg = {
    baseUrl: 'https://example.test',
    agentKid: 'agent-test',
    operatorId: 'operator-test',
    operatorToken: 'secret-token'
  };
  await openShingle({}, cfg);
  assert.equal(seen.url, 'https://example.test/v1/operators/operator-test');
  assert.equal(seen.options.method, 'PATCH');
  assert.equal(seen.options.headers.authorization, 'Bearer secret-token');
  const body = JSON.parse(seen.options.body);
  assert.deepEqual(body.agent_situation.wants, [
    'github_contribution_v1',
    'protocol_conformance_v1',
    'published_artifact_v1'
  ]);
  assert.equal(body.agent_situation.open, true);
  assert.equal(body.agent_situation.floor_cents, 100);
});
