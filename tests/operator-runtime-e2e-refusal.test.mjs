import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const script = new URL('../scripts/operator-runtime-worker-e2e.mjs', import.meta.url);

function refusal(overrides, expected) {
  const env = {
    ...process.env,
    OPERATOR_RUNTIME_E2E_ALLOW_ENQUEUE: '',
    THREEDVR_AGENT_OWNER_ALIAS: '',
    THREEDVR_GUN_PEERS: '',
    THREEDVR_GUN_RELAY: '',
    ...overrides
  };
  const result = spawnSync(process.execPath, [script.pathname], {
    env, encoding: 'utf8', timeout: 15000
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, expected);
  assert.doesNotMatch(result.stdout, /E2E_ENQUEUE_ACKNOWLEDGED=true|E2E_PEER_HI=/);
}

test('Operator E2E refuses execution without explicit opt-in', () => {
  refusal({}, /Refusing to enqueue/);
});

test('Operator E2E refuses default worker owner', () => {
  refusal({ OPERATOR_RUNTIME_E2E_ALLOW_ENQUEUE: 'true', THREEDVR_AGENT_OWNER_ALIAS: '3dvr-managed' }, /Refusing shared\/default queue/);
});

test('Operator E2E refuses missing isolated relay', () => {
  refusal({ OPERATOR_RUNTIME_E2E_ALLOW_ENQUEUE: 'true', THREEDVR_AGENT_OWNER_ALIAS: 'isolated-test-owner' }, /Refusing enqueue without/);
});

for (const peer of ['wss://portal.3dvr.tech/gun-relay', 'https://gun-relay-3dvr.fly.dev/gun', 'wss://relay.3dvr.tech/gun']) {
  test(`Operator E2E refuses shared relay ${peer}`, () => {
    refusal({
      OPERATOR_RUNTIME_E2E_ALLOW_ENQUEUE: 'true',
      THREEDVR_AGENT_OWNER_ALIAS: 'isolated-test-owner',
      THREEDVR_GUN_PEERS: peer
    }, /Refusing known production\/shared Gun relay/);
  });
}
