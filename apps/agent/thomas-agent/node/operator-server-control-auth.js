const Gun = require('gun');
require('gun/sea');

const {
  decodeForgeProof,
  resolvePolicy,
  verifySeaProofWithNativeWebCrypto,
} = require('./operator-forge-auth');

const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;
const SERVER_CONTROL_OWNER_ALIAS = 'tmsteph@3dvr';
const ALLOWED_SERVERS = new Set(['ovh', 'hetzner', 'digitalocean']);
const ALLOWED_OPERATIONS = new Set(['health', 'service_status', 'service_restart']);
const ALLOWED_SERVICES = new Set([
  '3dvr-personal-mcp.service',
  '3dvr-secrets-broker.service',
  '3dvr-self-host-portal.service',
  'openbao.service',
]);

function text(value = '') {
  return String(value || '').trim();
}

function alias(value = '') {
  return text(value).toLowerCase();
}

async function verifyProof(proof, pub, options = {}) {
  if (options.verifyImpl) return options.verifyImpl(proof, pub);
  const native = await verifySeaProofWithNativeWebCrypto(proof, pub).catch(() => undefined);
  if (native !== undefined) return native;
  return Gun.SEA.verify(proof, pub);
}

exportedAuthorize.ALLOWED_SERVERS = ALLOWED_SERVERS;
exportedAuthorize.ALLOWED_OPERATIONS = ALLOWED_OPERATIONS;
exportedAuthorize.ALLOWED_SERVICES = ALLOWED_SERVICES;

async function exportedAuthorize(record = {}, options = {}) {
  if (text(record.requestedBy) !== 'portal-operator') {
    return { ok: false, reason: 'untrusted server-control producer' };
  }
  const authProof = decodeForgeProof(record.authProof);
  const authPub = text(record.authPub);
  if (!authProof || !authPub) return { ok: false, reason: 'missing owner proof' };

  let verified;
  try {
    verified = await verifyProof(authProof, authPub, options);
  } catch {
    return { ok: false, reason: 'invalid owner proof' };
  }
  if (!verified || typeof verified !== 'object') return { ok: false, reason: 'invalid owner proof' };

  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const issuedAt = Number(verified.iat);
  const maxAgeMs = Number.isFinite(options.maxAgeMs) ? options.maxAgeMs : DEFAULT_MAX_AGE_MS;
  if (!Number.isFinite(issuedAt) || issuedAt > now + 60_000 || now - issuedAt > maxAgeMs) {
    return { ok: false, reason: 'expired owner proof' };
  }

  const server = text(record.server).toLowerCase();
  const operation = text(record.operation).toLowerCase();
  const service = text(record.service);
  if (text(verified.scope) !== 'operator-server-control') return { ok: false, reason: 'wrong server-control proof scope' };
  if (text(verified.action) !== 'queue-server-control') return { ok: false, reason: 'wrong server-control proof action' };
  if (text(verified.pub) !== authPub) return { ok: false, reason: 'server-control proof pub mismatch' };
  if (text(verified.requestId) !== text(record.id)) return { ok: false, reason: 'server-control request mismatch' };
  if (text(verified.server).toLowerCase() !== server) return { ok: false, reason: 'server-control target mismatch' };
  if (text(verified.operation).toLowerCase() !== operation) return { ok: false, reason: 'server-control operation mismatch' };
  if (text(verified.service) !== service) return { ok: false, reason: 'server-control service mismatch' };

  const policy = resolvePolicy(options.env || process.env);
  const controlAlias = alias(verified.alias);
  const canonicalOwnerPub = policy.ownerBindings.get(SERVER_CONTROL_OWNER_ALIAS);
  const directOwner = controlAlias === SERVER_CONTROL_OWNER_ALIAS
    && Boolean(canonicalOwnerPub)
    && canonicalOwnerPub === authPub;
  if (!directOwner) return { ok: false, reason: 'Direct server control is restricted to the tmsteph owner identity' };

  if (!ALLOWED_SERVERS.has(server)) return { ok: false, reason: 'server is not allowlisted' };
  if (!ALLOWED_OPERATIONS.has(operation)) return { ok: false, reason: 'operation is not allowlisted' };
  if (operation !== 'health') {
    if (server !== 'ovh') return { ok: false, reason: 'service control is currently limited to OVH' };
    if (!ALLOWED_SERVICES.has(service)) return { ok: false, reason: 'service is not allowlisted' };
  } else if (service) {
    return { ok: false, reason: 'health checks must not include a service target' };
  }

  return {
    ok: true,
    server,
    operation,
    service,
    identity: { alias: text(verified.alias), pub: authPub },
  };
}

module.exports = {
  authorizePortalServerControl: exportedAuthorize,
  ALLOWED_SERVERS,
  ALLOWED_OPERATIONS,
  ALLOWED_SERVICES,
  SERVER_CONTROL_OWNER_ALIAS,
};
