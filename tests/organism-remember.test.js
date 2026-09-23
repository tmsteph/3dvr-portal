import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';

try {
  globalThis.crypto = webcrypto;
} catch {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
}
try { globalThis.self = globalThis; } catch {}

const { default: SEA } = await import('gun/sea.js');
const { resolveOrganismRememberAccess } = await import('../src/organism/access.js');
const { createOrganismBridgeHandler } = await import('../src/organism/bridge.js');
const { rememberOnOvh } = await import('../src/organism/remote.js');
const { createOrganismVercelRelay } = await import('../src/organism/vercel-relay.js');

const ORIGIN = 'https://portal.3dvr.tech';

function ownerConfig(alias, pub) {
  return {
    THREEDVR_OPERATOR_OWNER_BINDINGS: JSON.stringify({ [alias]: pub }),
    THREEDVR_ORGANISM_ALLOWED_ORIGINS: ORIGIN
  };
}

async function signedRemember({ pair, alias, now = Date.now() }) {
  const fields = {
    content: 'A durable note from Master Notes.',
    subject: 'Master Notes',
    kind: 'note',
    sourceId: 'note-source-1',
    requestId: 'remember-1'
  };
  const signed = {
    scope: 'digital-organism',
    action: 'remember',
    alias,
    pub: pair.pub,
    origin: ORIGIN,
    iat: now,
    ...fields
  };
  return {
    authPub: pair.pub,
    authProof: await SEA.sign(signed, pair),
    ...fields
  };
}

function fakeResponse() {
  return {
    statusCode: 200,
    headers: {},
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

test('owner-signed remember is bound to exact note content and provenance', async () => {
  const pair = await SEA.pair();
  const alias = 'organism-owner@test';
  const now = Date.now();
  const payload = await signedRemember({ pair, alias, now });
  const accepted = await resolveOrganismRememberAccess(payload, {
    config: ownerConfig(alias, pair.pub),
    now
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.content, payload.content);
  assert.equal(accepted.sourceId, payload.sourceId);

  const tampered = await resolveOrganismRememberAccess(
    { ...payload, content: 'swapped after signing' },
    { config: ownerConfig(alias, pair.pub), now }
  );
  assert.equal(tampered.ok, false);
  assert.equal(tampered.status, 403);
  assert.match(tampered.reason, /content did not match/i);
});

test('owner bridge sends remember requests to private memory transport', async () => {
  let captured = null;
  const handler = createOrganismBridgeHandler({
    rememberAccessImpl: async () => ({
      ok: true,
      content: 'Keep this note',
      subject: 'Inbox',
      kind: 'note',
      sourceId: 'note-9',
      requestId: 'remember-9'
    }),
    rememberImpl: async (content, options) => {
      captured = { content, options };
      return { id: 'mem-9', content, sourceId: options.sourceId };
    },
    recallImpl: async () => { throw new Error('recall should not run'); }
  });
  const res = fakeResponse();
  await handler({ method: 'POST', url: '/remember', body: { organismRemember: true } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.memory.id, 'mem-9');
  assert.equal(captured.content, 'Keep this note');
  assert.equal(captured.options.sourceId, 'note-9');
});

test('OVH remember transport keeps note fields separate and encoded', async () => {
  let invocation;
  const memory = await rememberOnOvh('Remember this', {
    subject: 'Inbox note',
    kind: 'note',
    sourceId: 'note-safe-1',
    sshHost: '3dvr-ovh',
    remoteScript: '/private/bridge.js',
    execFileImpl: async (file, args) => {
      invocation = { file, args };
      return {
        stdout: JSON.stringify({
          ok: true,
          memory: {
            id: 'mem-safe-1',
            content: 'Remember this',
            subject: 'Inbox note',
            kind: 'note',
            sourceType: 'portal-master-notes',
            sourceId: 'note-safe-1'
          }
        })
      };
    }
  });
  assert.equal(memory.id, 'mem-safe-1');
  const index = invocation.args.indexOf('remember');
  assert.ok(index > -1);
  assert.equal(Buffer.from(invocation.args[index + 1], 'base64url').toString('utf8'), 'Remember this');
  assert.equal(Buffer.from(invocation.args[index + 2], 'base64url').toString('utf8'), 'Inbox note');
  assert.equal(Buffer.from(invocation.args[index + 4], 'base64url').toString('utf8'), 'note-safe-1');
});

test('Vercel relay routes durable saves to the remember bridge endpoint', async () => {
  let upstreamUrl = '';
  const relay = createOrganismVercelRelay({
    bridgeOrigin: 'https://memory.example',
    fetchImpl: async (url) => {
      upstreamUrl = String(url);
      return {
        status: 200,
        async json() { return { ok: true, memory: { id: 'mem-1' } }; }
      };
    }
  });
  const res = fakeResponse();
  await relay({ method: 'POST', body: { organismRemember: true } }, res);
  assert.equal(upstreamUrl, 'https://memory.example/remember');
  assert.equal(res.payload.memory.id, 'mem-1');
});
