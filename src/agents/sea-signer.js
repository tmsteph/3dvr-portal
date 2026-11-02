// Agent SEA signer: lets a non-browser agent (Muse, ChatGPT, a server job)
// authenticate to Portal endpoints that verify SEA-signed proofs with
// src/auth/sea.js (verifySignedSeaPayload).
//
// Two ways to get a signing pair:
// - signSeaProof(pair, ...): sign with any SEA keypair (used with throwaway
//   pairs in tests, and by runtimes that hold their own keys).
// - authAgentPair({ alias, password }): sign in to Gun as the agent account
//   and use the authed session's pair (user._.sea), the same pair the browser
//   client uses in operator/forge.js.
//
// Credentials are only ever passed in by the caller (for example from the OVH
// secrets broker at runtime). Nothing here reads or stores secrets.

import { webcrypto } from 'node:crypto';

function ensureSeaRuntime() {
  const runtimeGlobal = globalThis;
  if (!runtimeGlobal.crypto?.subtle && webcrypto?.subtle) {
    try {
      runtimeGlobal.crypto = webcrypto;
    } catch {
      Object.defineProperty(runtimeGlobal, 'crypto', {
        configurable: true,
        writable: true,
        value: webcrypto,
      });
    }
  }
  if (!runtimeGlobal.self) {
    try {
      runtimeGlobal.self = runtimeGlobal;
    } catch {
      // SEA only needs self when a global crypto is missing; ignore otherwise.
    }
  }
}

ensureSeaRuntime();

const { default: SEA } = await import('gun/sea.js');
// The package root loads the full Gun chain (including user accounts);
// 'gun/gun.js' alone has no .user().
const { default: Gun } = await import('gun');

export { SEA, Gun };

export function buildSeaProofPayload(input = {}, options = {}) {
  const scope = String(input.scope || '').trim();
  const action = String(input.action || '').trim();
  const alias = String(input.alias || '').trim();
  const pub = String(input.pub || '').trim();
  if (!scope) throw new Error('Proof scope is required.');
  if (!action) throw new Error('Proof action is required.');
  if (!alias) throw new Error('Proof alias is required.');
  if (!pub) throw new Error('Proof public key is required.');
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  return {
    scope,
    action,
    alias,
    pub,
    origin: String(input.origin || ''),
    iat: now,
    ...(input.extra && typeof input.extra === 'object' ? input.extra : {}),
  };
}

export async function createAgentSeaPair() {
  return SEA.pair();
}

export async function signSeaProof(pair, input = {}, options = {}) {
  if (!pair?.pub || !pair?.priv) throw new Error('A full SEA keypair is required to sign proofs.');
  const payload = buildSeaProofPayload({ ...input, pub: pair.pub }, options);
  const authProof = await SEA.sign(payload, pair);
  if (!authProof) throw new Error('SEA signing failed.');
  return { authPub: pair.pub, authProof, payload };
}

// Sign in to Gun as an agent account and return its SEA pair. The account
// must already exist (Gun user.create happens elsewhere, for example the
// admin coworker flow in profile.html); this only authenticates. Pass
// `gunInstance` to sign in on an existing Gun instance instead of opening a
// new one (tests use this for isolated in-memory graphs).
export async function authAgentPair({ alias, password, peers = [], gunOptions = {}, gunInstance = null } = {}) {
  const normalizedAlias = String(alias || '').trim();
  if (!normalizedAlias) throw new Error('Agent alias is required.');
  if (!password) throw new Error('Agent password is required.');

  const gun = gunInstance || Gun({ peers, localStorage: false, ...gunOptions });
  const user = gun.user();
  await new Promise((resolve, reject) => {
    user.auth(normalizedAlias, password, ack => {
      if (ack?.err) reject(new Error(`Agent sign-in failed: ${ack.err}`));
      else resolve(ack);
    });
  });

  const pair = user?._?.sea;
  if (!pair?.pub || user?.is?.pub !== pair.pub) {
    try {
      user.leave();
    } catch {}
    throw new Error('Agent sign-in did not produce a usable SEA keypair.');
  }
  return { pair, pub: pair.pub, alias: user.is.alias || normalizedAlias, gun, user };
}
