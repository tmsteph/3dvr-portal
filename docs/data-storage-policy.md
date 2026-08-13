# 3DVR Data Storage Policy

Status: active architecture policy

## Rule of thumb

- **Postgres is the durable business ledger.**
- **GunJS is the realtime/local-first synchronization layer.**
- **Object storage holds files and large binary assets.**

Do not make Postgres and Gun compete as interchangeable databases. Choose the authority per data class and make every secondary copy reconstructable from that authority when practical.

## Postgres: canonical business data

Postgres is the canonical source of truth for data that creates a business, financial, security, or customer obligation, including:

- CRM contacts and activities
- orders and fulfillment state
- subscription/payment mirrors and reconciliation records
- newsletter subscriptions and suppression state
- audit and delivery records
- server-side permissions or entitlement records
- any record whose loss could create a customer, legal, or accounting problem

Where a Gun projection also exists, the Postgres record wins during reconciliation.

## GunJS: realtime and local-first state

Gun remains a first-class 3DVR technology. Use it for:

- realtime collaboration
- offline/local-first state
- presence and ephemeral UI state
- peer synchronization
- chat and community experiences where eventual consistency is acceptable
- experiments, labs, and distributed application state

Gun data that becomes business-critical should be projected into Postgres or another durable canonical store.

Browser localStorage/Radisk is a cache and offline replica, not a backup strategy.

## Files and binary assets

Do not store large artwork, media, exports, or other binary payloads directly in Postgres or Gun unless there is a specific technical reason.

Use private object storage for the bytes. Keep durable metadata in Postgres, including the owning record ID, object key, content type, byte size, checksum, created timestamp, and retention state.

## Backup standard

A datastore is not considered backed up until a recoverable copy exists independently of the primary failure domain.

Minimum standard:

1. Postgres: nightly validated custom-format dump.
2. Gun: nightly known-root JSON snapshot on a host separate from the Fly relay.
3. Gun relay: full RAD/radata archive from the Fly persistent volume.
4. Checksums for backup artifacts.
5. At least one off-host/off-provider copy for canonical business data.
6. Periodic restore tests into disposable environments.

A file on the same VM or volume as the live database is only a local recovery point, not a complete backup.

## Current operational paths

- Postgres local dumps: `/var/backups/3dvr/postgres`
- Gun known-root snapshots: `/var/backups/3dvr/gun-snapshots`
- Gun relay peer: `wss://gun-relay-3dvr.fly.dev/gun`
- Gun full RAD backup helper: `ops/gun/archive-rad.sh`
- Postgres backup helper: `ops/postgres/backup.sh`
- Storage/backup report: `ops/data/storage-report.sh`

## Recovery priority

1. Restore Postgres business records first.
2. Restore Gun relay RAD data when available.
3. Use known-root Gun snapshots for inspection or targeted recovery.
4. Allow clients to rebuild caches and projections after canonical stores are healthy.

## Migration rule

Do not perform a broad Gun-to-Postgres rewrite merely for architectural purity. Move a data class when one of these is true:

- it has become financially or operationally critical;
- it needs reliable querying/reporting;
- it needs referential integrity or transaction semantics;
- backup/recovery requirements exceed the current Gun path;
- real production usage proves the migration is worth its complexity.

This keeps the distributed/open architecture while making the business core deliberately boring and recoverable.
