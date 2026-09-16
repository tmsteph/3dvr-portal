#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 DEVICE_ID QUEUE_REPO ALLOWED_AUTHOR [INSTALL_ROOT]" >&2
  exit 2
}

[ "$#" -ge 3 ] || usage
DEVICE_ID="$1"
QUEUE_REPO="$2"
ALLOWED_AUTHOR="$3"
INSTALL_ROOT="${4:-/opt/3dvr-open-runner}"

command -v python3 >/dev/null || { echo "python3 is required" >&2; exit 1; }
command -v gh >/dev/null || { echo "GitHub CLI (gh) is required" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh is not authenticated; authenticate this machine first" >&2; exit 1; }

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER="$SRC_DIR/tools/github-open-runner.py"
[ -f "$RUNNER" ] || { echo "runner not found: $RUNNER" >&2; exit 1; }

install -d -m 700 "$INSTALL_ROOT"
install -m 755 "$RUNNER" "$INSTALL_ROOT/github-open-runner.py"
cat >"$INSTALL_ROOT/config.json" <<JSON
{
  "queue_repo": "$QUEUE_REPO",
  "device_id": "$DEVICE_ID",
  "allowed_authors": ["$ALLOWED_AUTHOR"],
  "poll_interval_seconds": 20
}
JSON
chmod 600 "$INSTALL_ROOT/config.json"

cat >/etc/systemd/system/3dvr-open-runner.service <<UNIT
[Unit]
Description=3DVR Open Runner ($DEVICE_ID)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 $INSTALL_ROOT/github-open-runner.py --config $INSTALL_ROOT/config.json
Restart=always
RestartSec=10
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=read-only
ProtectSystem=full
ReadWritePaths=$INSTALL_ROOT /tmp /var/tmp /root /home

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now 3dvr-open-runner.service
systemctl --no-pager --full status 3dvr-open-runner.service | sed -n '1,18p'
