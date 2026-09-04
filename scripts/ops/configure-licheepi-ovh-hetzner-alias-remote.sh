#!/usr/bin/env bash
set -euo pipefail

ssh -o BatchMode=yes -o ConnectTimeout=6 3dvr-hetzner true

cfg="$HOME/.ssh/config"
mkdir -p "$HOME/.ssh"
touch "$cfg"
chmod 700 "$HOME/.ssh"
chmod 600 "$cfg"

identity="$(ssh -G lpi4a 2>/dev/null | awk '$1=="identityfile" {print $2; exit}')"
piuser="$(ssh -G lpi4a 2>/dev/null | awk '$1=="user" {print $2; exit}')"
test -n "$identity" -a -n "$piuser"

tmp="$(mktemp)"
sed '/^# BEGIN 3DVR LPI4A HETZNER JUMP$/,/^# END 3DVR LPI4A HETZNER JUMP$/d' "$cfg" > "$tmp"
{
  printf '%s\n' '# BEGIN 3DVR LPI4A HETZNER JUMP'
  printf '%s\n' 'Host lpi4a-hetzner'
  printf '%s\n' '  HostName 127.0.0.1'
  printf '%s\n' '  Port 2223'
  printf '  User %s\n' "$piuser"
  printf '  IdentityFile %s\n' "$identity"
  printf '%s\n' '  IdentitiesOnly yes'
  printf '%s\n' '  BatchMode yes'
  printf '%s\n' '  StrictHostKeyChecking accept-new'
  printf '%s\n' '  ConnectTimeout 6'
  printf '%s\n' '  ProxyCommand ssh -o BatchMode=yes -o ConnectTimeout=6 3dvr-hetzner -W %h:%p'
  printf '%s\n' '# END 3DVR LPI4A HETZNER JUMP'
} >> "$tmp"

mv "$tmp" "$cfg"
chmod 600 "$cfg"

ssh -o BatchMode=yes -o ConnectTimeout=8 lpi4a true
ssh -o BatchMode=yes -o ConnectTimeout=8 lpi4a-hetzner true
printf 'OVH_PATH_OK\nHETZNER_PATH_OK\n'
