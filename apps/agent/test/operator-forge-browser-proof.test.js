const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');

const { authorizePortalOperatorTask } = require('../thomas-agent/node/operator-forge-auth');

async function browserStyleRecord() {
  const pair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const pubJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  const pub = `${pubJwk.x}.${pubJwk.y}`;
  const alias = 'browser-owner@3dvr';
  const id = 'operator-task-browser-proof';
  const task = 'Operator code request: Update the canary. Commit and push the completed change to GitHub.';
  const payload = {
    scope: 'operator-forge-task',
    action: 'queue-code-change',
    alias,
    pub,
    origin: 'https://portal.3dvr.tech',
    iat: 1_000_000,
    taskId: id,
    repo: 'portal',
    task,
    githubWriteRequested: true,
  };
  const message = Buffer.from(JSON.stringify(payload), 'utf8');
  const hash = await webcrypto.subtle.digest('SHA-256', message);
  const signature = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    pair.privateKey,
    hash
  );
  const proof = `SEA${JSON.stringify({ m: payload, s: Buffer.from(signature).toString('base64') })}`;
  return {
    alias,
    pub,
    record: {
      id,
      task,
      repo: 'portal',
      githubWriteRequested: true,
      requestedBy: 'portal-operator',
      authPub: pub,
      authProof: `b64:${Buffer.from(proof, 'utf8').toString('base64')}`,
    },
  };
}

test('worker verifies browser WebCrypto SEA signatures', async () => {
  const { alias, pub, record } = await browserStyleRecord();
  const result = await authorizePortalOperatorTask(record, {
    now: 1_001_000,
    env: {
      THREEDVR_OPERATOR_OWNER_BINDINGS: JSON.stringify({ [alias]: pub }),
      THREEDVR_OPERATOR_PORTAL_REPO: '/srv/3dvr-portal',
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.role, 'owner');
  assert.equal(result.githubWriteApproved, true);
});
