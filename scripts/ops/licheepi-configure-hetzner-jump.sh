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
write_key "${SSH_A:-}" /tmp/lpi-j-a
write_key "${SSH_B:-}" /tmp/lpi-j-b
write_key "${SSH_C:-}" /tmp/lpi-j-c

user=''; key=''
for u in debian root; do
  for k in /tmp/lpi-j-a /tmp/lpi-j-b /tmp/lpi-j-c; do
    [ -f "$k" ] || continue
    if ssh -i "$k" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$u@$OVH_HOST" true >/dev/null 2>&1; then
      user="$u"; key="$k"; break 2
    fi
  done
done
test -n "$user"

ssh -i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$user@$OVH_HOST" 'bash -s' <<'OVH'
set -euo pipefail
ssh -n -o BatchMode=yes -o ConnectTimeout=6 3dvr-hetzner true
cfg="$HOME/.ssh/config"; mkdir -p "$HOME/.ssh"; touch "$cfg"; chmod 700 "$HOME/.ssh"; chmod 600 "$cfg"
identity="$(ssh -G lpi4a 2>/dev/null | awk '$1=="identityfile"{print $2; exit}')"
piuser="$(ssh -G lpi4a 2>/dev/null | awk '$1=="user"{print $2; exit}')"
test -n "$identity" -a -n "$piuser"
tmp="$(mktemp)"
sed '/^# BEGIN 3DVR LPI4A HETZNER JUMP$/,/^# END 3DVR LPI4A HETZNER JUMP$/d' "$cfg" > "$tmp"
cat >> "$tmp" <<CFG
# BEGIN 3DVR LPI4A HETZNER JUMP
Host lpi4a-hetzner
  HostName 127.0.0.1
  Port 2223
  User $piuser
  IdentityFile $identity
  IdentitiesOnly yes
  BatchMode yes
  StrictHostKeyChecking accept-new
  ConnectTimeout 6
  ProxyCommand ssh -o BatchMode=yes -o ConnectTimeout=6 3dvr-hetzner -W %h:%p
# END 3DVR LPI4A HETZNER JUMP
CFG
mv "$tmp" "$cfg"; chmod 600 "$cfg"
ssh -n -o BatchMode=yes -o ConnectTimeout=8 lpi4a true
ssh -n -o BatchMode=yes -o ConnectTimeout=8 lpi4a-hetzner true
printf 'OVH_PATH_OK\nHETZNER_PATH_OK\n'
OVH
