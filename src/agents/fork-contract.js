import { PERMISSIONS as ASSEMBLY_PERMISSIONS } from '../../assembly/permissions.js';

// A "fork" is a child account Thomas creates from his own user, carrying a
// subset of his own permissions. This module is the record contract plus the
// pure rules around it: subset enforcement at creation time, revocation, and
// resolving a fork child's effective permissions. It mirrors the Assembly
// invite/grant contract shape (assembly/invite-contract.js) so the two
// delegation systems stay consistent.
//
// Persistence follows the Assembly grants pattern: fork records are plain
// objects that callers load (today: the THREEDVR_FORKS env JSON consumed by
// src/operator/developer-access.js) and pass in. This module does no I/O.

export const FORK_FORMAT = '3dvr-user-fork';
export const FORK_VERSION = 1;

// Operator developer-access vocabulary (src/operator/developer-access.js).
export const OPERATOR_PERMISSIONS = Object.freeze(['suggest', 'edit', 'github_write', 'admin']);
// Assembly workspace capabilities (assembly/permissions.js).
export const WORKSPACE_PERMISSIONS = Object.freeze(Object.values(ASSEMBLY_PERMISSIONS));
export const FORKABLE_PERMISSIONS = Object.freeze([
  ...OPERATOR_PERMISSIONS,
  ...WORKSPACE_PERMISSIONS,
]);

const requiredText = (value, label) => {
  const result = String(value || '').trim();
  if (!result) throw new Error(`${label} is required.`);
  return result;
};

const nowValue = value => (Number.isFinite(Number(value)) ? Number(value) : Date.now());

function defaultId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}_${uuid}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeForkAlias(value = '') {
  return String(value || '').trim().toLowerCase();
}

export function normalizePermissionList(value) {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const permission = String(item || '').trim();
    if (permission && !seen.has(permission)) {
      seen.add(permission);
      result.push(permission);
    }
  }
  return result;
}

export function assertKnownPermissions(permissions, label = 'Permissions') {
  const unknown = normalizePermissionList(permissions).filter(
    permission => !FORKABLE_PERMISSIONS.includes(permission)
  );
  if (unknown.length) {
    throw new Error(`${label} include unknown permissions: ${unknown.join(', ')}`);
  }
  return normalizePermissionList(permissions);
}

// The heart of the fork rule: a fork may only receive permissions its parent
// actually holds. Returns the requested permissions that the parent lacks.
export function permissionsBeyondParent(requested, parentPermissions) {
  const parent = new Set(normalizePermissionList(parentPermissions));
  return normalizePermissionList(requested).filter(permission => !parent.has(permission));
}

export function createForkRecord(input, options = {}) {
  const parentAlias = normalizeForkAlias(requiredText(input?.parentAlias, 'Parent alias'));
  const parentPub = requiredText(input?.parentPub, 'Parent public key');
  const childAlias = normalizeForkAlias(requiredText(input?.childAlias, 'Child alias'));
  const childPub = requiredText(input?.childPub, 'Child public key');

  if (childAlias === parentAlias || childPub === parentPub) {
    throw new Error('A fork must be a distinct account from its parent.');
  }

  const permissions = assertKnownPermissions(input?.permissions, 'Fork permissions');
  if (!permissions.length) throw new Error('Fork permissions are required.');

  const parentPermissions = assertKnownPermissions(
    input?.parentPermissions,
    'Parent permissions'
  );
  const beyond = permissionsBeyondParent(permissions, parentPermissions);
  if (beyond.length) {
    throw new Error(
      `Fork permissions exceed the parent account's permissions: ${beyond.join(', ')}`
    );
  }

  const idFactory = typeof options.idFactory === 'function'
    ? options.idFactory
    : () => defaultId('fork');

  return {
    format: FORK_FORMAT,
    version: FORK_VERSION,
    forkId: String(idFactory()),
    parentAlias,
    parentPub,
    childAlias,
    childPub,
    permissions,
    createdAt: nowValue(options.now),
    revokedAt: null,
    note: String(input?.note || ''),
  };
}

export function validateForkRecord(record) {
  if (!record || record.format !== FORK_FORMAT) throw new Error('Not a 3DVR user fork record.');
  if (record.version !== FORK_VERSION) throw new Error(`Unsupported fork version: ${record.version}`);
  requiredText(record.forkId, 'Fork ID');
  requiredText(record.parentPub, 'Parent public key');
  requiredText(record.childPub, 'Child public key');
  const parentAlias = normalizeForkAlias(requiredText(record.parentAlias, 'Parent alias'));
  const childAlias = normalizeForkAlias(requiredText(record.childAlias, 'Child alias'));
  if (childAlias === parentAlias || record.childPub === record.parentPub) {
    throw new Error('A fork must be a distinct account from its parent.');
  }
  const permissions = assertKnownPermissions(record.permissions, 'Fork permissions');
  if (!permissions.length) throw new Error('Fork permissions are required.');
  if (!Number.isFinite(Number(record.createdAt))) throw new Error('Fork creation time is required.');
  if (record.revokedAt != null && !Number.isFinite(Number(record.revokedAt))) {
    throw new Error('Fork revocation time is invalid.');
  }
  return {
    ...record,
    parentAlias,
    childAlias,
    permissions,
    createdAt: Number(record.createdAt),
    revokedAt: record.revokedAt == null ? null : Number(record.revokedAt),
    note: String(record.note || ''),
  };
}

// Lenient loader for stored config (mirrors parseBindings in
// src/operator/developer-access.js): invalid entries are skipped, never fatal.
export function parseForkRecords(value) {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value || '[]');
    } catch {
      return [];
    }
  }
  const list = Array.isArray(parsed) ? parsed : parsed?.forks;
  if (!Array.isArray(list)) return [];
  const records = [];
  for (const entry of list) {
    try {
      records.push(validateForkRecord(entry));
    } catch {
      // Skip malformed fork records; a bad entry must not break access checks.
    }
  }
  return records;
}

export function isForkActive(record) {
  return Boolean(record) && record.revokedAt == null;
}

export function revokeFork(record, now = Date.now()) {
  if (!record?.forkId) throw new Error('Fork ID is required.');
  return { ...record, revokedAt: nowValue(now) };
}

function identityMatchesFork(record, identity = {}) {
  const pub = String(identity.pub || '').trim();
  if (!pub || !record || record.childPub !== pub) return false;
  const alias = normalizeForkAlias(identity.alias);
  if (alias && record.childAlias !== alias) return false;
  return true;
}

export function findForksForIdentity(forks = [], identity = {}) {
  if (!Array.isArray(forks)) return [];
  return forks.filter(record => {
    try {
      validateForkRecord(record);
    } catch {
      return false;
    }
    return identityMatchesFork(record, identity);
  });
}

// Effective permissions a fork child holds right now: the union across its
// active forks. Revoked forks contribute nothing.
export function resolveForkPermissions(forks = [], identity = {}) {
  const granted = new Set();
  for (const record of findForksForIdentity(forks, identity)) {
    if (!isForkActive(record)) continue;
    for (const permission of normalizePermissionList(record.permissions)) {
      granted.add(permission);
    }
  }
  return [...granted];
}

export function forkAllows(forks = [], identity = {}, permission) {
  const wanted = String(permission || '').trim();
  if (!wanted) return false;
  return resolveForkPermissions(forks, identity).includes(wanted);
}
