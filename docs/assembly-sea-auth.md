# Assembly SEA Authentication Bridge

Assembly can now convert the portal's existing signed Gun/SEA access proofs into authenticated principals and pass them through the same workspace authorization policy used by future identity providers.

## Why SEA is the first real issuer bridge

The Portal already uses Gun/SEA to sign short-lived access proofs for sensitive server actions. `src/auth/sea.js` verifies those signatures server-side and checks freshness, scope, signer public key, and origin.

Assembly reuses that verifier instead of trusting browser cookies or localStorage identity metadata.

The shared `portalIdentity` cookie remains useful for display/session UX, but it is not an authorization credential.

## Assembly proof shape

The signer includes these values in the SEA-signed payload:

- `scope: "assembly-workspace"`
- `action`: the exact Assembly capability being requested, such as `workspace.read` or `workspace.write`
- `workspaceId`: the target Assembly workspace
- `pub`: signer public key
- `alias`: optional display alias
- `origin`: Portal origin
- `iat`: issue timestamp

The request carries `authPub` plus the SEA `authProof`.

## Server-selected target

The server route must independently supply the expected workspace ID and capability to `verifyAssemblyPrincipal()`.

Those expectations are **never selected from unsigned request fields**. The signed proof must match the server-selected workspace and capability exactly.

That prevents a client from changing the target resource or capability simply by changing ordinary request parameters.

## Principal mapping

After SEA verification, Assembly creates a strong authenticated principal:

- ID: `sea:<public-key>`
- type: `user`
- issuer: `gun-sea`
- subject: SEA public key
- display name: signed alias
- assurance: `strong`
- authenticated time: signed proof timestamp

The public key is identity, not authorization.

## Authorization remains separate

A valid signature alone does not grant workspace access.

`authorizeAssemblyRequest()` performs two distinct checks:

1. authenticate the principal with the signed SEA proof;
2. authorize the requested capability against an active workspace grant.

A correctly signed proof from a user with no grant is denied with `no-active-grant`.

## Rejected conditions

The bridge rejects at least:

- missing server-selected workspace or capability
- invalid or tampered signature
- wrong SEA scope
- public-key mismatch
- stale or future-dated proof
- wrong Portal origin
- signed workspace mismatch
- signed capability mismatch
- missing, revoked, or insufficient workspace grant

## What is still missing

This is a server-side identity and authorization bridge, not a complete collaboration API.

Assembly still needs:

- a client helper that signs Assembly-specific proofs from an already authenticated Gun user
- durable server-side grant storage
- grant lookup scoped to workspace + principal
- audit receipts for authorization and mutations
- actual read/write/sync endpoints
- conflict handling for synchronized state

Those pieces can now be built on a real authenticated principal rather than a simulated identity.
