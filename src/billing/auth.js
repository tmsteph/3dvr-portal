// Force Vercel's serverless bundler to include Gun modules SEA loads dynamically.
import 'gun/gun.js';
import 'gun/lib/text-encoding/index.js';
import { webcrypto } from 'node:crypto';

function assignRuntimeProperty(target, key, value) {
  if (!target || !key || value === undefined) {
    return;
  }

  try {
    target[key] = value;
    if (target[key] === value) {
      return;
    }
  } catch (error) {
    // Fall through to a descriptor-based write for read-only globals.
  }

  try {
    Object.defineProperty(target, key, {
      configurable: true,
      writable: true,
      value
    });
  } catch (error) {
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

export const BILLING_AUTH_SCOPE = 'stripe-billing';
const DEFAULT_BILLING_AUTH_MAX_AGE_MS = 5 * 60 * 1000;

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
  } catch (error) {
    return '';
  }
}

export function resolveBillingAuthMaxAgeMs(config = process.env) {
  const configured = Number(config?.BILLING_AUTH_MAX_AGE_MS);
  if (Number.isFinite(configured) && configured >= 30 * 1000) {
    return Math.round(configured);
  }
  return DEFAULT_BILLING_AUTH_MAX_AGE_MS;
}

export async function verifyBillingAuthPayload(payload = {}, options = {}) {
  const authProof = normalizeText(payload.authProof);
  const authPub = normalizeText(payload.authPub);
  if (!authProof || !authPub) {
    return {
      ok: false,
      reason: 'Sign in again to verify billing access.'
    };
  }

  let verified;
  try {
    verified = await SEA.verify(authProof, authPub);
  } catch (error) {
    return {
      ok: false,
      reason: 'Refresh your portal sign-in to verify billing access.'
    };
  }

  if (!verified || typeof verified !== 'object') {
    return {
      ok: false,
      reason: 'Refresh your portal sign-in to verify billing access.'
    };
  }

  const scope = normalizeText(verified.scope);
  const pub = normalizeText(verified.pub);
  const alias = normalizeText(verified.alias);
  const origin = normalizeOrigin(verified.origin);
  const action = normalizeText(verified.action);
  const issuedAt = Number(verified.iat);
  const now = Number.isFinite(options.now) ? Math.round(options.now) : Date.now();
  const maxAgeMs = resolveBillingAuthMaxAgeMs(options.config);
  const expectedOrigin = normalizeOrigin(options.expectedOrigin);

  if (scope !== BILLING_AUTH_SCOPE) {
    return {
      ok: false,
      reason: 'Billing access proof had the wrong scope.'
    };
  }

  if (!pub || pub !== authPub) {
    return {
      ok: false,
      reason: 'Billing access proof did not match this portal account.'
    };
  }

  if (!Number.isFinite(issuedAt)) {
    return {
      ok: false,
      reason: 'Billing access proof was missing a timestamp.'
    };
  }

  if (issuedAt > now + 60 * 1000 || now - issuedAt > maxAgeMs) {
    return {
      ok: false,
      reason: 'Billing access proof expired. Refresh your sign-in and try again.'
    };
  }

  if (expectedOrigin && origin !== expectedOrigin) {
    return {
      ok: false,
      reason: 'Billing access proof was issued for a different portal origin.'
    };
  }

  return {
    ok: true,
    identity: {
      pub,
      alias,
      origin,
      action,
      issuedAt
    }
  };
}
