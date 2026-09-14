#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo 'Desktop Commander resilience installer requires root.' >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
patch_source="$SCRIPT_DIR/patch-desktop-commander-session.sh"
patch_dest=/usr/local/sbin/3dvr-patch-desktop-commander-session
unit=desktop-commander-remote.service
state_dir=/var/lib/3dvr
# v2 reloads the workaround after package-path auto-discovery was added.
state_file="$state_dir/desktop-commander-session-workaround-v2"

[ -f "$patch_source" ] || { echo "Patch helper not found: $patch_source" >&2; exit 1; }
install -m 0755 "$patch_source" "$patch_dest"

mkdir -p /etc/systemd/system/desktop-commander-remote.service.d
cat >/etc/systemd/system/desktop-commander-remote.service.d/95-session-persistence.conf <<'EOF'
[Service]
# Reapply the workaround after an npm upgrade before the bridge starts.
ExecStartPre=/usr/local/sbin/3dvr-patch-desktop-commander-session
EOF

systemctl daemon-reload
"$patch_dest"

mkdir -p "$state_dir"
if [ ! -f "$state_file" ]; then
  echo 'Restarting Desktop Commander once to load session-persistence workaround.'
  systemctl restart "$unit"
  sleep 5
  systemctl is-active --quiet "$unit"
  touch "$state_file"
fi

systemctl --no-pager --full status "$unit" || true
journalctl -u "$unit" -b --no-pager -n 40 || true
