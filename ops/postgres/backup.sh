#!/usr/bin/env sh
set -eu

# Creates a local PostgreSQL custom-format dump and checksum.
# Connection details are supplied by the host environment and are never printed.

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump is required" >&2
  exit 1
fi
if ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_restore is required" >&2
  exit 1
fi

backup_dir="${PG_BACKUP_DIR:-/var/backups/3dvr/postgres}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
host="$(hostname | tr -c 'A-Za-z0-9_.-' '-')"
archive="${backup_dir}/portal-postgres-${host}-${timestamp}.dump"
tmp="${archive}.tmp"

mkdir -p "$backup_dir"
chmod 700 "$backup_dir"

cleanup() {
  rm -f "$tmp"
}
trap cleanup INT TERM EXIT

# pg_dump will use the standard libpq environment (PGHOST, PGDATABASE, PGUSER,
# PGPASSWORD) or PGSERVICE supplied by the host. Do not put credentials in git.
pg_dump --format=custom --no-owner --no-privileges --file="$tmp"
pg_restore --list "$tmp" >/dev/null
mv "$tmp" "$archive"
chmod 600 "$archive"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$backup_dir" && sha256sum "$(basename "$archive")" > "$(basename "$archive").sha256")
elif command -v shasum >/dev/null 2>&1; then
  (cd "$backup_dir" && shasum -a 256 "$(basename "$archive")" > "$(basename "$archive").sha256")
else
  echo "No SHA-256 tool found" >&2
  exit 1
fi
chmod 600 "${archive}.sha256"

trap - INT TERM EXIT
printf 'Postgres backup written and validated: %s\n' "$archive"
