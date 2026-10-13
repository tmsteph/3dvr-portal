# Universal Apps — implementation design (issue #3185)

## First slice: local-first notes
Ship a small notes application in Portal before integrating third-party desktop software. Joplin is an integration candidate, not a promise of WASM compatibility. Evaluate its sync API, licensing and data format separately.

## Reusable app contract
Each app declares an id, version, display name, execution mode (browser-wasm, browser-js, hosted), storage namespace, requested capabilities and migration version. The host grants scoped storage and identity tokens; apps must never receive raw infrastructure credentials.

## Sync protocol v0
- Local notes are stored in IndexedDB (not localStorage); local writes succeed without network.
- Each record has opaque id, owner scope, revision, updated timestamp, deletion tombstone and payload.
- Client sends mutation id and expected server revision. Server checks authenticated owner and applies compare-and-swap transactionally.
- Duplicate mutation ids are idempotent. Stale revisions return 409 with both versions; preserve both edits and offer explicit resolution, never silent last-write-wins.
- Cursor-based pull fetches ordered changes, including tombstones. Clients persist cursor only after applying changes locally.
- Cap record size and total quota, report errors without discarding unsynced edits.

## Privacy and operational boundaries
- TLS in transit; authenticated per-user tenant isolation at API and storage layers.
- Backups encrypted at rest, documented retention and restore drills.
- Do not claim end-to-end encryption until client-held keys and key recovery are actually implemented.
- Per-user quotas, rate limits, abuse controls and audit events without note content.
- Hosted execution requires sandbox isolation, resource ceilings and no implicit filesystem/network access.
- No production deployment before two-account isolation tests, conflict/reconnect tests and rollback rehearsal.

## Milestones
1. Inspect Portal auth, persistence and existing API conventions.
2. Implement IndexedDB notes editor, offline queue and explicit sync indicator.
3. Implement versioned authenticated sync endpoint and isolated persistence.
4. Automated tests: duplicate mutation, conflicts, offline/reconnect, multi-device, quota, restart, cross-user access.
5. Stage on authorized OVH infrastructure, test phone/laptop, document operations and restore.
6. Assess Joplin adapter; add Excalidraw and code-server only after the shared contract is proven.

## Product principle
Open-source software stays open source. Charge for managed hosting, dependable synchronization, backup and operator-assisted workflows; verify upstream licenses before distribution.
