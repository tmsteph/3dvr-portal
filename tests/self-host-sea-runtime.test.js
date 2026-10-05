import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import { verifySignedSeaPayload } from '../src/auth/sea.js';

const execFileAsync = promisify(execFile);
const { default: SEA } = await import('gun/sea.js');

test('full self-host import graph verifies an independently signed browser proof', async () => {
  const pair = await SEA.pair();
  const authProof = await SEA.sign({ scope: 'operator-developer-access', action: 'operator-chat', pub: pair.pub, alias: 'runtime-test', origin: 'https://portal.example.test', iat: Date.now() }, pair);
  const proof = { authPub: pair.pub, authProof };
  const otherPair = await SEA.pair();
  assert.equal((await verifySignedSeaPayload(proof)).ok, true);
  const serverUrl = new URL('../scripts/self-host-server.mjs', import.meta.url).href;
  const authUrl = new URL('../src/auth/sea.js', import.meta.url).href;
  const script = `
    process.env.PORT='0'; process.env.HOST='127.0.0.1';
    await import(${JSON.stringify(serverUrl)});
    const { verifySignedSeaPayload } = await import(${JSON.stringify(authUrl)});
    const proof = JSON.parse(process.env.TEST_SEA_PROOF);
    const options = { scope:'operator-developer-access', expectedOrigin:'https://portal.example.test' };
    const result = await verifySignedSeaPayload(proof, options);
    const envelope = JSON.parse(proof.authProof.slice(3));
    envelope.m.alias = 'forged-owner';
    const tampered = await verifySignedSeaPayload({ ...proof, authProof:'SEA'+JSON.stringify(envelope) }, options);
    const wrongKey = await verifySignedSeaPayload({ ...proof, authPub:process.env.TEST_OTHER_PUB }, options);
    const wrongOrigin = await verifySignedSeaPayload(proof, { ...options, expectedOrigin:'https://other.example.test' });
    const expired = await verifySignedSeaPayload(proof, { ...options, now:Date.now()+600000 });
    console.log(JSON.stringify({ok:result.ok,reason:result.reason||'',tampered:tampered.ok,wrongKey:wrongKey.ok,wrongOrigin:wrongOrigin.ok,expired:expired.ok}));
    process.exit(0);
  `;
  const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TEST_SEA_PROOF: JSON.stringify(proof), TEST_OTHER_PUB: otherPair.pub }, timeout: 15000 });
  const result = JSON.parse(stdout.trim().split('\n').at(-1));
  assert.equal(result.ok, true, result.reason);
  for (const rejected of ['tampered', 'wrongKey', 'wrongOrigin', 'expired']) {
    assert.equal(result[rejected], false, rejected);
  }
});
