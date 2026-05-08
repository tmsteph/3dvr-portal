import { SEA_AUTH_DEFAULT_MAX_AGE_MS, resolveSeaAuthMaxAgeMs, verifySignedSeaPayload } from '../auth/sea.js';

export const BILLING_AUTH_SCOPE = 'stripe-billing';

export function resolveBillingAuthMaxAgeMs(config = process.env) {
  return resolveSeaAuthMaxAgeMs(config, SEA_AUTH_DEFAULT_MAX_AGE_MS);
}

export async function verifyBillingAuthPayload(payload = {}, options = {}) {
  return verifySignedSeaPayload(payload, {
    scope: BILLING_AUTH_SCOPE,
    expectedOrigin: options.expectedOrigin,
    config: options.config,
    now: options.now,
    maxAgeMs: resolveBillingAuthMaxAgeMs(options.config),
    messages: {
      missing: 'Sign in again to verify billing access.',
      verifyError: 'Refresh your portal sign-in to verify billing access.',
      invalid: 'Refresh your portal sign-in to verify billing access.',
      wrongScope: 'Billing access proof had the wrong scope.',
      wrongPub: 'Billing access proof did not match this portal account.',
      missingTimestamp: 'Billing access proof was missing a timestamp.',
      expired: 'Billing access proof expired. Refresh your sign-in and try again.',
      wrongOrigin: 'Billing access proof was issued for a different portal origin.'
    }
  });
}
