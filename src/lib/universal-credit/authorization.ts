/** Explicit, versioned key bindings for the experimental UCN protocol.
 * This module verifies identity-to-key binding but does not replace a trusted registry.
 */
import type { CreditEvent, Obligation } from './protocol';
import { verifyEvent, type SignedEvent } from './signatures';

export type IdentityBinding = Readonly<{
  actor: string;
  publicKeyJwk: JsonWebKey;
  validFrom: string;
  revokedAt?: string;
}>;

function sameKey(a: JsonWebKey, b: JsonWebKey): boolean {
  return a.kty === 'OKP' && a.crv === 'Ed25519' && !!a.x && a.x === b.x && b.kty === 'OKP' && b.crv === 'Ed25519';
}

export function authorizeActor(event: CreditEvent, obligation: Obligation): boolean {
  if (event.obligationId !== obligation.id) return false;
  switch (event.kind) {
    case 'issued': return event.actor === obligation.issuer;
    case 'accepted': return event.actor === obligation.creditor;
    case 'settled': return event.actor === obligation.creditor;
    case 'disputed': return event.actor === obligation.creditor || event.actor === obligation.issuer;
    case 'closed': return event.actor === obligation.creditor;
    default: return false;
  }
}

export async function verifyAuthorizedEvent(
  signed: SignedEvent,
  obligation: Obligation,
  bindings: readonly IdentityBinding[],
): Promise<boolean> {
  const e = signed.event;
  const at = Date.parse(e.timestamp);
  if (!Number.isFinite(at) || !authorizeActor(e, obligation)) return false;
  const matches = bindings.filter(binding =>
    binding.actor === e.actor &&
    sameKey(binding.publicKeyJwk, signed.publicKeyJwk) &&
    Number.isFinite(Date.parse(binding.validFrom)) &&
    Date.parse(binding.validFrom) <= at &&
    (binding.revokedAt === undefined || (Number.isFinite(Date.parse(binding.revokedAt)) && at < Date.parse(binding.revokedAt)))
  );
  // Ambiguous bindings are rejected. Registry provenance and clock trust are external requirements.
  if (matches.length !== 1) return false;
  return verifyEvent(signed, matches[0].publicKeyJwk);
}
