import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('./operator-runtime-worker-e2e.mjs', import.meta.url));
const cases = [
  { name: 'missing relay', peers: '', expected: 'no default relay is permitted' },
  { name: 'production relay', peers: 'wss://portal.3dvr.tech/gun-relay', expected: 'Production relay blocked' },
  { name: 'production override cannot bypass', peers: 'wss://portal.3dvr.tech/gun-relay', allowProduction: 'true', expected: 'Production relay blocked' },
  { name: 'production relay host', peers: 'wss://relay.3dvr.tech/gun', expected: 'Production relay blocked' },
  { name: 'production relay subdomain', peers: 'https://foo.relay.3dvr.tech/gun', expected: 'Production relay blocked' },
  { name: 'mixed production relay list', peers: 'http://localhost:8765/gun,wss://relay.3dvr.tech/gun', expected: 'Production relay blocked' },
  { name: 'production subdomain', peers: 'https://foo.portal.3dvr.tech/gun-relay', expected: 'Production relay blocked' },
  { name: 'invalid relay URL', peers: 'not-a-url', expected: 'Invalid THREEDVR_GUN_PEERS URL' }
];

for (const testCase of cases) {
  const env = { ...process.env, THREEDVR_GUN_PEERS: testCase.peers, THREEDVR_GUN_RELAY: '', OPERATOR_RUNTIME_E2E_ALLOW_PRODUCTION: testCase.allowProduction || 'false' };
  const result = spawnSync(process.execPath, [target], { env, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 1, testCase.name + ': expected rejection');
  assert.match(result.stderr, new RegExp(testCase.expected), testCase.name);
  assert.doesNotMatch(result.stdout, /E2E_ENQUEUE_ATTEMPTED=true|E2E_WRITE_RESULTS=/, testCase.name + ': must reject before writes');
  console.log('PASS ' + testCase.name);
}
