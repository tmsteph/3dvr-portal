# Assembly Principal Authorization

Assembly now has a single place to answer the question:

> May this principal perform this capability in this workspace?

The answer is produced by `authorizeWorkspaceCapability()`.

## Principal contract

Remote authorization requires an authenticated principal with:

- stable principal ID
- principal type: user, agent, device, or service
- identity issuer
- issuer subject
- assurance level
- authentication timestamp

The identity provider is responsible for proving that those fields are trustworthy. Assembly does not manufacture remote identity claims itself.

## Local owner

The current browser-local prototype continues to support the special `local-owner` principal for its own workspace.

That principal is authorized using the Owner profile only when its workspace ID exactly matches the requested workspace.

This preserves the current offline product while keeping remote identity rules separate.

## Remote grants

An authenticated remote principal must have an active grant matching both:

- principal ID
- workspace ID

The grant's authorization profile is then checked against the requested permission.

A revoked grant is never considered active.

## Decision results

Authorization returns a small result rather than throwing during normal policy denial:

- `allowed`
- `reason`
- `profile` when allowed
- `grantId` when authorization came from a grant

Typical denial reasons include:

- `workspace-required`
- `permission-required`
- `principal-required`
- `workspace-mismatch`
- `principal-not-authenticated`
- `no-active-grant`
- `grant-insufficient`

This makes authorization decisions suitable for kernel audit events and user-facing explanations.

## Kernel direction

Future Assembly reads, writes, sync, invitations, and access-management actions should call this policy boundary instead of duplicating permission logic.

The intended runtime sequence is:

> authenticated principal → workspace → capability → authorization decision → action → audit receipt

The next meaningful implementation is to connect this principal contract to a real 3DVR identity provider. Until that exists, remote grants remain protocol/data contracts rather than live access.
