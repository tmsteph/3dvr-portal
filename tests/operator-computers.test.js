import assert from 'node:assert/strict';
import test from 'node:test';
import { createOperatorComputersHandler } from '../src/device/operator-computers.js';
import { computerNameFromPrompt } from '../operator/computer-client.js';

const { default: SEA } = await import('gun/sea.js');
const origin = 'https://portal.example.test';

function fixture() {
  let time = Date.now();
  const handle = createOperatorComputersHandler({ now: () => time, probeMs: 100 });
  function request(body) {
    return new Promise((resolve, reject) => {
      const res = {
        setHeader() {},
        status(status) { this.statusCode = status; return this; },
        json(data) { resolve({ status: this.statusCode, ...data }); }
      };
      handle({ method: 'POST', portalOrigin: origin, body }, res).catch(reject);
    });
  }
  async function proof(key, action, deviceId, proofOrigin = origin) {
    const authProof = await SEA.sign({
      scope: 'operator-computers', pub: key.pub, alias: 'test-owner', origin: proofOrigin,
      action: deviceId ? `${action}:${deviceId}` : action, iat: Date.now()
    }, key);
    return { authPub: key.pub, authProof, action, deviceId };
  }
  return { request, proof, advance: delta => { time += delta; } };
}

test('pair once, verify ownership and route a live check to the selected computer', async () => {
  const { request, proof, advance } = fixture();
  const owner = await SEA.pair();
  const stranger = await SEA.pair();
  assert.equal((await request({ action: 'invite', alias: 'forged' })).status, 401);
  assert.equal((await request(await proof(owner, 'invite', undefined, 'https://elsewhere.test'))).status, 401);

  async function pair(name) {
    const { code } = await request(await proof(owner, 'invite'));
    assert.equal((await request({ action: 'preview', code })).requestedBy, 'test-owner');
    const { token } = await request({ action: 'pair', code, name });
    assert.ok(token);
    assert.equal((await request({ action: 'pair', code, name })).status, 404);
    return token;
  }

  const firstToken = await pair('Graphics 2');
  const secondToken = await pair('Graphics 3');
  const { devices: [first, second] } = await request(await proof(owner, 'list'));
  assert.deepEqual([first.name, second.name], ['Graphics 2', 'Graphics 3']);
  assert.deepEqual((await request(await proof(stranger, 'list'))).devices, []);
  assert.equal((await request(await proof(stranger, 'status', first.id))).status, 404);
  assert.equal((await request({ ...await proof(owner, 'status', first.id), deviceId: second.id })).status, 401);

  const status = request(await proof(owner, 'status', first.id));
  let target;
  for (let attempt = 0; attempt < 10 && !target?.probeId; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2));
    target = await request({ action: 'heartbeat', token: firstToken });
  }
  assert.ok(target?.probeId);
  assert.equal((await request({ action: 'heartbeat', token: secondToken, receipt: target.probeId })).probeId, null);
  await request({ action: 'heartbeat', token: firstToken, receipt: target.probeId });
  assert.deepEqual(await status, { status: 200, ok: true, deviceId: first.id, name: first.name, online: true });
  assert.equal((await request(await proof(owner, 'status', second.id))).online, false);

  await request(await proof(owner, 'revoke', second.id));
  assert.equal((await request({ action: 'heartbeat', token: secondToken })).status, 401);
  await request({ action: 'disconnect', token: firstToken });
  assert.equal((await request(await proof(owner, 'status', first.id))).status, 404);
  const { code } = await request(await proof(owner, 'invite'));
  advance(120_001);
  assert.equal((await request({ action: 'pair', code, name: 'Expired' })).status, 404);
});

test('only explicit computer questions are intercepted by Operator', () => {
  assert.equal(computerNameFromPrompt('Is my computer Graphics 2 online?'), 'Graphics 2');
  assert.equal(computerNameFromPrompt('Is Google online?'), '');
  assert.equal(computerNameFromPrompt('Is my computer <script> online?'), '');
});
