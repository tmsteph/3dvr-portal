/** UCN signed event envelopes, experimental; requires trusted key registry. */
import type { CreditEvent } from './protocol';

export type SignedEvent = Readonly<{
  version: 1;
  event: CreditEvent;
  publicKeyJwk: JsonWebKey;
  signature: string; // base64url
}>;

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const obj = value as Record<string, unknown>;
  return '{' + Object.keys(obj).sort().map(k => JSON.stringify(k) + ':' + canonical(obj[k])).join(',') + '}';
}
function b64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function decodeB64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid signature encoding');
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
function payload(event: CreditEvent): Uint8Array {
  return new TextEncoder().encode(canonical({ domain: '3dvr.ucn.event.v1', event }));
}
export async function signEvent(event: CreditEvent, privateKey: CryptoKey): Promise<SignedEvent> {
  if (privateKey.algorithm.name !== 'Ed25519' || !privateKey.usages.includes('sign')) throw new Error('Expected Ed25519 signing key');
  // WebCrypto does not derive public keys from nonextractable private keys.
  throw new Error('Use signEventWithKeyPair to provide the public key');
}
export async function signEventWithKeyPair(event: CreditEvent, keys: CryptoKeyPair): Promise<SignedEvent> {
  if (keys.privateKey.algorithm.name !== 'Ed25519' || keys.publicKey.algorithm.name !== 'Ed25519') throw new Error('Expected Ed25519 key pair');
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
  const signature = b64url(new Uint8Array(await crypto.subtle.sign('Ed25519', keys.privateKey, payload(event))));
  return { version: 1, event, publicKeyJwk, signature };
}
export async function verifyEvent(envelope: SignedEvent, authorizedPublicKeyJwk: JsonWebKey): Promise<boolean> {
  if (envelope.version !== 1 || envelope.publicKeyJwk.kty !== 'OKP' || envelope.publicKeyJwk.crv !== 'Ed25519' || !envelope.publicKeyJwk.x || envelope.publicKeyJwk.d) return false;
  // Caller MUST obtain the authorized key from a trusted identity registry, not the envelope.
  if (canonical({ kty: envelope.publicKeyJwk.kty, crv: envelope.publicKeyJwk.crv, x: envelope.publicKeyJwk.x }) !== canonical({ kty: authorizedPublicKeyJwk.kty, crv: authorizedPublicKeyJwk.crv, x: authorizedPublicKeyJwk.x })) return false;
  try {
    const key = await crypto.subtle.importKey('jwk', { kty: 'OKP', crv: 'Ed25519', x: envelope.publicKeyJwk.x, ext: true }, 'Ed25519', false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, decodeB64url(envelope.signature), payload(envelope.event));
  } catch { return false; }
}
