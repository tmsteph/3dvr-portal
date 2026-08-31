import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFreelancerWorkspaceSpec,
  buildWorkspaceControlRequest,
  redactWorkspacePayload,
  validateWorkspaceAction,
  workspaceIdForIdentity,
} from '../src/freelancer-workspace.js';

test('workspace id is stable and safe for a signed identity', () => {
  const identity = { alias: 'Thomas@example.com', pub: 'PUB.ABC+123/xyz' };
  const first = workspaceIdForIdentity(identity);
  const second = workspaceIdForIdentity(identity);
  assert.equal(first, second);
  assert.match(first, /^[a-z0-9][a-z0-9-]{2,62}$/);
});

test('workspace spec keeps browser state persistent but container disposable', () => {
  const spec = buildFreelancerWorkspaceSpec({ identity: { alias: 'worker@example.com', pub: 'pub-1234567890' } });
  assert.equal(spec.persistence.browserProfile, true);
  assert.equal(spec.lifecycle.startOnDemand, true);
  assert.equal(spec.lifecycle.keepVolumeWhenStopped, true);
  assert.equal(spec.security.hostDockerSocket, false);
  assert.equal(spec.security.privileged, false);
  assert.equal(spec.capabilities.gmailConnector, true);
  assert.equal(spec.capabilities.outlookConnector, true);
});

test('control request rejects unknown actions', () => {
  assert.throws(() => validateWorkspaceAction('delete-everything'), /Unsupported/);
  const request = buildWorkspaceControlRequest({
    action: 'provision',
    identity: { alias: 'worker@example.com', pub: 'pub-1234567890' },
  });
  assert.equal(request.action, 'provision');
  assert.equal(request.workspaceId, request.spec.workspaceId);
});

test('public workspace payload redacts credentials recursively', () => {
  const value = redactWorkspacePayload({
    status: 'running',
    session: { url: 'https://workspace.example', password: 'nope', accessToken: 'secret' },
    nested: [{ refreshToken: 'secret', ok: true }],
  });
  assert.equal(value.session.password, '[redacted]');
  assert.equal(value.session.accessToken, '[redacted]');
  assert.equal(value.nested[0].refreshToken, '[redacted]');
  assert.equal(value.nested[0].ok, true);
});
