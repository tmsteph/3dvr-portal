import { normalizeAssemblyState } from './data.js';

export const SYNC_FORMAT = '3dvr-assembly-sync-envelope';
export const SYNC_VERSION = 1;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function fingerprintAssemblyState(state) {
  const normalized = normalizeAssemblyState(state);
  return `v1-${fnv1a(JSON.stringify(canonicalize(normalized)))}`;
}

export function createSyncEnvelope(state, options = {}) {
  const normalized = normalizeAssemblyState(state);
  if (!normalized.workspace.id) throw new Error('Workspace identity is required before sync.');
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  return {
    format: SYNC_FORMAT,
    version: SYNC_VERSION,
    workspaceId: normalized.workspace.id,
    generatedAt: new Date(now).toISOString(),
    baseVersion: options.baseVersion || null,
    stateVersion: fingerprintAssemblyState(normalized),
    deviceId: String(options.deviceId || ''),
    state: normalized,
  };
}

export function validateSyncEnvelope(value) {
  const envelope = value && typeof value === 'object' ? value : null;
  if (!envelope || envelope.format !== SYNC_FORMAT) throw new Error('Not an Assembly sync envelope.');
  if (envelope.version !== SYNC_VERSION) throw new Error(`Unsupported sync version: ${envelope.version}`);
  const normalized = normalizeAssemblyState(envelope.state);
  if (!envelope.workspaceId || normalized.workspace.id !== envelope.workspaceId) {
    throw new Error('Workspace identity mismatch.');
  }
  if (fingerprintAssemblyState(normalized) !== envelope.stateVersion) {
    throw new Error('Assembly state fingerprint mismatch.');
  }
  return { ...envelope, state: normalized };
}
