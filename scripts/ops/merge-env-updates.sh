#!/usr/bin/env bash
set -euo pipefail

destination="${1:?usage: merge-env-updates.sh DESTINATION UPDATES}"
updates="${2:?usage: merge-env-updates.sh DESTINATION UPDATES}"

[ -f "$updates" ] || { echo "Updates file not found: $updates" >&2; exit 1; }

config_dir="$(dirname "$destination")"
mkdir -p "$config_dir"
chmod 700 "$config_dir"
umask 077
touch "$destination"
chmod 600 "$destination"

merged="$(mktemp "$config_dir/.portal-secrets.merge.XXXXXX")"
trap 'rm -f "$merged"' EXIT

awk -F= '
  FILENAME == ARGV[1] {
    if ($0 ~ /^[A-Z0-9_]+=/) {
      key=$1
      if (!(key in seen)) order[++count]=key
      seen[key]=1
      replacement[key]=$0
    }
    next
  }
  {
    key=$1
    if ($0 ~ /^[A-Z0-9_]+=/ && (key in replacement)) next
    print
  }
  END {
    for (i=1; i<=count; i++) print replacement[order[i]]
  }
' "$updates" "$destination" > "$merged"

chmod 600 "$merged"
mv "$merged" "$destination"
trap - EXIT
