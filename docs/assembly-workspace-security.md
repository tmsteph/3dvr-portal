# Assembly Workspace Identity and Security

Assembly now has a stable workspace identity before it has multi-user sync.

That ordering is intentional. A group should not become networked until the system can answer three separate questions clearly:

1. Which Assembly workspace is this?
2. Which principal is acting?
3. Which capability is that principal allowed to use?

## Stable workspace identity

Every Assembly workspace receives an opaque ID such as `asm_<uuid>` plus a creation timestamp. The ID travels with portable Assembly snapshots and survives reloads, exports, and imports.

The workspace ID is **not a secret and not an authorization token**. Knowing an Assembly ID must never grant access to its contents.

Older Assembly files remain valid. When an older file without an ID is opened locally, the browser assigns one stable workspace ID and persists it before further edits continue.

## Organizational roles are not permissions

Assembly already supports human role labels such as Lead, Steward, Builder, Organizer, or Treasurer. Those describe how people coordinate work.

They do not grant software permissions.

Authorization uses a separate profile system:

- **Owner** — read, write, export, manage access, and authorize sync.
- **Editor** — read, write, and export.
- **Viewer** — read and export.

This separation prevents a label like `Lead` from silently becoming an administrative capability.

## Current trust model

The current working Assembly remains browser-local and treats the current browser as a **local owner principal** for that workspace.

The UI explicitly reports:

- workspace ID
- local `owner` profile
- sync disabled

This is a transitional trust model, not the final identity system.

## Sync envelope

Assembly now defines a transport-neutral sync envelope without implementing a network transport.

A sync envelope contains:

- format and schema version
- workspace ID
- generation timestamp
- optional device ID
- optional base state version
- deterministic state fingerprint
- normalized Assembly state

The fingerprint is for change/conflict detection, not for cryptographic authentication.

Before accepting a future remote envelope, a sync implementation must verify at minimum:

1. the user/device identity is authenticated;
2. the principal is authorized for the target workspace;
3. the envelope workspace ID matches the authorized workspace;
4. the state fingerprint validates;
5. the base version has not been superseded, or an explicit merge path is used;
6. the action leaves an audit receipt.

## What is deliberately not implemented yet

This work does **not** add:

- public workspace URLs that reveal private data
- cloud storage
- invitations
- live collaboration
- background sync
- peer-to-peer replication
- role-derived authorization
- bearer access based only on workspace ID

Those features should be layered on only after authenticated principals and workspace-scoped policy are connected to the 3DVR kernel capability model.

## Intended kernel relationship

The eventual sequence should be:

> principal → workspace → requested capability → policy check → sync/read/write action → event/audit receipt

Assembly stays userspace. Identity, capability authorization, policy, and audit belong to shared 3DVR kernel contracts.

## Next safe implementation step

The next networking step should be an **invite/accept protocol design**, not automatic sync. An invitation should identify the workspace, recipient principal, requested authorization profile, issuer, expiry, and a revocable grant. Acceptance should create a durable access grant that can later be checked by every read/write/sync capability.
