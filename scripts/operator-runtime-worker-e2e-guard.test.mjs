import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('./operator-runtime-worker-e2e.mjs', import.meta.url));
const spyTarget = fileURLToPath(new URL('./.operator-runtime-worker-e2e-transport-spy.mjs', import.meta.url));
const queueSpyTarget = fileURLToPath(new URL('./.operator-runtime-worker-e2e-queue-spy.mjs', import.meta.url));
const source = readFileSync(target, 'utf8');
// Literal loopback peers are not sufficient if Gun can discover or join
// additional remote peers. Enforce explicit off switches in the queue-writing
// E2E (which is disabled in CI). This source contract is checked without
// initializing Gun or touching a relay.
const configBlock = source.match(/\bconst gun = Gun\(\{([\s\S]*?)\n\}\);/);
assert.ok(configBlock, 'expected explicit Gun construction options');
const configText = configBlock[1];
assert.match(configText, /^\s*peers,\s*$/m, 'Gun must use validated peers');
for (const setting of ['axe', 'multicast', 'rad', 'radisk', 'localStorage', 'stats']) {
  const definitions = [...configText.matchAll(new RegExp('^\\s*' + setting + ':\\s*(true|false)\\s*,?\\s*$', 'gm'))];
  assert.equal(definitions.length, 1, setting + ' must have exactly one literal setting');
  assert.equal(definitions[0][1], 'false', setting + ' must be disabled in isolated Gun');
}
// Instrument the first possible import of the Gun transport. Rejecting a
// relay must finish before even importing code that could open a connection.
assert.match(source, /^const \{ default: Gun \} = await import\('gun'\);$/m,
  'expected deferred Gun import for transport interception');
const instrumented = source.replace(
  /^const \{ default: Gun \} = await import\('gun'\);$/m,
  "const Gun = (() => { throw new Error('NETWORK_TRANSPORT_IMPORTED'); })();"
);
// This independent in-memory queue spy exercises the actual put() boundary.
// No Gun package, relay socket, task store, or worker is initialized.
const queueInstrumented = source.replace(
  /^const \{ default: Gun \} = await import\('gun'\);$/m,
  "const Gun = () => { const node = { get() { return this; }, on() { return this; }, put() { throw new Error('MOCK_QUEUE_PUT_ATTEMPT'); } }; return node; };"
);
assert.notEqual(queueInstrumented, source, 'expected queue transport interception');
// Fail closed if a future workflow edit makes the legacy direct-Gun job runnable
// on a PR, push, or manual dispatch. This is a static write-free safety check.
const workflow = readFileSync(new URL('../.github/workflows/operator-runtime-worker-e2e.yml', import.meta.url), 'utf8');
const workerJob = workflow.split(/\n  runtime-worker:\s*\n/)[1]?.split(/\n  [\w-]+:\s*\n/)[0];
assert.ok(workerJob, 'expected runtime-worker job');
assert.match(workerJob, /^\s*if:\s*\$\{\{\s*false\s*\}\}\s*$/m,
  'workflow must keep direct-Gun worker disabled on every event');

const cases = [
  { name: 'missing relay', peers: '', expected: 'no default relay is permitted' },
  { name: 'production relay', peers: 'wss://portal.3dvr.tech/gun-relay', expected: 'Production relay blocked' },
  { name: 'production override cannot bypass', peers: 'wss://portal.3dvr.tech/gun-relay', allowProduction: 'true', expected: 'Production relay blocked' },
  { name: 'production relay host', peers: 'wss://relay.3dvr.tech/gun', expected: 'Production relay blocked' },
  { name: 'production relay subdomain', peers: 'https://foo.relay.3dvr.tech/gun', expected: 'Production relay blocked' },
  { name: 'production FQDN with trailing root dot', peers: 'https://portal.3dvr.tech./gun-relay', expected: 'Production relay blocked' },
  { name: 'production subdomain with trailing root dot', peers: 'wss://foo.relay.3dvr.tech./gun', expected: 'Production relay blocked' },
  { name: 'active Fly relay with trailing root dot', peers: 'https://gun-relay-3dvr.fly.dev./gun', expected: 'Production relay blocked' },
  { name: 'active production Fly relay', peers: 'wss://gun-relay-3dvr.fly.dev/gun', expected: 'Production relay blocked' },
  { name: 'active production Fly relay subdomain', peers: 'https://test.gun-relay-3dvr.fly.dev/gun', expected: 'Production relay blocked' },
  { name: 'legacy production relay environment', peers: '', legacyRelay: 'https://gun-relay-3dvr.fly.dev/gun', expected: 'Production relay blocked' },
  { name: 'non-network peer scheme', peers: 'file:///tmp/gun-relay', expected: 'Invalid THREEDVR_GUN_PEERS URL protocol' },
  { name: 'mixed production relay list', peers: 'http://localhost:8765/gun,wss://relay.3dvr.tech/gun', expected: 'Production relay blocked' },
  { name: 'production subdomain', peers: 'https://foo.portal.3dvr.tech/gun-relay', expected: 'Production relay blocked' },
  { name: 'invalid relay URL', peers: 'not-a-url', expected: 'Invalid THREEDVR_GUN_PEERS URL' },
  { name: 'non-production remote host is still unsafe', peers: 'https://staging.example.net/gun', expected: 'Only literal loopback relays' },
  { name: 'private network host is not an isolated process', peers: 'http://192.168.1.2:8765/gun', expected: 'Only literal loopback relays' },
  { name: 'DNS alias is not a literal loopback', peers: 'http://localhost:8765/gun', expected: 'Only literal loopback relays' },
  { name: 'all-network-interfaces address is not a relay peer', peers: 'http://0.0.0.0:8765/gun', expected: 'Only literal loopback relays' },
  { name: 'one remote peer poisons an otherwise local list', peers: 'http://127.0.0.1:8765/gun,https://staging.example.net/gun', expected: 'Only literal loopback relays' },
  { name: 'loopback without a port', peers: 'http://127.0.0.1/gun', expected: 'Loopback relay must use' },
  { name: 'loopback wrong Gun path', peers: 'http://127.0.0.1:8765/gun-relay', expected: 'Loopback relay must use' },
  { name: 'loopback credential leak', peers: 'http://test:secret@127.0.0.1:8765/gun', expected: 'Loopback relay must use' },
  { name: 'loopback query parameter', peers: 'http://127.0.0.1:8765/gun?upstream=remote', expected: 'Loopback relay must use' },
  { name: 'loopback fragment', peers: 'http://127.0.0.1:8765/gun#remote', expected: 'Loopback relay must use' },
  { name: 'mixed valid and ambiguous loopback peers', peers: 'http://127.0.0.1:8765/gun,http://[::1]:8765/other', expected: 'Loopback relay must use' }
];

