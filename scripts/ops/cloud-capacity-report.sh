#!/usr/bin/env bash
set -euo pipefail

# Report live resource headroom for the 3DVR cloud mesh.
# Run from a cloud node with working 3dvr-ovh / 3dvr-hetzner / 3dvr-do SSH aliases.

probe='
set -euo pipefail
mem_total=$(awk "/MemTotal:/ {print \$2}" /proc/meminfo)
mem_avail=$(awk "/MemAvailable:/ {print \$2}" /proc/meminfo)
swap_total=$(awk "/SwapTotal:/ {print \$2}" /proc/meminfo)
swap_free=$(awk "/SwapFree:/ {print \$2}" /proc/meminfo)
disk_pct=$(df -P / | tail -1 | awk "{gsub(/%/,\"\",\$5); print \$5}")
load1=$(cut -d" " -f1 /proc/loadavg)
cpus=$(nproc)
printf "host=%s cpus=%s mem_total_mib=%s mem_available_mib=%s swap_used_mib=%s disk_used_pct=%s load1=%s\n" \
  "$(hostname)" "$cpus" "$((mem_total / 1024))" "$((mem_avail / 1024))" \
  "$(((swap_total - swap_free) / 1024))" "$disk_pct" "$load1"
'

probe_node() {
  local label="$1" alias="$2"
  printf '%-14s ' "$label"
  if ! ssh -o BatchMode=yes -o ConnectTimeout=8 "$alias" "bash -lc $(printf '%q' "$probe")"; then
    echo "unreachable"
    return 1
  fi
}

failures=0
probe_node "OVH" 3dvr-ovh || failures=$((failures + 1))
probe_node "Hetzner" 3dvr-hetzner || failures=$((failures + 1))
probe_node "DigitalOcean" 3dvr-do || failures=$((failures + 1))

cat <<'EOF'

Routing rules:
- OVH is the largest node, but keep ~2 GiB available for portal/control/recovery.
- Hetzner is the persistent worker-service home, not automatically the heavy-compute target.
- DigitalOcean is emergency/lightweight only.
- For substantial burst work, prefer a node with memory headroom, load1 below CPU count,
  swap below severe pressure, and root disk below 80%. If none qualifies, queue the work.
EOF

exit "$failures"
