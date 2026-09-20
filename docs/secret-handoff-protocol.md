# 3DVR Secret Handoff Protocol

Status: Draft 0.1
Implementation: /secret-handoff/ + /api/secret-handoff
Purpose: human-to-system transfer of credentials without putting plaintext in chat, email, or ordinary web logs.

## Problem

A collaborator often needs to give 3DVR a credential such as an n8n API key. Normal messaging is the wrong transport because the plaintext can be copied into message history, AI context, notification previews, logs, or clipboard history.

Secret Handoff separates the transport of the invitation from the transport of the secret.

## Flow

1. An authenticated 3DVR owner creates a request from /access/.
2. The control node creates a random request id, a 256-bit capability token, and a per-request P-256 ECDH key pair.
3. The share URL contains the request id in the query string and the capability token in the URL fragment:
   https://portal.3dvr.tech/secret-handoff/?id=sh-...#token=...
4. The URL can be sent through an ordinary channel. Browsers do not send URL fragments in HTTP requests.
5. The recipient page moves the capability into sessionStorage and removes it from the visible URL.
6. The page retrieves only the request metadata and recipient public key.
7. The recipient enters the secret locally.
8. The browser creates an ephemeral P-256 key pair, derives an ECDH shared secret, derives an AES-256-GCM key with HKDF-SHA256, and encrypts the payload locally.
9. Only the encrypted envelope is submitted over HTTPS.
10. The 3DVR control node decrypts the envelope in memory and immediately passes the value into the existing Secrets Broker.
11. After the broker confirms storage, the request is marked stored and the per-request ECDH private/public keys are deleted from handoff state.
12. A second submission is rejected.

## Envelope

Version 1 uses:

- KEM-style exchange: P-256 ECDH
- KDF: HKDF-SHA256
- AEAD: AES-256-GCM
- Salt: 16 random bytes
- IV: 12 random bytes
- HKDF info and AEAD additional data: 3dvr-secret-handoff:v1:<request-id>

Example shape:

    {
      "v": 1,
      "kem": "P-256-ECDH",
      "kdf": "HKDF-SHA256",
      "aead": "AES-256-GCM",
      "epk": { "...": "ephemeral public JWK" },
      "salt": "<base64url>",
      "iv": "<base64url>",
      "ciphertext": "<base64url>"
    }

The protocol deliberately uses Web Crypto primitives available in current browsers. A future interoperable version can switch the envelope to standards-defined HPKE without changing the human workflow.

## Capability rules

- Capability tokens are generated from 32 random bytes.
- The server stores only SHA-256(token).
- Token comparison is timing-safe.
- The token belongs in the URL fragment, never in a query parameter.
- Public describe/submit operations require both request id and capability token.
- Owner request creation requires a signed 3DVR owner proof bound to the exact request metadata.
- Default lifetime is 24 hours.
- Allowed lifetime is 10 minutes through 7 days.
- Handoff pages and API responses are no-store.

## Storage

The handoff layer is not a vault.

Pending request state contains metadata and the per-request decryption key in a root-only control-node file. The plaintext secret is not written to that state. On submit, plaintext exists only in process memory long enough to invoke the existing Secrets Broker. The broker decides the configured backend; current control-node policy can use OpenBao, with Bitwarden Secrets Manager retained as a compatibility backend.

If the broker does not confirm storage, the request remains pending and can be retried. If storage succeeds, the request key material is removed.

## Threat model

This protects against accidental disclosure through:

- chat or email message bodies
- URL query/access logs
- normal application logs
- Vercel/edge caching
- copied workflow exports
- AI conversation context

It does not protect a secret from a compromised recipient browser, a compromised 3DVR control node while a request is pending, or a malicious party who obtains the complete share URL including its fragment capability.

## Interoperability direction

The 3DVR implementation is intentionally small. The reusable protocol should eventually describe:

- request metadata
- capability transport
- public-key discovery
- encrypted envelope format
- destination hints
- expiration and one-time semantics
- storage receipts
- optional HPKE cipher suites
- vault adapters

The long-term goal is a vendor-neutral secret handoff flow that password managers, CLIs, browsers, agents, and secret stores can implement without adopting 3DVR.
