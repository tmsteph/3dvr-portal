import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { createSessionHandler } from '../api/session.js';
import { buildTurnCredentialPayload } from '../src/webrtc/turn-credentials.js';

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.ended = true;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    }
  };
}

describe('TURN credentials', () => {
  it('falls back to STUN when TURN env vars are missing', () => {
    const payload = buildTurnCredentialPayload({ config: {} });

    assert.equal(payload.configured, false);
    assert.equal(payload.iceServers.length, 1);
    assert.deepEqual(payload.iceServers[0].urls, [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302'
    ]);
  });

  it('mints coturn REST credentials from the shared secret', () => {
    const nowMs = Date.parse('2026-05-22T20:00:00Z');
    const payload = buildTurnCredentialPayload({
      nowMs,
      randomId: () => 'abc123',
      config: {
        TURN_URLS: 'turn:turn.3dvr.tech:3478?transport=udp,turns:turn.3dvr.tech:5349?transport=tcp',
        TURN_REALM: 'turn.3dvr.tech',
        TURN_STATIC_AUTH_SECRET: 'shared-secret',
        TURN_TTL_SECONDS: '600',
        TURN_USERNAME_PREFIX: 'test'
      }
    });

    const expiresAt = Math.floor(nowMs / 1000) + 600;
    const username = `${expiresAt}:test-abc123`;
    const expectedCredential = createHmac('sha1', 'shared-secret')
      .update(username)
      .digest('base64');

    assert.equal(payload.configured, true);
    assert.equal(payload.ttlSeconds, 600);
    assert.equal(payload.expiresAt, expiresAt);
    assert.equal(payload.realm, 'turn.3dvr.tech');
    assert.equal(payload.iceServers.length, 2);
    assert.equal(payload.iceServers[1].username, username);
    assert.equal(payload.iceServers[1].credential, expectedCredential);
    assert.deepEqual(payload.iceServers[1].urls, [
      'turn:turn.3dvr.tech:3478?transport=udp',
      'turns:turn.3dvr.tech:5349?transport=tcp'
    ]);
  });

  it('serves no-store JSON from the shared session endpoint', async () => {
    const handler = createSessionHandler({ config: {} });
    const getResponse = createMockResponse();
    await handler({
      method: 'GET',
      url: '/api/session?route=turn-credentials',
      headers: {}
    }, getResponse);

    assert.equal(getResponse.statusCode, 200);
    assert.equal(getResponse.headers['cache-control'], 'no-store');
    assert.equal(getResponse.body.configured, false);
  });
});
