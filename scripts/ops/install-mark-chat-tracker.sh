#!/usr/bin/env bash
set -euo pipefail

ROOT=${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}
install -d -o root -g root -m 0755 /opt/3dvr/mark-chat-tracker
install -d -o root -g root -m 0700 /var/lib/3dvr-mark-chat-tracker
install -d -o debian -g debian -m 0755 /home/debian/.local/share/3dvr/knowledge/mark-nadal

install -o root -g root -m 0755 "$ROOT/scripts/ops/mark-chat-tracker.mjs" /opt/3dvr/mark-chat-tracker/tracker.mjs
install -o root -g root -m 0644 "$ROOT/ops/mark-chat-tracker/3dvr-mark-chat-tracker.service" /etc/systemd/system/3dvr-mark-chat-tracker.service
install -o root -g root -m 0644 "$ROOT/ops/mark-chat-tracker/3dvr-mark-chat-tracker.timer" /etc/systemd/system/3dvr-mark-chat-tracker.timer

systemctl daemon-reload
systemctl enable --now 3dvr-mark-chat-tracker.timer
systemctl start 3dvr-mark-chat-tracker.service || true
systemctl --no-pager --full status 3dvr-mark-chat-tracker.timer | sed -n '1,24p'
