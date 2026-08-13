# Portal GunJS Backups

GunJS is the realtime/local-first synchronization layer for 3DVR. It remains authoritative for Gun-native distributed state that has not been promoted into a durable business system, but it is **not** the canonical ledger for CRM, orders, payments, subscriptions, or other business-critical records. Those records belong in Postgres according to `docs/data-storage-policy.md`.

Gun backups still need two layers:

1. Archive the relay's RAD data directory. This is the complete relay-level backup.
2. Capture known root snapshots as JSON on a separate host. This is useful for inspection, targeted recovery, and resilience if the Fly relay is unavailable, but it cannot prove every Gun soul was discovered.

## What To Back Up

- Relay peer: `wss://gun-relay-3dvr.fly.dev/gun`
- Default Gun RAD directory when not overridden: `radata`
- Portal root manifest: `ops/gun/portal-gun-roots.json`
- Independent snapshot output: `/var/backups/3dvr/gun-snapshots`

Treat every backup artifact as sensitive. Even encrypted SEA records, billing mirrors, guest profiles, and key-vault ciphertexts should not be committed or shared casually.

## Daily Relay RAD Archive

Run this on the Fly host/container that owns the relay data volume:

```sh
GUN_RAD_DIR=/path/to/radata \
GUN_BACKUP_DIR=/var/backups/3dvr/gun-rad \
GUN_BACKUP_RETENTION_DAYS=14 \
ops/gun/archive-rad.sh
```

If the relay is managed by systemd and you want a more consistent archive, stop the service during the tar:

```sh
GUN_RAD_DIR=/path/to/radata \
GUN_BACKUP_STOP_SERVICE=1 \
GUN_RELAY_SERVICE=gun-relay.service \
ops/gun/archive-rad.sh
```

A local archive on the same VM or Fly volume is only a short-term recovery point. The complete backup standard requires an off-host copy. `archive-rad.sh` supports `GUN_BACKUP_RCLONE_REMOTE` once an external destination is configured.

## Nightly Independent Known-Roots Snapshot

The repository now includes:

- `ops/systemd/3dvr-gun-snapshot.service`
- `ops/systemd/3dvr-gun-snapshot.timer`

Install and enable these on a host separate from the Fly relay after the repository is deployed to `/opt/3dvr-portal`:

```sh
sudo cp ops/systemd/3dvr-gun-snapshot.service /etc/systemd/system/
sudo cp ops/systemd/3dvr-gun-snapshot.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now 3dvr-gun-snapshot.timer
```

The service writes snapshots under `/var/backups/3dvr/gun-snapshots` and connects to the Fly relay over the network.

Manual equivalent:

```sh
GUN_BACKUP_OUT_DIR=/var/backups/3dvr/gun-snapshots \
GUN_BACKUP_PEERS='wss://gun-relay-3dvr.fly.dev/gun,https://gun-relay-3dvr.fly.dev/gun' \
GUN_BACKUP_MAX_NODES=500 \
GUN_BACKUP_MAX_MEMORY_MB=256 \
npm run gun:backup
```

The snapshot command stops at independent safety boundaries for process time, node reads, and memory. Keep it separate from the OpenClaw gateway service.

The command writes:

- `portal-gun-known-roots-<timestamp>.json`
- `portal-gun-known-roots-<timestamp>.json.sha256`

Dry-run the manifest without connecting:

```sh
npm run gun:backup -- --dry-run
```

## Storage and Backup Report

On any host with the repository available:

```sh
ops/data/storage-report.sh
```

On the Fly relay host, set `GUN_RAD_DIR` if the RAD directory is not one of the common locations. The report shows RAD size, local snapshot size, latest snapshot path, and Postgres information when that database is reachable from the same shell.

## Restore Notes

Do not restore over a running relay without a deliberate maintenance window.

For a RAD archive restore:

1. Stop the relay.
2. Move the existing RAD directory aside; do not delete it first.
3. Verify the archive checksum.
4. Extract the tarball into the expected parent directory.
5. Start the relay.
6. Verify representative application roots.

Known-root JSON snapshots are not a full restore source unless the missing data is known to live under one of the manifest paths. Use them for inspection and emergency record recovery, not as the only backup.

## Required Standard

- Nightly relay RAD archive.
- Nightly known-root snapshot on a different host.
- Independent copy before considering critical Gun data fully backed up.
- Periodic restore drill into a disposable relay.
- Business-critical records projected to Postgres rather than relying on Gun alone.
