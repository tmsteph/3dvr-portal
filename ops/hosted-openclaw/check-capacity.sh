#!/usr/bin/env bash
# Run on the candidate worker immediately before starting a tenant.
set -euo pipefail
required_mib="${OPENCLAW_REQUIRED_AVAILABLE_MIB:-1536}"
case "$required_mib" in ''|*[!0-9]*) echo "Invalid memory threshold" >&2; exit 2;; esac
available_kib=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
total_kib=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
if [[ -z "$available_kib" || -z "$total_kib" ]]; then
  echo "Cannot read memory capacity; refusing admission" >&2
  exit 2
fi
available_mib=$((available_kib / 1024))
total_mib=$((total_kib / 1024))
printf 'host=%s total_mib=%d available_mib=%d required_available_mib=%d\n' "$(hostname)" "$total_mib" "$available_mib" "$required_mib"
if (( available_mib < required_mib )); then
  echo "DENY: insufficient available RAM for isolated pilot" >&2
  exit 1
fi
echo "PASS: memory admission only; check CPU, disk, swap and service pressure separately"
