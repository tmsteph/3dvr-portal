import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// The real script is evaluated with mocked dependencies; no relay, worker,
// credentials, task queue, or external service is contacted.
const script = readFileSync(new URL('../scripts/operator-runtime-worker-e2e.mjs', import.meta.url), 'utf8');

function simulate(ack) {
  return new Promise((resolve, reject) => {
    let polls = 0;
    const logs = [];
    const watchdog = setTimeout(() => reject(new Error('simulated E2E hung')), 2500);
    const node = {
      get() { return this; },
      put(_value, cb) { queueMicrotask(() => cb(ack)); },
      once(cb) { polls++; queueMicrotask(() => cb({status:'completed', resultSummary:'mock only', workerDeviceId:'synthetic'})); }
    };
    const gun = { ...node, on() {} };
    const fakeProcess = {
      env: {OPERATOR_RUNTIME_E2E_TIMEOUT_MS: '1000'},
      exit(code) { clearTimeout(watchdog); resolve({code, polls, logs}); }
    };
    const code = script.replace(/^import Gun from 'gun';\n/m, '')
      .replace(/^import \{ buildOperatorDelegatedTask \} from '\.\.\/operator\/delegate-task\.js';\n/m, '');
    runInNewContext(code, {
      Gun: () => gun,
      buildOperatorDelegatedTask: () => ({record:{},summary:{},runtime:{}}),
      process: fakeProcess, setTimeout, clearTimeout, queueMicrotask,
      console: {log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' '))},
      Date, Math, String, Number, Promise, Boolean
    }, {timeout: 1000});
  });
}

for (const [name, ack] of [['explicit error', {err:'relay write failed'}], ['undefined', undefined], ['null', null]]) {
  test(`E2E rejects ${name} write acknowledgement before polling`, async () => {
    const result = await simulate(ack);
    assert.equal(result.code, 1);
    assert.equal(result.polls, 0);
    assert.ok(result.logs.some(line => line.includes('not acknowledged')));
  });
}

test('E2E allows acknowledged writes followed by synthetic completion', async () => {
  const result = await simulate({ok:1});
  assert.equal(result.code, 0);
  assert.ok(result.polls > 0);
  assert.ok(result.logs.some(line => line.includes('E2E_PASS=true')));
});
