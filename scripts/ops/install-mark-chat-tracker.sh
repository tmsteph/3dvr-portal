#!/usr/bin/env bash
set -euo pipefail

ROOT=${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}
install -d -o root -g root -m 0755 /opt/3dvr/mark-chat-tracker
install -d -o root -g root -m 0700 /var/lib/3dvr-mark-chat-tracker
install -d -o debian -g debian -m 0755 /home/debian/.local/share/3dvr/knowledge/mark-nadal

# The tracker imports this helper from /opt, not from the portal checkout.
# Install only the approved checkout's helper, atomically, and prove exact parity.
# Do not alter OpenBao credentials, configuration, or running broker services.
source_openbao_helper="$ROOT/apps/agent/connectors/secrets/openbao.js"
installed_openbao_helper="/opt/3dvr/secrets-broker/openbao.js"
if [ ! -f "$source_openbao_helper" ] || [ -L "$source_openbao_helper" ] ||
   [ ! -d /opt/3dvr/secrets-broker ] || [ -L /opt/3dvr/secrets-broker ] ||
   [ ! -f "$installed_openbao_helper" ] || [ -L "$installed_openbao_helper" ]; then
  echo 'OpenBao helper source or installed runtime is missing or unsafe; refusing tracker installation.' >&2
  exit 6
fi
if ! cmp -s "$source_openbao_helper" "$installed_openbao_helper"; then
  helper_tmp="$(mktemp /opt/3dvr/secrets-broker/.openbao.js.XXXXXXXX)"
  trap 'rm -f "$helper_tmp"' EXIT
  install -o root -g root -m 0644 "$source_openbao_helper" "$helper_tmp"
  cmp -s "$source_openbao_helper" "$helper_tmp" || { echo 'OpenBao helper staging verification failed.' >&2; exit 6; }
  mv -Tf "$helper_tmp" "$installed_openbao_helper"
  trap - EXIT
fi
cmp -s "$source_openbao_helper" "$installed_openbao_helper" || {
  echo 'OpenBao helper runtime verification failed.' >&2
  exit 6
}
echo 'OpenBao helper runtime matches approved source.'

install -o root -g root -m 0755 "$ROOT/scripts/ops/mark-chat-tracker.mjs" /opt/3dvr/mark-chat-tracker/tracker.mjs
install -o root -g root -m 0644 "$ROOT/ops/mark-chat-tracker/3dvr-mark-chat-tracker.service" /etc/systemd/system/3dvr-mark-chat-tracker.service
install -o root -g root -m 0644 "$ROOT/ops/mark-chat-tracker/3dvr-mark-chat-tracker.timer" /etc/systemd/system/3dvr-mark-chat-tracker.timer

systemctl daemon-reload
systemctl enable --now 3dvr-mark-chat-tracker.timer
if ! systemctl start 3dvr-mark-chat-tracker.service; then
  echo '::warning::Optional 3dvr-mark-chat-tracker.service failed; inspect its journal on the authorized OVH host.' >&2
  systemctl show 3dvr-mark-chat-tracker.service --no-pager \
    --property=ActiveState,SubState,Result,ExecMainCode,ExecMainStatus >&2 || true
fi
systemctl --no-pager --full status 3dvr-mark-chat-tracker.timer | sed -n '1,24p'
