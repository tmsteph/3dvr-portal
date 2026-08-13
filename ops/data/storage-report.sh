#!/usr/bin/env sh
set -eu

printf '%s\n' '3DVR data storage report'
printf 'Generated: %s\n\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

printf '%s\n' 'Postgres'
if command -v psql >/dev/null 2>&1; then
  if [ -n "${DATABASE_URL:-}" ]; then
    psql "$DATABASE_URL" -Atqc "SELECT current_database() || '|' || pg_database_size(current_database()) || '|' || pg_size_pretty(pg_database_size(current_database()));" \
      | awk -F'|' '{printf "database=%s bytes=%s pretty=%s\n", $1, $2, $3}' || true
  elif [ -n "${PGDATABASE:-}" ] || [ -n "${PGSERVICE:-}" ]; then
    psql -Atqc "SELECT current_database() || '|' || pg_database_size(current_database()) || '|' || pg_size_pretty(pg_database_size(current_database()));" \
      | awk -F'|' '{printf "database=%s bytes=%s pretty=%s\n", $1, $2, $3}' || true
  else
    echo 'database connection not configured in this shell'
  fi
else
  echo 'psql not installed'
fi

pg_backup_dir="${PG_BACKUP_DIR:-/var/backups/3dvr/postgres}"
if [ -d "$pg_backup_dir" ]; then
  printf 'local_backup_bytes='
  du -sk "$pg_backup_dir" | awk '{print $1 * 1024}'
  printf 'latest_backup='
  find "$pg_backup_dir" -maxdepth 1 -type f -name 'portal-postgres-*.dump' -print 2>/dev/null | sort | tail -n 1
else
  echo 'local_backup_dir=missing'
fi

printf '\n%s\n' 'Gun'
rad_dir="${GUN_RAD_DIR:-}"
if [ -z "$rad_dir" ]; then
  for candidate in /data/radata /data/gun/radata /opt/gun-relay/radata /opt/3dvr-gun-relay/radata ./radata; do
    if [ -d "$candidate" ]; then
      rad_dir="$candidate"
      break
    fi
  done
fi
if [ -n "$rad_dir" ] && [ -d "$rad_dir" ]; then
  printf 'rad_dir=%s\n' "$rad_dir"
  printf 'rad_bytes='
  du -sk "$rad_dir" | awk '{print $1 * 1024}'
else
  echo 'rad_dir=not present on this host'
fi

gun_snapshot_dir="${GUN_BACKUP_OUT_DIR:-/var/backups/3dvr/gun-snapshots}"
if [ -d "$gun_snapshot_dir" ]; then
  printf 'snapshot_bytes='
  du -sk "$gun_snapshot_dir" | awk '{print $1 * 1024}'
  printf 'latest_snapshot='
  find "$gun_snapshot_dir" -maxdepth 1 -type f -name 'portal-gun-known-roots-*.json' -print 2>/dev/null | sort | tail -n 1
else
  echo 'snapshot_dir=missing'
fi
