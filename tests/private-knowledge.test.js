import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

try { globalThis.crypto = webcrypto; } catch {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
}
try { globalThis.self = globalThis; } catch {}

const { default: SEA } = await import('gun/sea.js');
const { resolvePrivateKnowledgeAccess } = await import('../src/organism/access.js');
const {
  listPrivateKnowledge,
  normalizeKnowledgePath,
  readPrivateKnowledge
} = await import('../src/organism/knowledge.js');
const { createOrganismBridgeHandler } = await import('../src/organism/bridge.js');

const ORIGIN = 'https://portal.3dvr.tech';

function ownerConfig(alias, pub) {
  return {
    THREEDVR_OPERATOR_OWNER_BINDINGS: JSON.stringify({ [alias]: pub }),
    THREEDVR_ORGANISM_ALLOWED_ORIGINS: ORIGIN
  };
}

async function signedKnowledge({ pair, alias, action, note = '', requestId = 'knowledge-1', iat = Date.now() }) {
  const signed = {
    scope: 'digital-organism',
    action,
    alias,
    pub: pair.pub,
    origin: ORIGIN,
    iat,
    requestId,
    ...(action === 'knowledge-read' ? { note } : {})
  };
  return {
    authPub: pair.pub,
    authProof: await SEA.sign(signed, pair),
    requestId,
    ...(action === 'knowledge-read' ? { note } : {})
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

test('owner-signed knowledge list request is accepted', async () => {
  const pair = await SEA.pair();
  const alias = 'knowledge-owner@test';
  const now = Date.now();
  const payload = await signedKnowledge({ pair, alias, action: 'knowledge-list', iat: now });
  const result = await resolvePrivateKnowledgeAccess(payload, {
    config: ownerConfig(alias, pair.pub),
    now
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'list');
});

test('knowledge read proof is bound to the exact note path', async () => {
  const pair = await SEA.pair();
  const alias = 'knowledge-owner@test';
  const now = Date.now();
  const payload = await signedKnowledge({
    pair, alias, action: 'knowledge-read', note: 'people/mark-nadal', iat: now
  });
  payload.note = 'people/different-note';
  const result = await resolvePrivateKnowledgeAccess(payload, {
    config: ownerConfig(alias, pair.pub),
    now
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.match(result.reason, /did not match/i);
});

test('private knowledge storage lists and reads markdown below its root only', async () => {
  const root = await mkdtemp(path.join(tmpdir(), '3dvr-knowledge-'));
  await mkdir(path.join(root, 'people'), { recursive: true });
  await writeFile(path.join(root, 'people', 'mark-nadal.md'), '# Mark Nadal\n\nPrivate note.\n');
  const listed = await listPrivateKnowledge({ root });
  assert.deepEqual(listed.notes.map(note => note.path), ['people/mark-nadal']);
  const read = await readPrivateKnowledge('people/mark-nadal', { root });
  assert.match(read.content, /Private note/);
  assert.equal(normalizeKnowledgePath('../etc/passwd'), '');
  await assert.rejects(() => readPrivateKnowledge('../etc/passwd', { root }), /Invalid knowledge note path/);
});

test('owner bridge serves authorized private knowledge without invoking recall', async () => {
  let recalled = false;
  let readNote = '';
  const handler = createOrganismBridgeHandler({
    knowledgeAccessImpl: async () => ({
      ok: true,
      mode: 'read',
      note: 'people/mark-nadal',
      requestId: 'knowledge-2'
    }),
    knowledgeReadImpl: async note => {
      readNote = note;
      return { path: note, content: '# Mark', updatedAt: '2026-09-29T00:00:00.000Z' };
    },
    recallImpl: async () => { recalled = true; return {}; }
  });
  const res = fakeResponse();
  await handler({
    method: 'POST',
    url: '/knowledge',
    body: { privateKnowledge: true }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(readNote, 'people/mark-nadal');
  assert.equal(recalled, false);
  assert.equal(res.payload.mode, 'read');
  assert.equal(res.payload.content, '# Mark');
});

test('Vercel relay sends private knowledge requests to the knowledge bridge path', async () => {
  const { createOrganismVercelRelay } = await import('../src/organism/vercel-relay.js');
  let requestedUrl = '';
  const relay = createOrganismVercelRelay({
    bridgeOrigin: 'https://bridge.example',
    fetchImpl: async url => {
      requestedUrl = String(url);
      return {
        status: 200,
        json: async () => ({ ok: true, mode: 'list', notes: [] })
      };
    }
  });
  const res = fakeResponse();
  await relay({
    method: 'POST',
    body: { privateKnowledge: true, requestId: 'knowledge-3' }
  }, res);
  assert.equal(requestedUrl, 'https://bridge.example/__3dvr-private-knowledge');
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
});
