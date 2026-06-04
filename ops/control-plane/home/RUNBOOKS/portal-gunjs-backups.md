# Portal GunJS Backups

The portal currently treats GunJS as the source of truth for shared app state, CRM records, guest profiles,
billing mirrors, agent ops, notes, chat, and lab data. Backups need two layers:

1. Archive the relay's RAD data directory. This is the authoritative backup.
2. Capture known root snapshots as JSON. This is useful for inspection, restore drills, and quick sanity checks, but it
   cannot prove every Gun soul was discovered.

## What To Back Up

- Relay peer: `wss://gun-relay-3dvr.fly.dev/gun`
- Default Gun RAD directory when not overridden: `radata`
- Portal root manifest: `ops/gun/portal-gun-roots.json`
- Local snapshot output: `backups/gun-snapshots/`

Treat every backup artifact as sensitive. Even encrypted SEA records, billing mirrors, guest profiles, and key-vault
ciphertexts should not be committed or shared casually.

## Daily Host Archive

Run this on the host or container that owns the relay data volume:

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

Off-host copy is required. A local archive on the same VM or Fly volume is only a short-term safety net.
Use `GUN_BACKUP_RCLONE_REMOTE` once rclone is configured for DigitalOcean Spaces, S3, Backblaze, or another store:

```sh
GUN_RAD_DIR=/path/to/radata \
GUN_BACKUP_RCLONE_REMOTE=do-spaces:3dvr-backups/gun-rad \
ops/gun/archive-rad.sh
```

## Daily Known-Roots Snapshot

Run this from a repo checkout with dependencies installed:

```sh
npm run gun:backup
```

Useful overrides:

```sh
GUN_BACKUP_OUT_DIR=/var/backups/3dvr/gun-snapshots \
GUN_BACKUP_PEERS='wss://gun-relay-3dvr.fly.dev/gun https://gun-relay-3dvr.fly.dev/gun' \
npm run gun:backup
```

Dry-run the manifest without connecting:

```sh
npm run gun:backup -- --dry-run
```

Snapshot one root for a quick health check:

```sh
npm run gun:backup -- --root portal --depth 0
```

The command writes:

- `portal-gun-known-roots-<timestamp>.json`
- `portal-gun-known-roots-<timestamp>.json.sha256`

## Cron Example

Run both layers nightly and keep stdout/stderr in system logs:

```cron
15 7 * * * cd /opt/3dvr-portal && GUN_RAD_DIR=/path/to/radata ops/gun/archive-rad.sh
30 7 * * * cd /opt/3dvr-portal && npm run gun:backup
```

## Restore Notes

Do not restore over a running relay without a deliberate maintenance window.

For a RAD archive restore:

1. Stop the relay.
2. Move the existing RAD directory aside; do not delete it first.
3. Verify the archive checksum.
4. Extract the tarball into the expected parent directory.
5. Start the relay.
6. Use `gun-explorer/`, `test-gun.html`, and a few app pages to verify critical paths such as:
   - `3dvr-portal/billing`
   - `3dvr-portal/agentOps`
   - `3dvr-crm`
   - `3dvr-guests`
   - `3dvr-chat`

Known-root JSON snapshots are not a full restore source unless the missing data is known to live under one of the
manifest paths. Use them first for inspection and emergency record recovery, not as the only backup.

## Immediate Standard

- Nightly RAD archive.
- Nightly known-root JSON snapshot.
- Off-host copy before considering the system backed up.
- Weekly restore drill into a disposable relay.
