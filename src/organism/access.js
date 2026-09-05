import { verifySignedSeaPayload } from '../auth/sea.js';
import { resolveOperatorDeveloperPolicy } from '../operator/developer-access.js';

const DEFAULT_MAX_AGE_MS = 2 * 60 * 1000;
const DEFAULT_ALLOWED_ORIGINS = [
  'https://portal.3dvr.tech',
  'https://3dvr.tech',
  'https://www.3dvr.tech',
  'https://3dvr-portal.vercel.app'
];

function normalizeText(value = '', max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function normalizeAlias(value = '') {
  return normalizeText(value, 200).toLowerCase();
}

function normalizeOrigin(value = '') {
  const candidate = normalizeText(value, 500);
  if (!candidate) return '';
  try {
    return new URL(candidate).origin;
  } catch {
    return '';
  }
}

function allowedOrigins(config = process.env) {
  const configured = String(config.THREEDVR_ORGANISM_ALLOWED_ORIGINS || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

function ownerMatches(identity, config = process.env) {
  const policy = resolveOperatorDeveloperPolicy(config);
  const pub = normalizeText(identity?.pub, 500);
  const alias = normalizeAlias(identity?.alias);
  return Boolean(pub && (policy.ownerPubs.has(pub) || policy.ownerBindings.get(alias) === pub));
}

async function verifyOwnerPayload(payload = {}, options = {}, messages = {}) {
  const config = options.config || process.env;
  const verify = options.verify || verifySignedSeaPayload;
  const auth = await verify(payload, {
    scope: 'digital-organism',
    config,
    maxAgeMs: options.maxAgeMs || DEFAULT_MAX_AGE_MS,
    now: options.now,
    messages: {
      missing: 'Sign in to use your Digital Organism.',
      verifyError: 'Your signed memory request could not be verified.',
      invalid: 'Your signed memory request was invalid.',
      wrongScope: 'Memory proof had the wrong scope.',
      wrongPub: 'Memory proof did not match this 3DVR account.',
      expired: 'Memory proof expired. Try again.',
      ...messages
    }
  });

  if (!auth.ok) {
    return { ok: false, status: 401, reason: auth.reason || 'Unauthorized.' };
  }
  if (!allowedOrigins(config).has(auth.identity.origin)) {
    return { ok: false, status: 403, reason: 'Memory access is only available from an approved 3DVR portal.' };
  }
  if (!ownerMatches(auth.identity, config)) {
    return { ok: false, status: 403, reason: 'This Digital Organism currently accepts owner requests only.' };
  }
  return { ok: true, auth, config };
}

export async function resolveOrganismAccess(payload = {}, options = {}) {
  const checked = await verifyOwnerPayload(payload, options, {
    missing: 'Sign in to ask your Digital Organism.',
    expired: 'Memory proof expired. Try the question again.'
  });
  if (!checked.ok) return checked;

  const { auth } = checked;
  const verified = auth.verified || {};
  const query = normalizeText(payload.query, 2000);
  const requestId = normalizeText(payload.requestId, 160);
  const limit = Math.min(10, Math.max(1, Number.parseInt(payload.limit || '5', 10) || 5));
  const signedLimit = Math.min(10, Math.max(1, Number.parseInt(verified.limit || '5', 10) || 5));

  if (auth.identity.action !== 'recall') {
    return { ok: false, status: 403, reason: 'Memory proof did not authorize recall.' };
  }
  if (!query || query !== normalizeText(verified.query, 2000)) {
    return { ok: false, status: 403, reason: 'Question did not match the signed memory request.' };
  }
  if (!requestId || requestId !== normalizeText(verified.requestId, 160)) {
    return { ok: false, status: 403, reason: 'Request id did not match the signed memory request.' };
  }
  if (limit !== signedLimit) {
    return { ok: false, status: 403, reason: 'Recall limit did not match the signed memory request.' };
  }

  return {
    ok: true,
    status: 200,
    query,
    requestId,
    limit,
    identity: auth.identity
  };
}

export async function resolveOrganismFeedbackAccess(payload = {}, options = {}) {
  const checked = await verifyOwnerPayload(payload, options, {
    missing: 'Sign in before approving a memory.',
    expired: 'Memory approval expired. Try again.'
  });
  if (!checked.ok) return checked;

  const { auth } = checked;
  const verified = auth.verified || {};
  const query = normalizeText(payload.query, 2000);
  const memoryId = normalizeText(payload.memoryId, 300);
  const requestId = normalizeText(payload.requestId, 160);

  if (auth.identity.action !== 'approve-retrieval') {
    return { ok: false, status: 403, reason: 'Memory proof did not authorize retrieval approval.' };
  }
  if (!query || query !== normalizeText(verified.query, 2000)) {
    return { ok: false, status: 403, reason: 'Question did not match the signed memory approval.' };
  }
  if (!memoryId || memoryId !== normalizeText(verified.memoryId, 300)) {
    return { ok: false, status: 403, reason: 'Memory id did not match the signed memory approval.' };
  }
  if (!requestId || requestId !== normalizeText(verified.requestId, 160)) {
    return { ok: false, status: 403, reason: 'Request id did not match the signed memory approval.' };
  }

  return {
    ok: true,
    status: 200,
    query,
    memoryId,
    requestId,
    identity: auth.identity
  };
}

export { DEFAULT_MAX_AGE_MS as ORGANISM_AUTH_MAX_AGE_MS };
