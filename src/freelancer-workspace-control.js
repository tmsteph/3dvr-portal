import { validateWorkspaceAction, workspaceIdForIdentity } from './freelancer-workspace.js';

export const FREELANCER_WORKSPACE_CONTROL_SCOPE = 'freelancer-workspace-control-v1';
export const FREELANCER_WORKSPACE_REMOTE_ACTIONS = Object.freeze(['status', 'provision', 'start', 'stop']);

function normalizeText(value = '', max = 500) {
  return String(value || '').trim().slice(0, max);
}

export function validateWorkspaceRequestId(value = '') {
  const requestId = normalizeText(value, 100);
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)) throw new Error('Invalid workspace request id.');
  return requestId;
}

export function buildWorkspaceControlProofPayload({
  action,
  identity = {},
  requestId,
  origin = '',
  timezone = 'America/Los_Angeles',
  now = Date.now(),
} = {}) {
  const normalizedAction = validateWorkspaceAction(action);
  if (!FREELANCER_WORKSPACE_REMOTE_ACTIONS.includes(normalizedAction)) {
    throw new Error(`Workspace action is not available remotely: ${normalizedAction}`);
  }
  const id = validateWorkspaceRequestId(requestId);
  const pub = normalizeText(identity.pub, 500);
  const alias = normalizeText(identity.alias, 200);
  if (!pub) throw new Error('A signed 3DVR public key is required.');
  return {
    scope: FREELANCER_WORKSPACE_CONTROL_SCOPE,
    action: normalizedAction,
    requestId: id,
    workspaceId: workspaceIdForIdentity({ pub, alias }),
    pub,
    alias,
    origin: normalizeText(origin, 500),
    timezone: normalizeText(timezone, 80) || 'UTC',
    iat: Number(now),
  };
}

export function buildQueuedWorkspaceControlRecord({ payload = {}, authProof = '' } = {}) {
  const proof = normalizeText(authProof, 12000);
  if (!proof) throw new Error('Signed workspace proof is required.');
  return {
    id: validateWorkspaceRequestId(payload.requestId),
    workspaceId: normalizeText(payload.workspaceId, 80),
    action: normalizeText(payload.action, 32),
    authPub: normalizeText(payload.pub, 500),
    authProof: proof,
    requestedAt: new Date(Number(payload.iat)).toISOString(),
    status: 'queued',
  };
}
