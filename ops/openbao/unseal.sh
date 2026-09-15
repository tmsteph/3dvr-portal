#!/usr/bin/env bash
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo 'Run as root.' >&2; exit 2; }
BAO_ADDR=${BAO_ADDR:-http://127.0.0.1:8200}
LOCAL_SHARE=${THREEDVR_OPENBAO_LOCAL_SHARE:-/root/.3dvr/openbao-recovery/ovh-share-1}
MESH_KEY=${THREEDVR_MESH_KEY:-/home/debian/.ssh/id_ed25519_3dvr_mesh}
DO_HOST=${THREEDVR_DO_HOST:-167.172.193.194}
HETZNER_HOST=${THREEDVR_HETZNER_HOST:-167.233.174.20}

seal_state() {
  curl -fsS "$BAO_ADDR/v1/sys/seal-status" | jq -r '.sealed'
}

submit_file() {
  local file=$1
  jq -Rn --rawfile key "$file" '{key:($key|rtrimstr("\n"))}' \
    | curl -fsS -X PUT -H 'content-type: application/json' --data-binary @- "$BAO_ADDR/v1/sys/unseal" >/dev/null
}

fetch_share() {
  local host=$1 remote=$2 dest=$3
  umask 077
  sudo -H -u debian ssh -i "$MESH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new -o ConnectTimeout=8 "root@$host" "cat '$remote'" > "$dest"
  chmod 0600 "$dest"
}

for _ in $(seq 1 20); do
  if curl -fsS "$BAO_ADDR/v1/sys/seal-status" >/dev/null 2>&1; then break; fi
  sleep 1
done

[ "$(seal_state)" = false ] && exit 0
[ -s "$LOCAL_SHARE" ] || { echo 'Local OpenBao recovery share is missing.' >&2; exit 3; }
submit_file "$LOCAL_SHARE"
[ "$(seal_state)" = false ] && exit 0

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
if fetch_share "$DO_HOST" /root/.3dvr/openbao-recovery/ovh-share-2 "$tmp" 2>/dev/null; then
  submit_file "$tmp"
fi
if [ "$(seal_state)" = true ]; then
  : > "$tmp"
  fetch_share "$HETZNER_HOST" /root/.3dvr/openbao-recovery/ovh-share-3 "$tmp"
  submit_file "$tmp"
fi

[ "$(seal_state)" = false ] || { echo 'OpenBao remains sealed.' >&2; exit 4; }
