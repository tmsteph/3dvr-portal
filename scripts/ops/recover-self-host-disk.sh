#!/usr/bin/env bash
set -euo pipefail

threshold="${THREEDVR_DISK_RECOVERY_THRESHOLD:-88}"
min_free_mb="${THREEDVR_DISK_MIN_FREE_MB:-768}"
base="${THREEDVR_PORTAL_PRODUCTION_DIR:-/opt/3dvr-portal-production}"
releases="$base/releases"
current="$base/current"
state="$base/state"

usage_pct() {
  df -P / | awk 'NR==2 {gsub(/%/, "", $5); print $5}'
}

free_mb() {
  df -Pk / | awk 'NR==2 {printf "%d\n", $4 / 1024}'
}

before_usage="$(usage_pct)"
before_free="$(free_mb)"
echo "Self-host disk before recovery: ${before_usage}% used, ${before_free} MB free"

if [ "$before_usage" -lt "$threshold" ] && [ "$before_free" -ge "$min_free_mb" ]; then
  echo 'Disk pressure is below the recovery threshold.'
  exit 0
fi

# Remove abandoned partial releases first. They are never live targets.
if [ -d "$releases" ]; then
  find "$releases" -mindepth 1 -maxdepth 1 -type d -name '.tmp-*' -mmin +30 -exec rm -rf -- {} + 2>/dev/null || true
fi

# Keep the live release plus the newest non-live release as a rollback candidate.
if [ -d "$releases" ]; then
  live="$(readlink -f "$current" 2>/dev/null || true)"
  kept_rollback=false
  while IFS= read -r dir; do
    [ -n "$dir" ] || continue
    if [ -n "$live" ] && [ "$(readlink -f "$dir" 2>/dev/null || printf '%s' "$dir")" = "$live" ]; then
      continue
    fi
    if [ "$kept_rollback" = false ]; then
      kept_rollback=true
      continue
    fi
    rm -rf -- "$dir"
  done < <(find "$releases" -mindepth 1 -maxdepth 1 -type d ! -name '.tmp-*' -printf '%T@ %p\n' 2>/dev/null | sort -nr | cut -d' ' -f2-)
fi

# Disposable caches/log history are safe to recreate and can otherwise crowd a small VPS.
rm -rf /root/.npm/_cacache 2>/dev/null || true
command -v journalctl >/dev/null 2>&1 && journalctl --vacuum-size=100M >/dev/null 2>&1 || true
command -v apt-get >/dev/null 2>&1 && apt-get clean >/dev/null 2>&1 || true
if [ -d "$state" ]; then
  find "$state" -maxdepth 1 -type f -name 'candidate-*.log' -mtime +3 -delete 2>/dev/null || true
fi

sync || true
after_usage="$(usage_pct)"
after_free="$(free_mb)"
echo "Self-host disk after recovery: ${after_usage}% used, ${after_free} MB free"

if [ "$after_free" -lt 256 ]; then
  echo 'Self-host disk still has less than 256 MB free after safe cleanup.' >&2
  exit 1
fi
