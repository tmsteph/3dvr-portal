import { describe, expect, it } from 'vitest';
import type { Obligation, CreditEvent } from './protocol';
import { signEventWithKeyPair } from './signatures';
import { verifyAuthorizedEvent, type IdentityBinding } from './authorization';

const obligation: Obligation = { id: 'test-1', issuer: 'alice', creditor: 'bob', amountMinor: 100, currency: 'USD', createdAt: '2026-10-08T00:00:00Z', dueAt: '2026-11-08T00:00:00Z', termsHash: 'sha256:test' };
const makeEvent = (actor: string): CreditEvent => ({ id: 'e1', obligationId: 'test-1', actor, kind: 'accepted', timestamp: '2026-10-08T12:00:00Z' });

describe('identity authorization', () => {
  it('accepts a signed event from the authorized creditor', async () => {
    const keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const signed = await signEventWithKeyPair(makeEvent('bob'), keys);
    const binding: IdentityBinding = { actor: 'bob', publicKeyJwk: signed.publicKeyJwk, validFrom: '2026-10-08T00:00:00Z' };
    expect(await verifyAuthorizedEvent(signed, obligation, [binding])).toBe(true);
    expect(await verifyAuthorizedEvent(signed, obligation, [{ ...binding, revokedAt: '2026-10-08T10:00:00Z' }])).toBe(false);
    expect(await verifyAuthorizedEvent(signed, obligation, [])).toBe(false);
  });
  it('rejects an issuer pretending to accept for the creditor', async () => {
    const keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const signed = await signEventWithKeyPair(makeEvent('alice'), keys);
    expect(await verifyAuthorizedEvent(signed, obligation, [{ actor: 'alice', publicKeyJwk: signed.publicKeyJwk, validFrom: '2026-10-08T00:00:00Z' }])).toBe(false);
  });
});
