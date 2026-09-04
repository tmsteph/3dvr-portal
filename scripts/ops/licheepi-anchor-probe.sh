#!/usr/bin/env bash
set -u

write_key(){
  raw="$1"; dest="$2"; [ -n "$raw" ] || return 0
  printf '%s\n' "$raw" > "$dest.raw"
  if grep -q 'BEGIN .*PRIVATE KEY' "$dest.raw"; then cp "$dest.raw" "$dest"
  elif base64 -d "$dest.raw" > "$dest" 2>/dev/null && grep -q 'BEGIN .*PRIVATE KEY' "$dest"; then :
  else rm -f "$dest" "$dest.raw"; return 0; fi
  chmod 600 "$dest"; rm -f "$dest.raw"
}
write_key "${SSH_A:-}" /tmp/anchor-a; write_key "${SSH_B:-}" /tmp/anchor-b; write_key "${SSH_C:-}" /tmp/anchor-c

probe(){
  name="$1"; host="$2"; users="$3"; alias="$4"
  found_user=''; found_key=''
  for u in $users; do
    for k in /tmp/anchor-a /tmp/anchor-b /tmp/anchor-c; do
      [ -f "$k" ] || continue
      if ssh -i "$k" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$u@$host" true >/dev/null 2>&1; then found_user="$u"; found_key="$k"; break 2; fi
    done
  done
  cloud=false; pi=false; sudo_ok=false
  if [ -n "$found_user" ]; then
    cloud=true
    opts=(-i "$found_key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)
    ssh "${opts[@]}" "$found_user@$host" "ssh -o BatchMode=yes -o ConnectTimeout=7 '$alias' true" >/dev/null 2>&1 && pi=true
    if [ "$pi" = true ]; then
      ssh "${opts[@]}" "$found_user@$host" "ssh -o BatchMode=yes -o ConnectTimeout=7 '$alias' 'sudo -n true'" >/dev/null 2>&1 && sudo_ok=true
    fi
  fi
  printf '%s|%s|%s|%s|%s\n' "$name" "$cloud" "$found_user" "$pi" "$sudo_ok"
}

probe ovh 40.160.137.41 'debian root' lpi4a
probe hetzner 167.233.174.20 'root debian ubuntu tmsteph' lpi4a-hetzner
