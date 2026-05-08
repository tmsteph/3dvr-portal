// Force Vercel's serverless bundler to include Gun modules SEA loads dynamically.
import 'gun/gun.js';
import 'gun/lib/text-encoding/index.js';
import { webcrypto } from 'node:crypto';

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

const DEFAULT_MESSAGES = {
  missing: 'Sign in again to verify access.',
  verifyError: 'Refresh your portal sign-in to verify access.',
  invalid: 'Refresh your portal sign-in to verify access.',
  wrongScope: 'Access proof had the wrong scope.',
  wrongPub: 'Access proof did not match this portal account.',
  missingTimestamp: 'Access proof was missing a timestamp.',
  expired: 'Access proof expired. Refresh your sign-in and try again.',
  wrongOrigin: 'Access proof was issued for a different portal origin.'
};

function assignRuntimeProperty(target, key, value) {
  if (!target || !key || value === undefined) {
    return;
  }

  try {
    target[key] = value;
    if (target[key] === value) {
      return;
    }
  } catch (_error) {
    // Fall through to a descriptor-based write for read-only globals.
  }

  try {
    Object.defineProperty(target, key, {
      configurable: true,
      writable: true,
      value
    });
  } catch (_error) {
    // Ignore globals that cannot be redefined in this runtime.
  }
}

function ensureSeaWebCryptoRuntime() {
  const runtimeGlobal = globalThis;
  assignRuntimeProperty(runtimeGlobal, 'crypto', webcrypto);
  assignRuntimeProperty(runtimeGlobal, 'self', runtimeGlobal);

  const targets = [
    runtimeGlobal,
    runtimeGlobal.self,
    runtimeGlobal.window
  ].filter((target, index, array) => target && array.indexOf(target) === index);

  for (const target of targets) {
    if (!target.crypto?.subtle || typeof target.crypto.subtle.importKey !== 'function') {
      assignRuntimeProperty(target, 'crypto', runtimeGlobal.crypto || webcrypto);
    }

    if (!target.TextEncoder && typeof runtimeGlobal.TextEncoder === 'function') {
      assignRuntimeProperty(target, 'TextEncoder', runtimeGlobal.TextEncoder);
    }

    if (!target.TextDecoder && typeof runtimeGlobal.TextDecoder === 'function') {
      assignRuntimeProperty(target, 'TextDecoder', runtimeGlobal.TextDecoder);
    }
  }
}

ensureSeaWebCryptoRuntime();

const { default: SEA } = await import('gun/sea.js');

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeOrigin(value = '') {
  const candidate = normalizeText(value);
  if (!candidate) {
    return '';
  }

  try {
    return new URL(candidate).origin;
  } catch (_error) {
    return '';
  }
}

function resolveNow(now) {
  if (typeof now === 'number') {
    return Math.round(now);
  }

  if (typeof now === 'function') {
    return resolveNow(now());
  }

  return Date.now();
}

function resolveMaxAgeMs(config = process.env, fallback = DEFAULT_MAX_AGE_MS) {
  const configured = Number(config?.BILLING_AUTH_MAX_AGE_MS || config?.PORTAL_AUTH_MAX_AGE_MS);
  if (Number.isFinite(configured) && configured >= 30 * 1000) {
    return Math.round(configured);
  }
  return fallback;
}

function resolveMessage(messages, key) {
  return messages?.[key] || DEFAULT_MESSAGES[key] || 'Access verification failed.';
}

export async function verifySignedSeaPayload(payload = {}, options = {}) {
  const authProof = normalizeText(payload.authProof);
  const authPub = normalizeText(payload.authPub);
  const messages = options.messages || {};

  if (!authProof || !authPub) {
    return {
      ok: false,
      reason: resolveMessage(messages, 'missing')
    };
  }

  let verified;
  try {
    verified = await SEA.verify(authProof, authPub);
  } catch (_error) {
    return {
      ok: false,
      reason: resolveMessage(messages, 'verifyError')
    };
  }

  if (!verified || typeof verified !== 'object') {
    return {
      ok: false,
      reason: resolveMessage(messages, 'invalid')
    };
  }

  const scope = normalizeText(verified.scope);
  const pub = normalizeText(verified.pub);
  const alias = normalizeText(verified.alias);
  const origin = normalizeOrigin(verified.origin);
  const action = normalizeText(verified.action);
  const issuedAt = Number(verified.iat);
  const now = resolveNow(options.now);
  const maxAgeMs = Number.isFinite(options.maxAgeMs)
    ? Math.round(options.maxAgeMs)
    : resolveMaxAgeMs(options.config);
  const expectedOrigin = normalizeOrigin(options.expectedOrigin);

  if (options.scope && scope !== options.scope) {
    return {
      ok: false,
      reason: resolveMessage(messages, 'wrongScope')
    };
  }

  if (!pub || pub !== authPub) {
    return {
      ok: false,
      reason: resolveMessage(messages, 'wrongPub')
    };
  }

  if (!Number.isFinite(issuedAt)) {
    return {
      ok: false,
      reason: resolveMessage(messages, 'missingTimestamp')
    };
  }

  if (issuedAt > now + 60 * 1000 || now - issuedAt > maxAgeMs) {
    return {
      ok: false,
      reason: resolveMessage(messages, 'expired')
    };
  }

  if (expectedOrigin && origin !== expectedOrigin) {
    return {
      ok: false,
      reason: resolveMessage(messages, 'wrongOrigin')
    };
  }

  return {
    ok: true,
    identity: {
      pub,
      alias,
      origin,
      action,
      issuedAt,
      scope
    }
  };
}

export { DEFAULT_MAX_AGE_MS as SEA_AUTH_DEFAULT_MAX_AGE_MS, resolveMaxAgeMs as resolveSeaAuthMaxAgeMs };
