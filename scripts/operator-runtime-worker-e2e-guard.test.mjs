import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('./operator-runtime-worker-e2e.mjs', import.meta.url));
const spyTarget = fileURLToPath(new URL('./.operator-runtime-worker-e2e-transport-spy.mjs', import.meta.url));
const source = readFileSync(target, 'utf8');
assert.match(source, /^import Gun from 'gun';/m, 'expected Gun import for transport interception');
const instrumented = source.replace(
  /^import Gun from 'gun';/m,
  "const Gun = () => { throw new Error('NETWORK_TRANSPORT_INSTANTIATED'); };"
);
const cases = [
  { name: 'missing relay', peers: '', expected: 'no default relay is permitted' },
  { name: 'production relay', peers: 'wss://portal.3dvr.tech/gun-relay', expected: 'Production relay blocked' },
  { name: 'production override cannot bypass', peers: 'wss://portal.3dvr.tech/gun-relay', allowProduction: 'true', expected: 'Production relay blocked' },
  { name: 'production relay host', peers: 'wss://relay.3dvr.tech/gun', expected: 'Production relay blocked' },
  { name: 'production relay subdomain', peers: 'https://foo.relay.3dvr.tech/gun', expected: 'Production relay blocked' },
  { name: 'active production Fly relay', peers: 'wss://gun-relay-3dvr.fly.dev/gun', expected: 'Production relay blocked' },
  { name: 'active production Fly relay subdomain', peers: 'https://test.gun-relay-3dvr.fly.dev/gun', expected: 'Production relay blocked' },
  { name: 'legacy production relay environment', peers: '', legacyRelay: 'https://gun-relay-3dvr.fly.dev/gun', expected: 'Production relay blocked' },
  { name: 'non-network peer scheme', peers: 'file:///tmp/gun-relay', expected: 'Invalid THREEDVR_GUN_PEERS URL protocol' },
  { name: 'mixed production relay list', peers: 'http://localhost:8765/gun,wss://relay.3dvr.tech/gun', expected: 'Production relay blocked' },
  { name: 'production subdomain', peers: 'https://foo.portal.3dvr.tech/gun-relay', expected: 'Production relay blocked' },
  { name: 'invalid relay URL', peers: 'not-a-url', expected: 'Invalid THREEDVR_GUN_PEERS URL' }
];

writeFileSync(spyTarget, instrumented, { flag: 'wx' });
try {
  for (const testCase of cases) {
    const env = {
      ...process.env,
      THREEDVR_GUN_PEERS: testCase.peers,
      THREEDVR_GUN_RELAY: testCase.legacyRelay || '',
      OPERATOR_RUNTIME_E2E_ALLOW_PRODUCTION: testCase.allowProduction || 'false'
    };
    const result = spawnSync(process.execPath, [spyTarget], { env, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 1, testCase.name + ': expected rejection');
    assert.match(result.stderr, new RegExp(testCase.expected), testCase.name);
    assert.doesNotMatch(result.stderr, /NETWORK_TRANSPORT_INSTANTIATED/, testCase.name + ': transport must not initialize');
    assert.doesNotMatch(result.stdout, /E2E_ENQUEUE_ATTEMPTED=true|E2E_WRITE_RESULTS=|E2E_ENQUEUE_ACKNOWLEDGED=true/, testCase.name + ': must reject before writes');
    console.log('PASS ' + testCase.name + ' (transport not initialized)');
  }
} finally {
  unlinkSync(spyTarget);
}
