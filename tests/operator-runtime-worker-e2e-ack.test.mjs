import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import SEA from 'gun/sea.js';
import { runOperatorRuntimeE2E } from '../scripts/operator-runtime-worker-e2e.mjs';

// Synthetic transport only: never contacts the live portal or uses real credentials.
const pair = await SEA.pair();
const baseEnv = {
  OPERATOR_RUNTIME_E2E_RUN_AUTHORIZED: '1',
  OPERATOR_RUNTIME_E2E_SEA_PAIR: JSON.stringify(pair),
  OPERATOR_RUNTIME_E2E_OWNER_PUB: pair.pub,
  OPERATOR_RUNTIME_E2E_TIMEOUT_MS: '1000'
};
const expectedTaskIdPrefix = `operator-http-${createHash('sha256').update(pair.pub).digest('hex').slice(0,24)}-`;
const receipt = { id: `${expectedTaskIdPrefix}operator-e2e-12345678123412341234123456789012`,
  status: 'completed', startedAt: '2026-10-27T12:00:00Z',
  completedAt: '2026-10-27T12:00:01Z', workerDeviceId: 'synthetic-worker', resultText: '42' };

function fakeResponse(status, result) {
  return { status, json: async () => result };
}
function simulate({ env = baseEnv, admission = fakeResponse(202, {ok:true}),
  statuses = [fakeResponse(200, {ok:true, record:receipt})] } = {}) {
  const requests = [];
  const logs = [];
  let clock = 0;
  let statusIndex = 0;
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    const signed = await SEA.verify(body.authProof, pair.pub);
    assert.equal(signed.action, body.action);
    assert.equal(signed.requestId, body.requestId);
    assert.equal(signed.scope, 'operator-runtime-task');
    assert.equal(signed.origin, 'https://portal.3dvr.tech');
    requests.push({action:body.action, requestId:body.requestId});
    if (body.action === 'enqueue') return admission;
    const status = statuses[Math.min(statusIndex++, statuses.length - 1)];
    const payload = await status.json();
    return fakeResponse(status.status, {...payload, requestId: payload.requestId ?? body.requestId});
  };
  const run = () => runOperatorRuntimeE2E({ env, fetchImpl, log: message => logs.push(message),
    now: () => clock, sleep: async ms => {clock += ms;}, newId: () => '12345678-1234-1234-1234-123456789012' });
  return { run, requests, logs };
}

test('default-off authorization makes no external request', async () => {
  const probe = simulate({env:{...baseEnv, OPERATOR_RUNTIME_E2E_RUN_AUTHORIZED:'0'}});
  await assert.rejects(probe.run(), /explicit run and cost authorization/);
  assert.equal(probe.requests.length, 0);
});

test('missing or mismatched signing identity fails before any request', async () => {
  for (const env of [
    {...baseEnv, OPERATOR_RUNTIME_E2E_SEA_PAIR:''},
    {...baseEnv, OPERATOR_RUNTIME_E2E_OWNER_PUB:'wrong'}
  ]) {
    const probe = simulate({env});
    await assert.rejects(probe.run(), /identity/);
    assert.equal(probe.requests.length, 0);
  }
});

test('signed enqueue followed by signed status requires durable completion receipt', async () => {
  const probe = simulate();
  const result = await probe.run();
  assert.equal(result.receipt.status, 'completed');
  assert.deepEqual(probe.requests.map(r => r.action), ['enqueue', 'status']);
  assert.equal(probe.requests[0].requestId, probe.requests[1].requestId);
  assert.ok(probe.logs.includes('E2E_PASS=true'));
  assert.ok(probe.logs.every(line => !line.includes(pair.priv)));
});

test('uncertain admission only polls same ID and never re-enqueues', async () => {
  const probe = simulate({admission:fakeResponse(503,{ok:false,error:'uncertain'})});
  await probe.run();
  assert.deepEqual(probe.requests.map(r => r.action), ['enqueue','status']);
});

test('missing timestamps or worker attribution cannot pass', async () => {
  for (const missing of [{...receipt,startedAt:''},{...receipt,workerDeviceId:''},{...receipt,resultText:''}]) {
    const probe = simulate({statuses:[fakeResponse(200,{ok:true,record:missing})]});
    await assert.rejects(probe.run(), /durable, attributable/);
  }
});

test('mismatched task ID or request ID cannot count as completed execution', async () => {
  for (const response of [
    fakeResponse(200, {ok:true, record:{...receipt,id:'operator-http-unrelated'}}),
    fakeResponse(200, {ok:true, requestId:'different-request-id', record:receipt})
  ]) {
    const probe = simulate({statuses:[response]});
    await assert.rejects(probe.run(), /mismatched task receipt/);
    assert.deepEqual(probe.requests.map(r => r.action), ['enqueue','status']);
    assert.ok(!probe.logs.includes('E2E_PASS=true'));
  }
});

test('incorrect result is not accepted as a successful canary', async () => {
  const probe = simulate({statuses:[fakeResponse(200, {ok:true,record:{...receipt,resultText:'41'}})]});
  await assert.rejects(probe.run(), /expected canary answer/);
  assert.ok(!probe.logs.includes('E2E_PASS=true'));
});

test('rejected admission fails without status polling', async () => {
  const probe = simulate({admission:fakeResponse(403,{ok:false})});
  await assert.rejects(probe.run(), /HTTP 403/);
  assert.deepEqual(probe.requests.map(r => r.action), ['enqueue']);
});
