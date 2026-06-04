#!/usr/bin/env sh
set -eu

usage() {
  cat <<'USAGE'
Usage: GUN_RAD_DIR=/path/to/radata ops/gun/archive-rad.sh

Creates a timestamped tar.gz archive and sha256 file for the Gun relay RAD data
directory. Run this on the machine/container that owns the relay data volume.

Environment:
  GUN_RAD_DIR                 Required unless one common path exists.
  GUN_BACKUP_DIR              Default: /var/backups/3dvr/gun-rad
  GUN_BACKUP_RETENTION_DAYS   Default: 14
  GUN_BACKUP_RCLONE_REMOTE    Optional rclone destination, e.g. do-spaces:3dvr-backups/gun-rad
  GUN_BACKUP_STOP_SERVICE     Set to 1 to stop/start a systemd service around the archive.
  GUN_RELAY_SERVICE           systemd service name when GUN_BACKUP_STOP_SERVICE=1.
USAGE
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi

find_default_rad_dir() {
  for candidate in \
    /data/radata \
    /data/gun/radata \
    /opt/gun-relay/radata \
    /opt/3dvr-gun-relay/radata \
    ./radata
  do
    if [ -d "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

rad_dir="${GUN_RAD_DIR:-}"
if [ -z "$rad_dir" ]; then
  rad_dir="$(find_default_rad_dir || true)"
fi

if [ -z "$rad_dir" ] || [ ! -d "$rad_dir" ]; then
  echo "GUN_RAD_DIR must point to the relay RAD data directory." >&2
  usage >&2
  exit 1
fi

backup_dir="${GUN_BACKUP_DIR:-/var/backups/3dvr/gun-rad}"
retention_days="${GUN_BACKUP_RETENTION_DAYS:-14}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
host="$(hostname | tr -c 'A-Za-z0-9_.-' '-')"
base="$(basename "$rad_dir")"
parent="$(cd "$(dirname "$rad_dir")" && pwd)"
archive="${backup_dir}/portal-gun-rad-${host}-${timestamp}.tar.gz"
tmp="${archive}.tmp"

mkdir -p "$backup_dir"
chmod 700 "$backup_dir"

restart_service=0
if [ "${GUN_BACKUP_STOP_SERVICE:-0}" = "1" ]; then
  if [ -z "${GUN_RELAY_SERVICE:-}" ]; then
    echo "GUN_RELAY_SERVICE is required when GUN_BACKUP_STOP_SERVICE=1." >&2
    exit 1
  fi
  systemctl stop "$GUN_RELAY_SERVICE"
  restart_service=1
fi

cleanup() {
  status=$?
  rm -f "$tmp"
  if [ "$restart_service" = "1" ]; then
    systemctl start "$GUN_RELAY_SERVICE" || true
  fi
  exit "$status"
}
trap cleanup INT TERM EXIT

tar -C "$parent" -czf "$tmp" "$base"
mv "$tmp" "$archive"
chmod 600 "$archive"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$backup_dir" && sha256sum "$(basename "$archive")" > "$(basename "$archive").sha256")
elif command -v shasum >/dev/null 2>&1; then
  (cd "$backup_dir" && shasum -a 256 "$(basename "$archive")" > "$(basename "$archive").sha256")
else
  echo "No sha256sum or shasum found; archive created without checksum." >&2
fi

if [ -n "${GUN_BACKUP_RCLONE_REMOTE:-}" ]; then
  if ! command -v rclone >/dev/null 2>&1; then
    echo "GUN_BACKUP_RCLONE_REMOTE is set but rclone is not installed." >&2
    exit 1
  fi
  rclone copy "$archive" "$GUN_BACKUP_RCLONE_REMOTE"
  if [ -f "${archive}.sha256" ]; then
    rclone copy "${archive}.sha256" "$GUN_BACKUP_RCLONE_REMOTE"
  fi
fi

find "$backup_dir" -type f \
  \( -name 'portal-gun-rad-*.tar.gz' -o -name 'portal-gun-rad-*.tar.gz.sha256' \) \
  -mtime +"$retention_days" \
  -delete

trap - INT TERM EXIT
if [ "$restart_service" = "1" ]; then
  systemctl start "$GUN_RELAY_SERVICE"
fi

printf 'Gun RAD backup written: %s\n' "$archive"
