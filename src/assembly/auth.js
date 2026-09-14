import { verifySignedSeaPayload } from '../auth/sea.js';
import { authorizeWorkspaceCapability } from '../../assembly/authorization.js';
import { createAuthenticatedPrincipal } from '../../assembly/principal-contract.js';

export const ASSEMBLY_AUTH_SCOPE = 'assembly-workspace';

const normalizeText = value => String(value || '').trim();

export async function verifyAssemblyPrincipal(payload = {}, options = {}) {
  const expectedWorkspaceId = normalizeText(options.workspaceId || payload.workspaceId);
  const expectedPermission = normalizeText(options.permission || payload.action);
  if (!expectedWorkspaceId) return { ok: false, reason: 'Workspace ID is required.' };
  if (!expectedPermission) return { ok: false, reason: 'Assembly capability is required.' };

  const verified = await verifySignedSeaPayload(payload, {
    scope: ASSEMBLY_AUTH_SCOPE,
    expectedOrigin: options.expectedOrigin,
    maxAgeMs: options.maxAgeMs,
    now: options.now,
    config: options.config,
  });
  if (!verified.ok) return verified;

  const signedWorkspaceId = normalizeText(verified.verified?.workspaceId);
  if (signedWorkspaceId !== expectedWorkspaceId) {
    return { ok: false, reason: 'Access proof did not match this Assembly workspace.' };
  }
  if (verified.identity.action !== expectedPermission) {
    return { ok: false, reason: 'Access proof did not match the requested Assembly capability.' };
  }

  const principal = createAuthenticatedPrincipal({
    id: `sea:${verified.identity.pub}`,
    type: 'user',
    issuer: 'gun-sea',
    subject: verified.identity.pub,
    displayName: verified.identity.alias,
    assurance: 'strong',
    authenticatedAt: verified.identity.issuedAt,
  }, { now: verified.identity.issuedAt });

  return {
    ok: true,
    principal,
    workspaceId: expectedWorkspaceId,
    permission: expectedPermission,
    proof: verified,
  };
}

export async function authorizeAssemblyRequest(payload = {}, options = {}) {
  const verified = await verifyAssemblyPrincipal(payload, options);
  if (!verified.ok) return verified;

  const authorization = authorizeWorkspaceCapability({
    principal: verified.principal,
    workspaceId: verified.workspaceId,
    permission: verified.permission,
    grants: Array.isArray(options.grants) ? options.grants : [],
  });

  if (!authorization.allowed) {
    return {
      ok: false,
      reason: authorization.reason,
      principal: verified.principal,
      authorization,
    };
  }

  return {
    ok: true,
    principal: verified.principal,
    workspaceId: verified.workspaceId,
    permission: verified.permission,
    authorization,
  };
}
