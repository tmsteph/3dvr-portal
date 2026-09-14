export const PERMISSIONS = Object.freeze({
  READ: 'workspace.read',
  WRITE: 'workspace.write',
  EXPORT: 'workspace.export',
  MANAGE_ACCESS: 'workspace.manage_access',
  SYNC: 'workspace.sync',
});

export const ACCESS_PROFILES = Object.freeze({
  owner: Object.freeze([
    PERMISSIONS.READ,
    PERMISSIONS.WRITE,
    PERMISSIONS.EXPORT,
    PERMISSIONS.MANAGE_ACCESS,
    PERMISSIONS.SYNC,
  ]),
  editor: Object.freeze([
    PERMISSIONS.READ,
    PERMISSIONS.WRITE,
    PERMISSIONS.EXPORT,
  ]),
  viewer: Object.freeze([
    PERMISSIONS.READ,
    PERMISSIONS.EXPORT,
  ]),
});

export function permissionsForProfile(profile) {
  return ACCESS_PROFILES[profile] ? [...ACCESS_PROFILES[profile]] : [];
}

export function can(profile, permission) {
  return permissionsForProfile(profile).includes(permission);
}

export function createLocalOwnerPrincipal(workspaceId) {
  if (!workspaceId) throw new Error('Workspace ID is required for a local owner principal.');
  return Object.freeze({
    type: 'local-owner',
    workspaceId,
    profile: 'owner',
  });
}
