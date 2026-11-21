# Operator queue: consistent backup and recovery acceptance

Tracks [Operator recovery #3294](https://github.com/tmsteph/3dvr-portal/issues/3294).

The existing DigitalOcean nightly backup job archives the running task-queue.sqlite file directly. A running SQLite writer may have committed WAL changes not reflected in that file, or modify its pages during a direct copy. A previous healthy tar or SQLite integrity check does not prove future backups are consistent.

## Candidate fix — review only, not installed

The version-controlled helper at scripts/ops/operator-queue-snapshot-safe.py creates a *new* SQLite file using SQLite's online backup API. It reads the source in SQLite read-only mode, includes committed WAL data, excludes uncommitted changes, converts the snapshot to a standalone rollback-journal file, checks integrity, and refuses to overwrite. It returns bounded metadata, never row contents. The source queue is never replayed or modified.

## Existing DO job integration after explicit approval

1. Record the existing DO backup script checksum, service/timer state, most recent known-good backup, and protected rollback copy. Obtain an approved change window and review private configuration/retention.
2. Install the reviewed helper as root-owned, non-worker-writable executable, e.g. at /usr/local/sbin/operator-queue-snapshot-safe.py.
3. In the root-private backup staging directory, run the helper with source /root/.3dvr/task-queue.sqlite and a **new** staging output named task-queue.sqlite. Abort the backup on missing/invalid/unsnapshotable queue DB; do not silently omit it.
4. Exclude the live queue DB from the existing state tar member list. Include the staged copy as exactly one archive member named task-queue.sqlite. Do not include live -wal or -shm files. Preserve existing other members, encrypted/private transfer, destination and retention.
5. Transfer with the existing guarded transport. Verify transfer success and off-host archive integrity before pruning older backups. Never log credentials or task payloads.

## Offline tests

Run python3 -m unittest discover -s tests -p test_operator_queue_snapshot.py -v
Run python3 scripts/ops/operator-queue-snapshot-safe.py --self-test

Tests cover WAL commit boundaries, integrity and file permissions, special URI characters, symlink and overwrite prevention, missing paths, and corrupt inputs. These tests do not contact DigitalOcean or production.

## Separate live acceptance gate

Only after explicit approval for a DO backup-job change, produce a *new* archive and restore its queue member into an isolated private OVH directory. Verify exactly one regular-file member, `PRAGMA integrity_check=ok`, `PRAGMA journal_mode=delete`, a source-free standalone restore, and **the same task count and SHA-256** reported by the snapshot helper at capture time. Preserve the snapshot receipt as bounded operational metadata with the archive identifier. Rehash the off-host archive member after transport; do not extract client task payloads into logs. Verify the next scheduled backup and preserve rollback until then.

**Important: retire the old byte-parity/WAL-absence audit when switching to SQLite snapshots.** The existing read-only `operator-queue-backup-readonly.sh` expects the tarred queue file to be byte-for-byte identical to the current live `task-queue.sqlite` and fails whenever a live `-wal` exists. That logic is appropriate only for the old quiescent direct-copy scheme, **not** for a correct online snapshot: committed records may remain in WAL, and a standalone snapshot deliberately has different bytes/journal mode from its WAL source. A synthetic isolated WAL check demonstrated a valid 5-row standalone snapshot with integrity OK while the live WAL existed and raw byte parity was false. Replace the old verifier in the approved integration window, never loosen it silently. Compare archive member hash/task count against the *capture-time snapshot receipt*, not a later moving live source; a separate read-only source audit can provide context but is not a guaranteed equality target.

Treat a missing capture receipt, mismatched archive hash/count, duplicate archive queue member, failed SQLite integrity check, or failed restore as an acceptance failure. Do not prune previous backups or enable task replay on that evidence.

Neither this review nor off-host restore demonstrates a successful signed Operator dispatch. The no-send exact-task-ID execution test needs separate authorization and a disposable test identity. Do not replay, delete, or mass-drain the 42 quarantined legacy tasks.

**No production change or client system access is included in this PR.**
