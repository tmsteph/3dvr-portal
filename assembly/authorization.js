import { can } from './permissions.js';
import { grantAllows } from './invite-contract.js';
import { validateAuthenticatedPrincipal } from './principal-contract.js';

const deny = reason => ({ allowed: false, reason });

export function authorizeWorkspaceCapability({ principal, workspaceId, permission, grants = [] }) {
  if (!workspaceId) return deny('workspace-required');
  if (!permission) return deny('permission-required');
  if (!principal) return deny('principal-required');

  if (principal.type === 'local-owner') {
    if (principal.workspaceId !== workspaceId) return deny('workspace-mismatch');
    return can('owner', permission)
      ? { allowed: true, reason: 'local-owner', profile: 'owner', grantId: null }
      : deny('permission-not-defined');
  }

  let authenticated;
  try {
    authenticated = validateAuthenticatedPrincipal(principal);
  } catch {
    return deny('principal-not-authenticated');
  }

  const matching = grants.filter(grant =>
    grant &&
    grant.workspaceId === workspaceId &&
    grant.principalId === authenticated.id &&
    grant.revokedAt == null
  );

  if (!matching.length) return deny('no-active-grant');
  const grant = matching.find(item => grantAllows(item, permission));
  if (!grant) return deny('grant-insufficient');

  return {
    allowed: true,
    reason: 'grant',
    profile: grant.profile,
    grantId: grant.grantId,
  };
}
