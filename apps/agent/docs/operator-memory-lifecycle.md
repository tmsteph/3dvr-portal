# Operator durable memory lifecycle (proposal)

Tracks #3132.

## Storage tiers
- **Recent:** bounded working context for active sessions; never the sole durable copy.
- **Daily:** append-only dated event logs with source, timestamp, and provenance.
- **Weekly:** derived digests referencing the underlying event IDs.
- **Archive:** compressed, versioned historical records with restore support.

## Safety rules
1. Treat memories as claims, not unquestionable truth. Preserve source and last-verified timestamps.
2. Conflict detection proposes changes for review; it never silently overwrites facts.
3. Pruning affects rebuildable caches only by default. Personal records require explicit retention settings and deletion approval.
4. Use atomic writes, checksums, backups, and a restart/restore test before enabling automatic compaction.
5. Scope memory by user and workspace; encrypt private data at rest; support export and deletion.

## Implementation milestones
- Inventory Digital Organism memory and existing retrieval paths.
- Add schema/versioning and retention policy tests.
- Build read-only digest generation with provenance links.
- Add restore, conflict-review, and opt-in cleanup.
- Measure retrieval correctness, size, and recovery after restart.
