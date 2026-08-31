import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildQueuedWorkspaceControlRecord,
  buildWorkspaceControlProofPayload,
} from '../src/freelancer-workspace-control.js';

test('workspace control proof binds action, request and worker workspace', () => {
  const payload = buildWorkspaceControlProofPayload({
    action: 'start',
    requestId: 'req_12345678',
    identity: { alias: 'worker@example.com', pub: 'pub-1234567890' },
    origin: 'https://portal.3dvr.tech',
    now: 1788141600000,
  });
  assert.equal(payload.action, 'start');
  assert.equal(payload.pub, 'pub-1234567890');
  assert.match(payload.workspaceId, /^fw-/);
  const record = buildQueuedWorkspaceControlRecord({ payload, authProof: 'SEA-signature' });
  assert.equal(record.id, payload.requestId);
  assert.equal(record.workspaceId, payload.workspaceId);
  assert.equal(record.status, 'queued');
});

test('workspace session credentials can never be requested through remote control', () => {
  assert.throws(() => buildWorkspaceControlProofPayload({
    action: 'session',
    requestId: 'req_12345678',
    identity: { alias: 'worker@example.com', pub: 'pub-1234567890' },
  }), /not available remotely/);
});
