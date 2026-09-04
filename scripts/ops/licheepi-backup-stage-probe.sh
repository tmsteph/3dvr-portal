#!/usr/bin/env bash
set -euo pipefail

: "${ANCHOR_HOST:?}" "${PI_ALIAS:?}" "${ANCHOR_USERS:?}"

write_key(){
  local raw="$1" dest="$2"
  [ -n "$raw" ] || return 0
  printf '%s\n' "$raw" > "$dest.raw"
  if grep -q 'BEGIN .*PRIVATE KEY' "$dest.raw"; then cp "$dest.raw" "$dest"
  elif base64 -d "$dest.raw" > "$dest" 2>/dev/null && grep -q 'BEGIN .*PRIVATE KEY' "$dest"; then :
  else rm -f "$dest" "$dest.raw"; return 0; fi
  chmod 600 "$dest"; rm -f "$dest.raw"
}
write_key "${SSH_A:-}" /tmp/lpi-stage-a
write_key "${SSH_B:-}" /tmp/lpi-stage-b
write_key "${SSH_C:-}" /tmp/lpi-stage-c

anchor_user=''; anchor_key=''
for u in $ANCHOR_USERS; do
  for k in /tmp/lpi-stage-a /tmp/lpi-stage-b /tmp/lpi-stage-c; do
    [ -f "$k" ] || continue
    if ssh -i "$k" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$u@$ANCHOR_HOST" true >/dev/null 2>&1; then
      anchor_user="$u"; anchor_key="$k"; break 2
    fi
  done
done
[ -n "$anchor_user" ] || { echo 'ANCHOR=false'; exit 1; }
opts=(-i "$anchor_key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)

ssh "${opts[@]}" "$anchor_user@$ANCHOR_HOST" "PI_ALIAS='$PI_ALIAS' bash -s" <<'REMOTE'
set -u
ok=true
check(){ name="$1"; shift; if "$@" >/dev/null 2>&1; then printf '%s=true\n' "$name"; else printf '%s=false\n' "$name"; ok=false; fi; }

# -n prevents nested SSH from consuming the remainder of this stdin-fed script.
check pi_route ssh -n -o BatchMode=yes -o ConnectTimeout=7 "$PI_ALIAS" true
check pi_sudo ssh -n -o BatchMode=yes -o ConnectTimeout=7 "$PI_ALIAS" sudo -n true

if ssh -n -o BatchMode=yes -o ConnectTimeout=8 "$PI_ALIAS" "sudo -n sh -c \"strings /dev/mmcblk0boot0 2>/dev/null | grep -m1 -E 'U-Boot 2020\\.01-gd6c9182f' >/dev/null\""; then echo uboot_identity=true; else echo uboot_identity=false; ok=false; fi

env_bytes="$(ssh -n -o BatchMode=yes -o ConnectTimeout=10 "$PI_ALIAS" "sudo -n dd if=/dev/mmcblk0 bs=512 skip=1792 count=256 status=none | wc -c" 2>/dev/null || true)"
if [ "$env_bytes" = 131072 ]; then echo env_read=true; else echo env_read=false; echo env_bytes="${env_bytes:-0}"; ok=false; fi

paths='extlinux Image vmlinux-5.10.113-lpi4a initrd.img-5.10.113-lpi4a dtbs/linux-image-5.10.113-lpi4a'
for p in $paths; do
  key="path_$(printf '%s' "$p" | tr '/.-' '___')"
  if ssh -n -o BatchMode=yes -o ConnectTimeout=7 "$PI_ALIAS" "test -e '/boot/$p'" >/dev/null 2>&1; then printf '%s=true\n' "$key"; else printf '%s=false\n' "$key"; ok=false; fi
done

tar_bytes="$(ssh -n -o BatchMode=yes -o ConnectTimeout=25 "$PI_ALIAS" "sudo -n tar -C /boot -czf - extlinux Image vmlinux-5.10.113-lpi4a initrd.img-5.10.113-lpi4a dtbs/linux-image-5.10.113-lpi4a 2>/dev/null | wc -c" 2>/dev/null || true)"
case "$tar_bytes" in ''|*[!0-9]*) tar_bytes=0;; esac
if [ "$tar_bytes" -gt 1000000 ]; then echo vendor_tar=true; echo vendor_tar_bytes="$tar_bytes"; else echo vendor_tar=false; echo vendor_tar_bytes="$tar_bytes"; ok=false; fi

testdir="$HOME/.3dvr/backups/licheepi/.probe-$$"
if mkdir -p "$testdir" 2>/dev/null && printf x > "$testdir/test" 2>/dev/null && rm -rf "$testdir" 2>/dev/null; then echo anchor_storage=true; else echo anchor_storage=false; ok=false; fi

[ "$ok" = true ]
REMOTE
