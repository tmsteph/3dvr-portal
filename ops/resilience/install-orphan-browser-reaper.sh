#!/usr/bin/env bash
set -euo pipefail
[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo "root required" >&2; exit 77; }
source_file="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/scripts/ops/reap-orphan-browser-controllers.py"
install -m 0755 "$source_file" /usr/local/sbin/3dvr-reap-orphan-browser-controllers
cat >/etc/systemd/system/3dvr-orphan-browser-reaper.service <<'UNIT'
[Unit]
Description=Reap stale orphan browser controllers without touching persistent Chromium lanes

[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /usr/local/sbin/3dvr-reap-orphan-browser-controllers --apply
TimeoutStartSec=20
MemoryMax=48M
CPUQuota=20%
Nice=15
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
UNIT
cat >/etc/systemd/system/3dvr-orphan-browser-reaper.timer <<'UNIT'
[Unit]
Description=Periodically clean day-old orphan browser controllers

[Timer]
OnBootSec=5min
OnUnitActiveSec=15min
Unit=3dvr-orphan-browser-reaper.service

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now 3dvr-orphan-browser-reaper.timer
systemctl start 3dvr-orphan-browser-reaper.service
