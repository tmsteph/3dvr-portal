#!/usr/bin/env bash
set -euo pipefail

OVH_HOST="${OVH_HOST:-40.160.137.41}"

write_key(){
  local raw="$1" dest="$2"
  [ -n "$raw" ] || return 0
  printf '%s\n' "$raw" > "$dest.raw"
  if grep -q 'BEGIN .*PRIVATE KEY' "$dest.raw"; then cp "$dest.raw" "$dest"
  elif base64 -d "$dest.raw" > "$dest" 2>/dev/null && grep -q 'BEGIN .*PRIVATE KEY' "$dest"; then :
  else rm -f "$dest" "$dest.raw"; return 0; fi
  chmod 600 "$dest"; rm -f "$dest.raw"
}
write_key "${SSH_A:-}" /tmp/lpi-d-a
write_key "${SSH_B:-}" /tmp/lpi-d-b
write_key "${SSH_C:-}" /tmp/lpi-d-c

user=''; key=''
for u in debian root; do
  for k in /tmp/lpi-d-a /tmp/lpi-d-b /tmp/lpi-d-c; do
    [ -f "$k" ] || continue
    if ssh -i "$k" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$u@$OVH_HOST" true >/dev/null 2>&1; then
      user="$u"; key="$k"; break 2
    fi
  done
done
test -n "$user"
echo "OVH_USER=$user"

ssh -i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$user@$OVH_HOST" 'bash -s' <<'OVH'
set -u
check(){
  local label="$1"; shift
  if "$@"; then echo "$label=OK"; else echo "$label=FAIL:$?"; fi
}
check OVH_ROUTE ssh -n -o BatchMode=yes -o ConnectTimeout=6 lpi4a true
check HETZNER_ROUTE ssh -n -o BatchMode=yes -o ConnectTimeout=6 lpi4a-hetzner true
printf 'DEFAULT_RAW='
ssh -n -o BatchMode=yes -o ConnectTimeout=8 lpi4a "grep -i '^[[:space:]]*default[[:space:]]' /boot/extlinux/extlinux.conf | head -1" || true
printf 'KERNEL='
ssh -n -o BatchMode=yes -o ConnectTimeout=8 lpi4a uname -r || true
printf 'BOOT_ID_PRESENT='
ssh -n -o BatchMode=yes -o ConnectTimeout=8 lpi4a 'test -s /proc/sys/kernel/random/boot_id && echo yes || echo no' || true
printf 'PI_USER='
ssh -G lpi4a 2>/dev/null | awk '$1=="user"{print $2; exit}'
printf 'HETZNER_ALIAS_HOST='
ssh -G lpi4a-hetzner 2>/dev/null | awk '$1=="hostname"{print $2; exit}'
printf 'HETZNER_ALIAS_PORT='
ssh -G lpi4a-hetzner 2>/dev/null | awk '$1=="port"{print $2; exit}'
OVH
