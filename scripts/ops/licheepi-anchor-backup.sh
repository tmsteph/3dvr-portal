#!/usr/bin/env bash
set -euo pipefail

: "${ANCHOR_HOST:?}" "${PI_ALIAS:?}" "${ANCHOR_USERS:?}"
STAMP="${STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"

write_key() {
  local raw="$1" dest="$2"
  [ -n "$raw" ] || return 0
  printf '%s\n' "$raw" > "$dest.raw"
  if grep -q 'BEGIN .*PRIVATE KEY' "$dest.raw"; then cp "$dest.raw" "$dest"
  elif base64 -d "$dest.raw" > "$dest" 2>/dev/null && grep -q 'BEGIN .*PRIVATE KEY' "$dest"; then :
  else rm -f "$dest" "$dest.raw"; return 0; fi
  chmod 600 "$dest"; rm -f "$dest.raw"
}
write_key "${SSH_A:-}" /tmp/lpi-anchor-a
write_key "${SSH_B:-}" /tmp/lpi-anchor-b
write_key "${SSH_C:-}" /tmp/lpi-anchor-c

anchor_user=''; anchor_key=''
for u in $ANCHOR_USERS; do
  for k in /tmp/lpi-anchor-a /tmp/lpi-anchor-b /tmp/lpi-anchor-c; do
    [ -f "$k" ] || continue
    if ssh -i "$k" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$u@$ANCHOR_HOST" true >/dev/null 2>&1; then
      anchor_user="$u"; anchor_key="$k"; break 2
    fi
  done
done
[ -n "$anchor_user" ] || { printf 'ERROR_STAGE=anchor-bootstrap\n' >&2; exit 1; }
opts=(-i "$anchor_key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)

ssh "${opts[@]}" "$anchor_user@$ANCHOR_HOST" "STAMP='$STAMP' PI_ALIAS='$PI_ALIAS' bash -s" <<'REMOTE'
set -euo pipefail
stage=init
trap 'printf "ERROR_STAGE=%s\n" "$stage" >&2' ERR
umask 077
dest="$HOME/.3dvr/backups/licheepi/$STAMP"
mkdir -p "$dest"

# Every nested SSH invocation uses -n. This is essential because this script is
# itself arriving on stdin via `bash -s`; without -n the first nested SSH can
# consume the remaining script and make a partial backup look deceptively clean.
stage=pi-route
ssh -n -o BatchMode=yes -o ConnectTimeout=8 "$PI_ALIAS" true
stage=uboot-identity
live="$(ssh -n -o BatchMode=yes -o ConnectTimeout=8 "$PI_ALIAS" "sudo -n strings /dev/mmcblk0boot0 2>/dev/null | grep -m1 -E 'U-Boot 2020\\.01-gd6c9182f' || true")"
test -n "$live"

stage=environment
ssh -n -o BatchMode=yes -o ConnectTimeout=10 "$PI_ALIAS" "sudo -n dd if=/dev/mmcblk0 bs=512 skip=1792 count=256 status=none" > "$dest/uboot-env.bin"

stage=vendor-boot
ssh -n -o BatchMode=yes -o ConnectTimeout=25 "$PI_ALIAS" "sudo -n tar --ignore-failed-read -C /boot -czf - extlinux Image vmlinux-5.10.113-lpi4a initrd.img-5.10.113-lpi4a dtbs/linux-image-5.10.113-lpi4a 2>/dev/null" > "$dest/vendor-boot-recovery.tar.gz"
test -s "$dest/vendor-boot-recovery.tar.gz"

stage=baseline
ssh -n -o BatchMode=yes -o ConnectTimeout=8 "$PI_ALIAS" "cat /etc/os-release; printf '\n'; uname -a; printf '\n'; cat /proc/cmdline" > "$dest/system-baseline.txt"
printf '%s\n' "$live" > "$dest/live-uboot.txt"

stage=environment-crc
python3 - "$dest/uboot-env.bin" <<'PY'
import struct,sys,zlib
data=open(sys.argv[1],'rb').read()
assert len(data)==0x20000, len(data)
stored=struct.unpack('<I',data[:4])[0]
calc=zlib.crc32(data[4:]) & 0xffffffff
assert stored==calc, (hex(stored),hex(calc))
PY

stage=checksums
(cd "$dest" && sha256sum uboot-env.bin vendor-boot-recovery.tar.gz system-baseline.txt live-uboot.txt > SHA256SUMS && sha256sum -c SHA256SUMS >/dev/null)

printf 'STAMP=%s\nENV_SHA=%s\nBOOT_SHA=%s\nLIVE_UBOOT=%s\n' \
  "$STAMP" \
  "$(sha256sum "$dest/uboot-env.bin" | awk '{print $1}')" \
  "$(sha256sum "$dest/vendor-boot-recovery.tar.gz" | awk '{print $1}')" \
  "$live"
REMOTE
