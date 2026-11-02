import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { verifySignedSeaPayload } from '../src/auth/sea.js';
import {
  buildSeaProofPayload,
  createAgentSeaPair,
  signSeaProof,
} from '../src/agents/sea-signer.js';
import { AGENT_CHAT_ROOM, buildAgentChatMessage } from '../src/agents/chat.js';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const signerModuleUrl = pathToFileURL(resolve(projectRoot, 'src/agents/sea-signer.js')).href;
const seaModuleUrl = pathToFileURL(resolve(projectRoot, 'src/auth/sea.js')).href;
const gunModuleUrl = pathToFileURL(resolve(projectRoot, 'node_modules/gun/index.js')).href;

const ORIGIN = 'https://portal.3dvr.tech';

test('a proof signed by the agent signer verifies with the server verifier', async () => {
  const pair = await createAgentSeaPair();
  const { authPub, authProof } = await signSeaProof(pair, {
    scope: 'operator-developer-access',
    action: 'status',
    alias: 'test-agent@3dvr',
    origin: ORIGIN,
  });

  const result = await verifySignedSeaPayload(
    { authPub, authProof },
    { scope: 'operator-developer-access', expectedOrigin: ORIGIN }
  );
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.identity.alias, 'test-agent@3dvr');
  assert.equal(result.identity.pub, pair.pub);
  assert.equal(result.identity.action, 'status');
});

test('buildSeaProofPayload requires scope, action, alias, and pub', () => {
  assert.throws(() => buildSeaProofPayload({ action: 'x', alias: 'a', pub: 'p' }), /scope is required/);
  assert.throws(() => buildSeaProofPayload({ scope: 's', alias: 'a', pub: 'p' }), /action is required/);
  const payload = buildSeaProofPayload(
    { scope: 's', action: 'a', alias: 'a@3dvr', pub: 'p', origin: ORIGIN },
    { now: 42 }
  );
  assert.equal(payload.iat, 42);
});

test('signSeaProof rejects incomplete keypairs', async () => {
  await assert.rejects(
    () => signSeaProof({ pub: 'only-public' }, { scope: 's', action: 'a', alias: 'a@3dvr' }),
    /full SEA keypair/
  );
});

// Real Gun create/auth runs in a child process (the pattern used by
// tests/billing-auth-runtime.test.js): a live Gun instance keeps mesh timers
// alive, so the child exits explicitly when its checks are done. The account
// is a throwaway on an isolated in-memory graph, never a shared relay.
function agentAuthChildScript(passwordToUse) {
  return `
    const { default: Gun } = await import(${JSON.stringify(gunModuleUrl)});
    const { authAgentPair, signSeaProof } = await import(${JSON.stringify(signerModuleUrl)});
    const { verifySignedSeaPayload } = await import(${JSON.stringify(seaModuleUrl)});

    const gun = Gun({ localStorage: false, radix: false, peers: [], axe: false });
    const alias = 'signer-test-' + Date.now() + '@3dvr';
    const creator = gun.user();
    await new Promise((resolve, reject) => {
      creator.create(alias, 'the-real-password', ack => (ack && ack.err ? reject(new Error(ack.err)) : resolve(ack)));
    });
    creator.leave();

    let output;
    try {
      const { pair, pub } = await authAgentPair({
        alias,
        password: ${JSON.stringify(passwordToUse)},
        gunInstance: gun,
      });
      const { authPub, authProof } = await signSeaProof(pair, {
        scope: 'operator-developer-access',
        action: 'status',
        alias,
        origin: ${JSON.stringify(ORIGIN)},
      });
      const result = await verifySignedSeaPayload(
        { authPub, authProof },
        { scope: 'operator-developer-access', expectedOrigin: ${JSON.stringify(ORIGIN)} }
      );
      output = { authed: true, pub, verifyOk: result.ok, verifyAlias: result.identity ? result.identity.alias : '' };
    } catch (error) {
      output = { authed: false, error: String(error && error.message || error) };
    }
    console.log(JSON.stringify(output));
    process.exit(0);
  `;
}

async function runAgentAuthChild(passwordToUse) {
  const { stdout } = await execFileAsync(
    process.execPath,
    ['--input-type=module', '-e', agentAuthChildScript(passwordToUse)],
    { cwd: projectRoot, timeout: 90_000 }
  );
  const line = stdout.trim().split('\n').filter(Boolean).pop();
  return JSON.parse(line);
}

test('authAgentPair signs in to a Gun account and produces verifiable proofs', async () => {
  const output = await runAgentAuthChild('the-real-password');
  assert.equal(output.authed, true, output.error || '');
  assert.equal(output.verifyOk, true);
  assert.match(output.verifyAlias, /^signer-test-\d+@3dvr$/);
});

test('authAgentPair rejects a wrong password', async () => {
  const output = await runAgentAuthChild('not-the-password');
  assert.equal(output.authed, false);
  assert.match(output.error, /sign-in failed/);
});

test('agent chat messages match the portal chat room shape', () => {
  assert.equal(AGENT_CHAT_ROOM, 'agents');
  const { id, message } = buildAgentChatMessage(
    { alias: 'claude@3dvr', text: 'Status: fork core merged.' },
    { now: 123, idFactory: () => 'msg_1' }
  );
  assert.equal(id, 'msg_1');
  assert.deepEqual(message, {
    text: 'Status: fork core merged.',
    sender: 'claude@3dvr',
    username: 'claude@3dvr',
    createdAt: 123,
    previousMessageId: '',
  });
  assert.throws(() => buildAgentChatMessage({ alias: 'claude@3dvr', text: ' ' }), /Message text is required/);
});
