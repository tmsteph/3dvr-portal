import { ACCESS_PROFILES, can } from './permissions.js';

export const INVITE_FORMAT = '3dvr-assembly-invite';
export const INVITE_VERSION = 1;

const requiredText = (value, label) => {
  const result = String(value || '').trim();
  if (!result) throw new Error(`${label} is required.`);
  return result;
};

const nowValue = value => Number.isFinite(Number(value)) ? Number(value) : Date.now();

function defaultId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}_${uuid}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createWorkspaceInvite(input, options = {}) {
  const workspaceId = requiredText(input?.workspaceId, 'Workspace ID');
  const issuerPrincipalId = requiredText(input?.issuerPrincipalId, 'Issuer principal ID');
  const recipientPrincipalId = requiredText(input?.recipientPrincipalId, 'Recipient principal ID');
  const profile = requiredText(input?.profile, 'Authorization profile');
  if (!ACCESS_PROFILES[profile]) throw new Error(`Unknown authorization profile: ${profile}`);

  const issuedAt = nowValue(options.now);
  const expiresAt = Number(input?.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= issuedAt) throw new Error('Invite expiry must be after issue time.');
  const idFactory = typeof options.idFactory === 'function' ? options.idFactory : () => defaultId('invite');

  return {
    format: INVITE_FORMAT,
    version: INVITE_VERSION,
    inviteId: String(idFactory()),
    workspaceId,
    issuerPrincipalId,
    recipientPrincipalId,
    profile,
    issuedAt,
    expiresAt,
    proof: '',
  };
}

export function inviteSigningPayload(invite) {
  return JSON.stringify({
    format: invite.format,
    version: invite.version,
    inviteId: invite.inviteId,
    workspaceId: invite.workspaceId,
    issuerPrincipalId: invite.issuerPrincipalId,
    recipientPrincipalId: invite.recipientPrincipalId,
    profile: invite.profile,
    issuedAt: invite.issuedAt,
    expiresAt: invite.expiresAt,
  });
}

export function sealWorkspaceInvite(invite, proof) {
  const normalizedProof = requiredText(proof, 'Invite proof');
  return { ...invite, proof: normalizedProof };
}

export function validateWorkspaceInvite(invite, options = {}) {
  if (!invite || invite.format !== INVITE_FORMAT) throw new Error('Not an Assembly invite.');
  if (invite.version !== INVITE_VERSION) throw new Error(`Unsupported invite version: ${invite.version}`);
  requiredText(invite.inviteId, 'Invite ID');
  requiredText(invite.workspaceId, 'Workspace ID');
  requiredText(invite.issuerPrincipalId, 'Issuer principal ID');
  requiredText(invite.recipientPrincipalId, 'Recipient principal ID');
  if (!ACCESS_PROFILES[invite.profile]) throw new Error(`Unknown authorization profile: ${invite.profile}`);
  const now = nowValue(options.now);
  if (!Number.isFinite(Number(invite.expiresAt)) || Number(invite.expiresAt) <= now) throw new Error('Invite has expired.');
  requiredText(invite.proof, 'Invite proof');
  if (typeof options.verifyProof !== 'function') throw new Error('Invite proof verifier is required.');
  if (!options.verifyProof(inviteSigningPayload(invite), invite.proof, invite.issuerPrincipalId)) {
    throw new Error('Invite proof is invalid.');
  }
  return { ...invite };
}

export function acceptWorkspaceInvite(invite, input, options = {}) {
  const recipientPrincipalId = requiredText(input?.recipientPrincipalId, 'Recipient principal ID');
  const validated = validateWorkspaceInvite(invite, options);
  if (recipientPrincipalId !== validated.recipientPrincipalId) throw new Error('Invite recipient does not match accepting principal.');
  const idFactory = typeof options.grantIdFactory === 'function' ? options.grantIdFactory : () => defaultId('grant');
  const grantedAt = nowValue(options.now);
  return {
    grantId: String(idFactory()),
    workspaceId: validated.workspaceId,
    principalId: recipientPrincipalId,
    profile: validated.profile,
    issuedBy: validated.issuerPrincipalId,
    sourceInviteId: validated.inviteId,
    grantedAt,
    revokedAt: null,
  };
}

export function revokeWorkspaceGrant(grant, now = Date.now()) {
  if (!grant?.grantId) throw new Error('Grant ID is required.');
  return { ...grant, revokedAt: nowValue(now) };
}

export function grantAllows(grant, permission) {
  if (!grant || grant.revokedAt != null) return false;
  return can(grant.profile, permission);
}
