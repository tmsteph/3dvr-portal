import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reduceObligation, type Obligation, type CreditEvent } from './protocol.ts';
import { signEventWithKeyPair, verifyEvent } from './signatures.ts';

const obligation: Obligation = { id: 'iou-1', issuer: 'alice', creditor: 'bob', amountMinor: 10000, currency: 'USD', createdAt: '2026-10-08T00:00:00Z', dueAt: '2026-11-08T00:00:00Z', termsHash: 'sha256:example' };
const event = (id: string, kind: CreditEvent['kind'], actor: string, amountMinor?: number): CreditEvent => ({ id, kind, actor, obligationId: obligation.id, timestamp: '2026-10-08T01:00:00Z', ...(amountMinor === undefined ? {} : { amountMinor }) });

describe('UCN reducer', () => {
  it('tracks accepted partial and full settlement', () => {
    const events = [event('a', 'accepted', 'bob'), event('b', 'settled', 'bob', 2500), event('c', 'settled', 'bob', 7500), event('d', 'closed', 'bob')];
    assert.deepEqual(reduceObligation(obligation, events), { status: 'closed', outstandingMinor: 0, settledMinor: 10000 });
  });
  it('rejects overpayment', () => assert.throws(() => reduceObligation(obligation, [event('a', 'accepted', 'bob'), event('b', 'settled', 'bob', 10001)])));
  it('rejects duplicate IDs', () => assert.throws(() => reduceObligation(obligation, [event('a', 'accepted', 'bob'), event('a', 'settled', 'bob', 10)])));
  it('rejects unauthorized acceptance', () => assert.throws(() => reduceObligation(obligation, [event('a', 'accepted', 'alice')])));
  it('rejects unaccepted settlement', () => assert.throws(() => reduceObligation(obligation, [event('a', 'settled', 'bob', 10)])));
});
describe('UCN signatures', () => {
  it('verifies a signed event and rejects tampering and wrong identity', async () => {
    const alice = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const mallory = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const signed = await signEventWithKeyPair(event('a', 'accepted', 'bob'), alice);
    assert.equal(await verifyEvent(signed, await crypto.subtle.exportKey('jwk', alice.publicKey)), true);
    assert.equal(await verifyEvent({ ...signed, event: { ...signed.event, actor: 'mallory' } }, signed.publicKeyJwk), false);
    assert.equal(await verifyEvent(signed, await crypto.subtle.exportKey('jwk', mallory.publicKey)), false);
  });
});
