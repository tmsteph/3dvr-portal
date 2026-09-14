# 3DVR Recovery Vault

Status: passkey/crypto dry-run implemented; real-secret storage intentionally gated

## Purpose

Recovery Vault is the owner-controlled recovery layer for root credentials such as a Bitwarden master password, backup codes, encryption recovery keys, and other break-glass material.

It is not a second password manager and it must not become a place where agents, servers, logs, chat, or analytics can read plaintext credentials.

## Core rule

Plaintext recovery material exists only inside the owner's local trusted client during an explicit protect or recover ceremony.

The control plane may store and replicate ciphertext. AI may open or guide the recovery flow. Neither the control plane nor AI receives the decrypted value.

## Target flow

1. Owner opens `https://portal.3dvr.tech/recovery-vault/` on a trusted device.
2. The browser creates or uses a WebAuthn/passkey credential with the PRF extension.
3. After biometric/PIN verification, WebAuthn PRF produces credential-bound key material.
4. The browser uses that material for AES-256-GCM encryption.
5. Only the encrypted bundle is persisted or synchronized.
6. Recovery requires the encrypted bundle plus successful local passkey verification.
7. The recovered plaintext is masked by default and cleared from the page after a short timeout.

WebAuthn Level 3 defines the `prf` extension and specifies 32-byte PRF outputs. MDN specifically documents using PRF output to derive a symmetric encryption key. Keep the implementation on the canonical `3dvr.tech` RP ID so unrelated origins cannot request this recovery credential.

References:
- https://www.w3.org/TR/webauthn-3/#sctn-prf-extension
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/WebAuthn_extensions#prf

## Current implementation

`/recovery-vault/` now has a deliberately secret-free verification phase:

1. Check HTTPS, WebAuthn, Web Crypto, platform-verifier availability, and canonical RP origin.
2. Enroll a dedicated WebAuthn credential requesting PRF support. No recovery secret is entered.
3. Persist only non-secret enrollment metadata in browser local storage: RP ID, credential ID, PRF input salt, version, and creation time.
4. Require user verification again and request PRF output with `evalByCredential`.
5. Import the PRF bytes as a non-extractable AES-GCM key, immediately overwrite the temporary byte view, and encrypt/decrypt fixed throwaway self-test text.
6. Report success only if the authenticated encryption round-trip succeeds.

The dry run performs no network request and contains no password field. It proves the local authenticator → PRF → encryption path before the UI is ever allowed to accept real recovery material.

## Encrypted bundle v1

The future server-safe object should contain only:

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

## Security requirements before real secrets are enabled

- canonical HTTPS origin only
- WebAuthn user verification required
- PRF support proven by the enrolled authenticator
- AES-256-GCM authenticated encryption
- fresh IV per encryption
- ciphertext schema allowlist
- no plaintext persistence
- no sensitive browser storage beyond ciphertext
- no analytics on recovery input/output controls
- Content Security Policy appropriate for the recovery route
- automatic DOM clearing after recovery
- encrypted backup/export and import
- tested recovery from a second trusted device before the original password is considered safely recoverable

The last two items are the production gate. Do not enter a Bitwarden master password into Recovery Vault until encrypted export/import and second-device recovery have both been implemented and exercised.

## Integration with existing 3DVR security

Recovery Vault belongs beside the existing `/access/` surface and Secrets Broker, but it has a stricter boundary: Secrets Broker may release scoped machine credentials to authorized agents; Recovery Vault must never release owner root credentials to an agent.

The capability registry exposes `recovery-vault` as an owner-only capability. Its health check should prove the client and encrypted backups are healthy without performing unattended decryption.
