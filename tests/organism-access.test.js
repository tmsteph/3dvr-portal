import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';

try {
  globalThis.crypto = webcrypto;
} catch {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
}
try {
  globalThis.self = globalThis;
} catch {}

const { default: SEA } = await import('gun/sea.js');
const {
  resolveOrganismAccess,
  resolveOrganismFeedbackAccess
} = await import('../src/organism/access.js');

const ORIGIN = 'https://portal.3dvr.tech';

async function signedRequest({
  pair,
  alias,
  action = 'recall',
  query = 'What servers are we using?',
  requestId = 'req-1',
  limit = 5,
  memoryId = '',
  outcome = action === 'reject-retrieval' ? 'rejected' : 'approved',
  iat = Date.now()
}) {
  const signed = {
    scope: 'digital-organism',
    action,
    alias,
    pub: pair.pub,
    origin: ORIGIN,
    iat,
    query,
    requestId,
    ...(action === 'recall' ? { limit } : { memoryId, outcome })
  };
  return {
    authPub: pair.pub,
    authProof: await SEA.sign(signed, pair),
    query,
    requestId,
    ...(action === 'recall' ? { limit } : { memoryId, outcome })
  };
}

function ownerConfig(alias, pub) {
  return {
    THREEDVR_OPERATOR_OWNER_BINDINGS: JSON.stringify({ [alias]: pub }),
    THREEDVR_ORGANISM_ALLOWED_ORIGINS: ORIGIN
  };
}

test('accepts a fresh owner-signed recall bound to the exact question', async () => {
  const pair = await SEA.pair();
  const alias = 'organism-owner@test';
  const now = Date.now();
  const payload = await signedRequest({ pair, alias, iat: now });
  const result = await resolveOrganismAccess(payload, {
    config: ownerConfig(alias, pair.pub),
    now
  });
  assert.equal(result.ok, true);
  assert.equal(result.query, payload.query);
  assert.equal(result.requestId, payload.requestId);
  assert.equal(result.limit, payload.limit);
});

test('rejects a question changed after signing', async () => {
  const pair = await SEA.pair();
  const alias = 'organism-owner@test';
  const now = Date.now();
  const payload = await signedRequest({ pair, alias, iat: now });
  payload.query = 'Tell me a different secret';
  const result = await resolveOrganismAccess(payload, {
    config: ownerConfig(alias, pair.pub),
    now
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.match(result.reason, /Question did not match/i);
});

test('rejects expired signed recalls', async () => {
  const pair = await SEA.pair();
  const alias = 'organism-owner@test';
  const now = Date.now();
  const payload = await signedRequest({ pair, alias, iat: now - 3 * 60 * 1000 });
  const result = await resolveOrganismAccess(payload, {
    config: ownerConfig(alias, pair.pub),
    now
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.match(result.reason, /expired/i);
});

test('rejects a valid signature from a non-owner account', async () => {
  const pair = await SEA.pair();
  const alias = 'organism-guest@test';
  const now = Date.now();
  const payload = await signedRequest({ pair, alias, iat: now });
  const result = await resolveOrganismAccess(payload, {
    config: { THREEDVR_ORGANISM_ALLOWED_ORIGINS: ORIGIN },
    now
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.match(result.reason, /owner requests only/i);
});

test('accepts owner-signed retrieval approval bound to exact query and memory id', async () => {
  const pair = await SEA.pair();
  const alias = 'organism-owner@test';
  const now = Date.now();
  const payload = await signedRequest({
    pair,
    alias,
    action: 'approve-retrieval',
    memoryId: 'memory-123',
    iat: now
  });
  const result = await resolveOrganismFeedbackAccess(payload, {
    config: ownerConfig(alias, pair.pub),
    now
  });
  assert.equal(result.ok, true);
  assert.equal(result.query, payload.query);
  assert.equal(result.memoryId, 'memory-123');
  assert.equal(result.requestId, payload.requestId);
});

test('accepts owner-signed retrieval rejection as a separate action', async () => {
  const pair = await SEA.pair();
  const alias = 'organism-owner@test';
  const now = Date.now();
  const payload = await signedRequest({
    pair,
    alias,
    action: 'reject-retrieval',
    memoryId: 'memory-123',
    iat: now
  });
  const result = await resolveOrganismFeedbackAccess(payload, {
    config: ownerConfig(alias, pair.pub),
    now
  });
  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'rejected');
  assert.equal(result.memoryId, 'memory-123');
});

test('retrieval approval rejects memory id changed after signing', async () => {
  const pair = await SEA.pair();
  const alias = 'organism-owner@test';
  const now = Date.now();
  const payload = await signedRequest({
    pair,
    alias,
    action: 'approve-retrieval',
    memoryId: 'memory-123',
    iat: now
  });
  payload.memoryId = 'memory-evil-swap';
  const result = await resolveOrganismFeedbackAccess(payload, {
    config: ownerConfig(alias, pair.pub),
    now
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.match(result.reason, /Memory id did not match/i);
});

test('recall proof cannot be replayed as retrieval approval', async () => {
  const pair = await SEA.pair();
  const alias = 'organism-owner@test';
  const now = Date.now();
  const payload = await signedRequest({ pair, alias, iat: now });
  payload.memoryId = 'memory-123';
  const result = await resolveOrganismFeedbackAccess(payload, {
    config: ownerConfig(alias, pair.pub),
    now
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.match(result.reason, /did not authorize retrieval feedback/i);
});
