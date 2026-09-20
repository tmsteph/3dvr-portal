import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { createSecretHandoffHandler, handoffRequestHash } from '../src/secret-handoff/handler.js';
import { BUILTIN_OPERATOR_OWNER_BINDINGS } from '../src/operator/developer-access.js';

const OWNER_ALIAS = 'tmsteph@3dvr';
const OWNER_PUB = BUILTIN_OPERATOR_OWNER_BINDINGS[OWNER_ALIAS];
const subtle = webcrypto.subtle;

function response() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

function request(body) {
  return {
    method: 'POST',
    headers: {
      host: 'portal.3dvr.tech',
      origin: 'https://portal.3dvr.tech',
      'x-forwarded-proto': 'https',
    },
    body,
  };
}

function verification(details) {
  const requestHash = handoffRequestHash(details);
  return async () => ({
    ok: true,
    identity: {
      alias: OWNER_ALIAS,
      pub: OWNER_PUB,
      action: 'create',
      origin: 'https://portal.3dvr.tech',
      issuedAt: Date.now(),
      scope: 'secret-handoff-owner',
    },
    verified: {
      alias: OWNER_ALIAS,
      pub: OWNER_PUB,
      action: 'create',
      handoffRequestHash: requestHash,
      scope: 'secret-handoff-owner',
    },
  });
}

function parseShareUrl(shareUrl) {
  const url = new URL(shareUrl);
  const id = url.searchParams.get('id');
  const token = new URLSearchParams(url.hash.replace(/^#/, '')).get('token');
  return { id, token };
}

function b64url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

async function encrypt(id, publicKeyJwk, value) {
  const recipientKey = await subtle.importKey(
    'jwk',
    publicKeyJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const ephemeral = await subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const shared = await subtle.deriveBits(
    { name: 'ECDH', public: recipientKey },
    ephemeral.privateKey,
    256,
  );
  const hkdfKey = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const info = Buffer.from(`3dvr-secret-handoff:v1:${id}`, 'utf8');
  const key = await subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const plaintext = Buffer.from(JSON.stringify({ value }), 'utf8');
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: info, tagLength: 128 },
    key,
    plaintext,
  );
  return {
    v: 1,
    kem: 'P-256-ECDH',
    kdf: 'HKDF-SHA256',
    aead: 'AES-256-GCM',
    epk: await subtle.exportKey('jwk', ephemeral.publicKey),
    salt: b64url(salt),
    iv: b64url(iv),
    ciphertext: b64url(ciphertext),
  };
}

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '3dvr-handoff-'));
  const details = {
    key: 'CVW_N8N_API_KEY',
    label: 'n8n API key',
    purpose: 'Connect CVW n8n securely to 3DVR',
    recipient: 'Tom',
    ttlMinutes: 60,
  };
  const config = {
    THREEDVR_SECRET_HANDOFF_STATE: path.join(dir, 'state.json'),
    THREEDVR_SECRET_HANDOFF_PUBLIC_ORIGIN: 'https://portal.3dvr.tech',
  };
  return { dir, details, config };
}

test('browser encrypted secret is stored once without plaintext persistence', async () => {
  const { dir, details, config } = fixture();
  const secret = 'fixture-secret-never-persist-me';
  let brokerCall;
  try {
    const handler = createSecretHandoffHandler({
      config,
      verify: verification(details),
      brokerRequest: async input => {
        brokerCall = input;
        return {
          status: 201,
          body: {
            ok: true,
            decision: 'allowed',
            stored: { id: 'openbao-created-1', key: details.key },
          },
        };
      },
    });

    const createRes = response();
    await handler(request({ action: 'create', ...details }), createRes);
    assert.equal(createRes.statusCode, 201);
    assert.equal(createRes.body.protocol, '3dvr-secret-handoff/1');
    const capability = parseShareUrl(createRes.body.shareUrl);
    assert.ok(capability.id);
    assert.ok(capability.token);

    const describeRes = response();
    await handler(request({ action: 'describe', ...capability }), describeRes);
    assert.equal(describeRes.statusCode, 200);
    assert.equal(describeRes.body.request.label, details.label);
    assert.ok(describeRes.body.request.publicKey);

    const envelope = await encrypt(capability.id, describeRes.body.request.publicKey, secret);
    const submitRes = response();
    await handler(request({ action: 'submit', ...capability, envelope }), submitRes);
    assert.equal(submitRes.statusCode, 201);
    assert.equal(submitRes.body.stored, true);
    assert.equal(JSON.stringify(submitRes.body).includes(secret), false);
    assert.equal(brokerCall.endpoint, '/v1/store');
    assert.equal(brokerCall.payload.key, details.key);
    assert.equal(brokerCall.payload.value, secret);

    const stateRaw = fs.readFileSync(config.THREEDVR_SECRET_HANDOFF_STATE, 'utf8');
    assert.equal(stateRaw.includes(secret), false);
    const state = JSON.parse(stateRaw);
    const stored = state.requests[capability.id];
    assert.equal(stored.status, 'stored');
    assert.equal('privateKey' in stored, false);
    assert.equal('publicKey' in stored, false);

    const repeatRes = response();
    await handler(request({ action: 'submit', ...capability, envelope }), repeatRes);
    assert.equal(repeatRes.statusCode, 409);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('invalid capability cannot describe a secret request', async () => {
  const { dir, details, config } = fixture();
  try {
    const handler = createSecretHandoffHandler({
      config,
      verify: verification(details),
      brokerRequest: async () => { throw new Error('must not run'); },
    });
    const createRes = response();
    await handler(request({ action: 'create', ...details }), createRes);
    const capability = parseShareUrl(createRes.body.shareUrl);
    const res = response();
    await handler(request({ action: 'describe', id: capability.id, token: 'wrong-token-that-is-long-enough-1234567890' }), res);
    assert.equal(res.statusCode, 404);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('failed broker store does not consume the handoff request', async () => {
  const { dir, details, config } = fixture();
  try {
    const handler = createSecretHandoffHandler({
      config,
      verify: verification(details),
      brokerRequest: async () => ({
        status: 503,
        body: { ok: false, decision: 'backend_unavailable' },
      }),
    });
    const createRes = response();
    await handler(request({ action: 'create', ...details }), createRes);
    const capability = parseShareUrl(createRes.body.shareUrl);
    const describeRes = response();
    await handler(request({ action: 'describe', ...capability }), describeRes);
    const envelope = await encrypt(capability.id, describeRes.body.request.publicKey, 'retry-me');
    const submitRes = response();
    await handler(request({ action: 'submit', ...capability, envelope }), submitRes);
    assert.equal(submitRes.statusCode, 503);

    const retryDescribe = response();
    await handler(request({ action: 'describe', ...capability }), retryDescribe);
    assert.equal(retryDescribe.statusCode, 200);
    assert.equal(retryDescribe.body.request.status, 'pending');
    assert.ok(retryDescribe.body.request.publicKey);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
