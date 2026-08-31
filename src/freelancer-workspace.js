const SAFE_ID = /^[a-z0-9][a-z0-9-]{2,62}$/;

export const FREELANCER_WORKSPACE_VERSION = 1;
export const FREELANCER_WORKSPACE_ACTIONS = Object.freeze([
  'status',
  'provision',
  'start',
  'stop',
  'session',
]);

export const DEFAULT_FREELANCER_WORKSPACE_IMAGE = 'lscr.io/linuxserver/webtop:debian-xfce';

function normalizeText(value = '', max = 256) {
  return String(value || '').trim().slice(0, max);
}

export function normalizeWorkspaceSlug(value = '') {
  const normalized = normalizeText(value, 180)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 52);
  if (!normalized) return 'worker';
  if (normalized.length < 3) return `${normalized}-worker`;
  return normalized;
}

export function workspaceIdForIdentity(identity = {}) {
  const pub = normalizeText(identity.pub, 500);
  const alias = normalizeText(identity.alias, 200);
  const stableSource = pub || alias;
  if (!stableSource) throw new Error('A signed worker identity is required.');
  const prefix = normalizeWorkspaceSlug(alias.split('@')[0] || 'worker').slice(0, 24);
  const suffix = normalizeWorkspaceSlug(stableSource).replace(/-/g, '').slice(-12) || 'workspace';
  return `fw-${prefix}-${suffix}`.slice(0, 63).replace(/-+$/g, '');
}

export function validateWorkspaceId(workspaceId = '') {
  const value = normalizeText(workspaceId, 80).toLowerCase();
  if (!SAFE_ID.test(value)) throw new Error('Invalid freelancer workspace id.');
  return value;
}

export function validateWorkspaceAction(action = '') {
  const value = normalizeText(action, 32).toLowerCase();
  if (!FREELANCER_WORKSPACE_ACTIONS.includes(value)) {
    throw new Error(`Unsupported freelancer workspace action: ${value || 'missing'}`);
  }
  return value;
}

export function buildFreelancerWorkspaceSpec({ identity = {}, timezone = 'America/Los_Angeles' } = {}) {
  const workspaceId = validateWorkspaceId(workspaceIdForIdentity(identity));
  return {
    version: FREELANCER_WORKSPACE_VERSION,
    workspaceId,
    owner: {
      pub: normalizeText(identity.pub, 500),
      alias: normalizeText(identity.alias, 200),
    },
    image: DEFAULT_FREELANCER_WORKSPACE_IMAGE,
    timezone: normalizeText(timezone, 80) || 'UTC',
    resources: {
      cpu: 1,
      memoryMb: 1536,
      shmMb: 1024,
    },
    persistence: {
      browserProfile: true,
      volumeKey: workspaceId,
      mountPath: '/config',
    },
    lifecycle: {
      startOnDemand: true,
      suspendAfterIdleMinutes: 20,
      keepVolumeWhenStopped: true,
    },
    capabilities: {
      browser: true,
      desktop: true,
      portalSessions: true,
      gmailConnector: true,
      outlookConnector: true,
      calendarConnector: true,
      auditLog: true,
    },
    security: {
      dedicatedContainer: true,
      hostDockerSocket: false,
      privileged: false,
      publicInternetExposure: false,
      accessMode: 'reverse-proxy-session',
    },
  };
}

const REDACT_KEYS = /(password|secret|token|authorization|cookie|credential|refresh)/i;

export function redactWorkspacePayload(value) {
  if (Array.isArray(value)) return value.map(redactWorkspacePayload);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    REDACT_KEYS.test(key) ? '[redacted]' : redactWorkspacePayload(item),
  ]));
}

export function buildWorkspaceControlRequest({ action, identity, timezone } = {}) {
  const normalizedAction = validateWorkspaceAction(action);
  const spec = buildFreelancerWorkspaceSpec({ identity, timezone });
  return {
    action: normalizedAction,
    workspaceId: spec.workspaceId,
    spec,
  };
}
