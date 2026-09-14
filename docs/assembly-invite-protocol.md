# Assembly Invite and Grant Protocol

Assembly sharing should begin with explicit, scoped grants rather than ambient access.

This protocol defines the contract before any email, QR code, link transport, or live sync is enabled.

## Invitation contents

A workspace invitation binds all of these values together:

- invitation ID
- workspace ID
- issuer principal ID
- recipient principal ID
- requested authorization profile
- issue time
- expiry time
- issuer proof

The invitation is not a public bearer link. It is addressed to one recipient principal and expires.

## Authorization profiles

Invitations may currently request only an existing Assembly authorization profile:

- `owner`
- `editor`
- `viewer`

Organizational labels such as Lead, Steward, Treasurer, Builder, or Organizer remain separate and never imply software authorization.

## Proof boundary

`invite-contract.js` defines a canonical signing payload and requires a proof verifier before an invite can be accepted.

The contract deliberately does not choose the cryptographic implementation yet. A future kernel identity provider can supply signing and verification using the authenticated principal/device system without changing the invitation schema.

An unsigned invitation cannot be accepted.

## Acceptance

Accepting an invite requires the authenticated accepting principal to exactly match the invitation recipient.

Acceptance produces a durable grant containing:

- grant ID
- workspace ID
- grantee principal ID
- authorization profile
- issuer principal ID
- source invitation ID
- grant timestamp
- revocation timestamp

This grant—not the invite URL or workspace ID—is the durable authorization record.

## Revocation

A revoked grant immediately stops authorizing capabilities. Revocation is represented explicitly with `revokedAt` so audit history remains intact.

Future storage should append a revocation event rather than deleting historical evidence.

## Capability check

The intended runtime path is:

> authenticated principal → workspace grant → authorization profile → requested kernel capability → allow/deny → audit event

For example, an `editor` grant can authorize `workspace.write` but not `workspace.manage_access`.

## Not implemented yet

This protocol does not yet provide:

- invitation delivery
- email or messaging links
- QR codes
- public join pages
- cryptographic key storage
- cloud grant storage
- live synchronization
- automatic member creation

Those should be added only after the kernel identity and audit surfaces can persist and verify grants safely.

## Next implementation step

The next useful layer is a **local invitation simulator/UI** that lets an owner prepare an invite, inspect its exact scope and expiry, and generate a non-networked handoff artifact. That can validate the human experience before any remote transport is enabled.
