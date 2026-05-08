import assert from 'node:assert/strict';
import test from 'node:test';
import SEA from 'gun/sea.js';
import { createSessionHandler } from '../api/session.js';

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end(payload) {
      this.ended = true;
      this.body = payload ?? this.body;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    }
  };
}

test('session handler returns current cookie-backed identity', async () => {
  const handler = createSessionHandler();
  const req = {
    method: 'GET',
    headers: {
      cookie: 'portalIdentity=' + encodeURIComponent(JSON.stringify({
        alias: 'pilot@3dvr',
        username: 'Pilot',
        signedIn: true,
        authMethod: 'sea',
        authProvider: 'gun',
        updatedAt: 1234
      })),
      'user-agent': 'Mozilla/5.0'
    }
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.authenticated, true);
  assert.equal(res.body.identity.alias, 'pilot@3dvr');
  assert.equal(res.body.identity.authMethod, 'sea');
});

test('session handler verifies SEA auth and issues a shared cookie', async () => {
  const pair = await SEA.pair();
  const authProof = await SEA.sign({
    scope: 'portal-session',
    action: 'session',
    alias: 'pilot@3dvr',
    pub: pair.pub,
    origin: 'https://portal.3dvr.tech',
    iat: Date.now()
  }, pair);

  const handler = createSessionHandler({
    config: {
      PORTAL_ORIGIN: 'https://portal.3dvr.tech'
    }
  });
  const req = {
    method: 'POST',
    headers: {
      host: 'portal.3dvr.tech',
      'user-agent': 'Mozilla/5.0'
    },
    body: {
      authPub: pair.pub,
      authProof,
      origin: 'https://portal.3dvr.tech',
      action: 'session',
      device: {
        userAgent: 'Mozilla/5.0',
        platform: 'Android',
        cores: 8,
        memory: 4,
        network: '4g',
        touch: true
      }
    }
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.authenticated, true);
  assert.equal(res.body.identity.alias, 'pilot@3dvr');
  assert.equal(res.body.identity.scope, 'portal-session');
  assert.match(String(res.headers['Set-Cookie'] || ''), /portalIdentity=/);
});

test('session handler rejects bad methods', async () => {
  const handler = createSessionHandler();
  const req = { method: 'PUT', headers: {} };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 405);
  assert.deepEqual(res.body, { error: 'Method Not Allowed' });
});