writeFileSync(spyTarget, instrumented, { flag: 'wx' });
try {
  writeFileSync(queueSpyTarget, queueInstrumented, { flag: 'wx' });
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
    assert.doesNotMatch(result.stderr, /NETWORK_TRANSPORT_IMPORTED/, testCase.name + ': transport must not import');
    assert.doesNotMatch(result.stdout, /E2E_ENQUEUE_ATTEMPTED=true|E2E_WRITE_RESULTS=|E2E_ENQUEUE_ACKNOWLEDGED=true/, testCase.name + ': must reject before writes');
    console.log('PASS ' + testCase.name + ' (transport not imported)');
  }
  // Independent guard: every rejected peer must also fail before the queue's
  // actual put() boundary. The in-memory stub never opens a network transport.
  for (const testCase of cases) {
    const result = spawnSync(process.execPath, [queueSpyTarget], {
      env: {
        ...process.env,
        THREEDVR_GUN_PEERS: testCase.peers,
        THREEDVR_GUN_RELAY: testCase.legacyRelay || '',
        OPERATOR_RUNTIME_E2E_ALLOW_PRODUCTION: testCase.allowProduction || 'false'
      },
      encoding: 'utf8',
      timeout: 15000
    });
    assert.equal(result.status, 1, testCase.name + ': queue spy expected rejection');
    assert.match(result.stderr, new RegExp(testCase.expected), testCase.name);
    assert.doesNotMatch(result.stderr, /MOCK_QUEUE_PUT_ATTEMPT/,
      testCase.name + ': queue put() must not be attempted');
  }
  console.log('PASS all rejected relay cases before instrumented queue put()');

  const queueControl = spawnSync(process.execPath, [queueSpyTarget], {
    env: {
      ...process.env,
      THREEDVR_GUN_PEERS: 'http://127.0.0.1:8765/gun',
      THREEDVR_GUN_RELAY: '',
      OPERATOR_RUNTIME_E2E_ALLOW_PRODUCTION: 'false'
    },
    encoding: 'utf8',
    timeout: 15000
  });
  assert.equal(queueControl.status, 1, 'isolated relay must reach mocked queue put()');
  assert.match(queueControl.stderr, /MOCK_QUEUE_PUT_ATTEMPT/,
    'positive control demonstrates the spy actually intercepts a queue write attempt');
  assert.doesNotMatch(queueControl.stdout, /E2E_ENQUEUE_ACKNOWLEDGED=true/);
  console.log('PASS isolated relay reaches in-memory queue put() spy (zero network writes)');

  // Positive control: prove that an isolated relay reaches the spy.
  // Gun construction is mocked to throw before any network or queue write.
  const control = spawnSync(process.execPath, [spyTarget], {
    env: {
      ...process.env,
      THREEDVR_GUN_PEERS: 'http://127.0.0.1:8765/gun',
      THREEDVR_GUN_RELAY: '',
      OPERATOR_RUNTIME_E2E_ALLOW_PRODUCTION: 'false'
    },
    encoding: 'utf8',
    timeout: 15000
  });
  assert.equal(control.status, 1, 'isolated relay must reach mocked Gun import');
  assert.match(control.stderr, /NETWORK_TRANSPORT_IMPORTED/,
    'isolated relay reaches the deferred transport import without network initialization');
  assert.doesNotMatch(control.stdout, /E2E_ENQUEUE_ACKNOWLEDGED=true/,
    'no enqueue acknowledgment may be reported by the spy');
  console.log('PASS isolated relay reaches transport import spy (no network/queue writes)');
  // IPv6 loopback is also a valid isolated peer.
  const ipv6 = spawnSync(process.execPath, [spyTarget], {
    env: {
      ...process.env,
      THREEDVR_GUN_PEERS: 'http://[::1]:8765/gun',
      THREEDVR_GUN_RELAY: '',
      OPERATOR_RUNTIME_E2E_ALLOW_PRODUCTION: 'false'
    },
    encoding: 'utf8',
    timeout: 15000
  });
  assert.equal(ipv6.status, 1, 'IPv6 loopback must reach mocked Gun import');
  assert.match(ipv6.stderr, /NETWORK_TRANSPORT_IMPORTED/);
  console.log('PASS IPv6 loopback reaches transport import spy (no network/queue writes)');
} finally {
  unlinkSync(spyTarget);
  try { unlinkSync(queueSpyTarget); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
