# 3DVR Recovery Vault

Status: design approved, implementation intentionally gated

## Purpose

Recovery Vault is the owner-controlled recovery layer for root credentials such as a Bitwarden master password, backup codes, encryption recovery keys, and other break-glass material.

It is not a second password manager and it must not become a place where agents, servers, logs, chat, or analytics can read plaintext credentials.

## Core rule

Plaintext recovery material exists only inside the owner's local trusted client during an explicit protect or recover ceremony.

The control plane may store and replicate ciphertext. AI may open or guide the recovery flow. Neither the control plane nor AI receives the decrypted value.

## Target flow

1. Owner opens `https://portal.3dvr.tech/recovery-vault/` on a trusted device.
2. The browser creates or uses a WebAuthn/passkey credential with the PRF extension.
3. After biometric/PIN verification, WebAuthn PRF produces a credential-bound 32-byte value.
4. The browser uses that value as key material for AES-256-GCM encryption.
5. Only the encrypted bundle is persisted or synchronized.
6. Recovery requires the encrypted bundle plus successful local passkey verification.
7. The recovered plaintext is masked by default and cleared from the page after a short timeout.

WebAuthn PRF is specifically suitable for deriving symmetric encryption keys from a credential. The implementation should remain on the canonical `3dvr.tech` RP ID so a recovery credential cannot be replayed by unrelated origins.

## Encrypted bundle v1

The server-safe object should contain only:

- `version`
- `rpId`
- `credentialId`
- `prfSalt`
- `iv`
- `ciphertext`
- `algorithm`
- optional non-secret label and authenticator transport metadata

Never accept arbitrary extra fields. In particular, reject fields named `password`, `secret`, `value`, `plaintext`, `token`, or similar from persistent recovery storage.

## Storage model

### Phase 1

Store ciphertext on the trusted client and support encrypted export/import. The user can keep redundant copies in Drive, offline storage, or another approved location.

### Phase 2

Add owner-authenticated ciphertext synchronization through the 3DVR control plane. The broker should store only a validated encrypted bundle in its protected state directory. Audit records may contain hashes and timestamps, never ciphertext or plaintext values.

### Phase 3

Replicate encrypted bundles across approved 3DVR nodes. Replication must remain safe even if every storage node is considered untrusted.

## Recovery factors

The desired long-term model is 2-of-3 recovery:

- trusted passkey/device
- offline recovery factor
- trusted-person recovery factor

No single server, agent, cloud provider, or trusted person should be sufficient to reveal root recovery material.

## AI boundary

Agents may:

- report Recovery Vault health
- navigate the owner to the recovery UI
- verify that ciphertext backups exist
- verify metadata, timestamps, and replication health
- request an owner recovery ceremony

Agents must not:

- receive the master password in chat
- read the recovered DOM value
- copy the recovered value into logs, memory, prompts, telemetry, or task state
- bypass biometric/passkey verification
- silently export plaintext

## Bitwarden use

For Bitwarden, the normal path remains passkey/device login and Bitwarden's own recovery capabilities. Recovery Vault is a break-glass layer for the rare case where the master password itself must be recovered.

The Bitwarden master password should therefore become a rarely used root secret rather than a daily credential.

## Security requirements before production

- canonical HTTPS origin only
- WebAuthn user verification required
- PRF capability checked before enrollment
- AES-256-GCM or equivalent authenticated encryption
- fresh IV per encryption
- ciphertext schema allowlist
- no plaintext persistence
- no sensitive browser storage beyond ciphertext
- no analytics on recovery input/output controls
- Content Security Policy appropriate for the recovery route
- automatic DOM clearing after recovery
- explicit encrypted backup/export support
- tested recovery from a second trusted device before the original password is considered safely recoverable

## Integration with existing 3DVR security

Recovery Vault belongs beside the existing `/access/` surface and Secrets Broker, but it has a stricter boundary: Secrets Broker may release scoped machine credentials to authorized agents; Recovery Vault must never release owner root credentials to an agent.

The capability registry should eventually expose `recovery-vault` as an owner-only capability with a health check that proves an encrypted bundle exists and that a recovery ceremony can be launched, without performing decryption automatically.

## Implementation note

The current conversation established the architecture and attempted a direct implementation. Automated edits to the credential-control path were blocked by the execution safety boundary, so no partial password-handling implementation was merged. This document is the canonical design until the local recovery client is implemented and reviewed end to end.
