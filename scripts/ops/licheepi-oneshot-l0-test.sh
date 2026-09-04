#!/usr/bin/env bash
set -euo pipefail

OVH_HOST="${OVH_HOST:-40.160.137.41}"
DO_HOST="${DO_HOST:-167.172.193.194}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-tmsteph/3dvr-portal}"
RESULT=/tmp/licheepi-oneshot-l0-result.json

python3 - <<'PY'
import json
for p in [
 'ops/licheepi-anchor-backup-result.json',
 'ops/licheepi-dual-cloud-reboot-result.json',
 'ops/licheepi-fwenv-readonly-result.json',
 'ops/licheepi-digitalocean-result.json',
 'ops/licheepi-fwenv-write-drill-result.json',
]:
    d=json.load(open(p)); assert d.get('ok') is True,(p,d)
PY

write_key(){
  local raw="$1" dest="$2"; [ -n "$raw" ] || return 0
  printf '%s\n' "$raw" > "$dest.raw"
  if grep -q 'BEGIN .*PRIVATE KEY' "$dest.raw"; then cp "$dest.raw" "$dest"
  elif base64 -d "$dest.raw" > "$dest" 2>/dev/null && grep -q 'BEGIN .*PRIVATE KEY' "$dest"; then :
  else rm -f "$dest" "$dest.raw"; return 0; fi
  chmod 600 "$dest"; rm -f "$dest.raw"
}
for n in a b c; do v="SSH_${n^^}"; write_key "${!v:-}" "/tmp/lpi-one-$n"; done
pick(){
  local host="$1"; shift
  local u k
  for u in "$@"; do for k in /tmp/lpi-one-a /tmp/lpi-one-b /tmp/lpi-one-c; do
    [ -f "$k" ] || continue
    if ssh -i "$k" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$u@$host" true >/dev/null 2>&1; then printf '%s|%s\n' "$u" "$k"; return 0; fi
  done; done
  return 1
}
ovh="$(pick "$OVH_HOST" debian root)"; do_c="$(pick "$DO_HOST" root debian)"
OU="${ovh%%|*}"; OK="${ovh#*|}"; DU="${do_c%%|*}"; DK="${do_c#*|}"
O=(-i "$OK" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)
D=(-i "$DK" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)

# Verify three independent recovery routes before touching boot state.
ssh "${O[@]}" "$OU@$OVH_HOST" "ssh -n -o BatchMode=yes -o ConnectTimeout=7 lpi4a true"
ssh "${O[@]}" "$OU@$OVH_HOST" "ssh -n -o BatchMode=yes -o ConnectTimeout=8 lpi4a-hetzner true"
ssh "${D[@]}" "$DU@$DO_HOST" "ssh -n -o BatchMode=yes -o ConnectTimeout=7 lpi4a-digitalocean true"

ARM=$(cat <<'PI'
set -euo pipefail
NORMAL='run bootcmd_load; bootslave; sysboot mmc ${mmcdev}:${mmcbootpart} any $boot_conf_addr_r $boot_conf_file;'
ONESHOT='setenv bootcmd ${normal_bootcmd}; saveenv; run bootcmd_load; bootslave; sysboot mmc ${mmcdev}:${mmcbootpart} any $boot_conf_addr_r /extlinux/oneshot-l0.conf;'
cfg=/tmp/3dvr-fw_env-oneshot.config
printf '/dev/mmcblk0 0xe0000 0x20000\n' > "$cfg"
trap 'rm -f "$cfg"' EXIT
sudo -n true
conf=/boot/extlinux/extlinux.conf
for u in lichee-tunnel.service 3dvr-lpi-hetzner.service 3dvr-lpi-digitalocean.service; do systemctl is-active --quiet "$u"; systemctl is-enabled --quiet "$u"; done
grep -Eq '^[[:space:]]*default[[:space:]]+l0([[:space:]]|$)' "$conf"
case "$(uname -r)" in 5.10.113*) ;; *) exit 20;; esac

# One-shot config is a copy of the known-good extlinux menu and itself defaults l0.
sudo -n cp -a "$conf" /boot/extlinux/oneshot-l0.conf
sudo -n sed -i -E '0,/^[[:space:]]*default[[:space:]]+[^[:space:]]+/s//default l0/' /boot/extlinux/oneshot-l0.conf
grep -Eq '^[[:space:]]*default[[:space:]]+l0([[:space:]]|$)' /boot/extlinux/oneshot-l0.conf

get(){ sudo -n fw_printenv -c "$cfg" "$1" 2>/dev/null | sed -n "s/^$1=//p"; }
before_bootcmd="$(get bootcmd)"; test "$before_bootcmd" = "$NORMAL"
before_btime="$(awk '$1=="btime"{print $2;exit}' /proc/stat)"

# Store the normal command as data, then arm a bootcmd whose FIRST action is to
# restore that normal command and save it persistently before loading anything.
sudo -n fw_setenv -c "$cfg" normal_bootcmd "$NORMAL"
sudo -n fw_setenv -c "$cfg" bootcmd "$ONESHOT"
test "$(get normal_bootcmd)" = "$NORMAL"
test "$(get bootcmd)" = "$ONESHOT"

raw=/tmp/3dvr-oneshot-armed.bin
sudo -n dd if=/dev/mmcblk0 of="$raw" bs=512 skip=1792 count=256 status=none
sudo -n chmod 0644 "$raw"
python3 - "$raw" <<'PY'
import struct,sys,zlib
b=open(sys.argv[1],'rb').read(); assert len(b)==0x20000
assert struct.unpack('<I',b[:4])[0] == (zlib.crc32(b[4:]) & 0xffffffff)
PY
sudo -n rm -f "$raw"
printf 'BTIME=%s\n' "$before_btime"
PI
)
AB64="$(printf '%s' "$ARM" | base64 -w0)"
out="$(ssh "${O[@]}" "$OU@$OVH_HOST" "printf '%s' '$AB64' | base64 -d | ssh -o BatchMode=yes -o ConnectTimeout=15 lpi4a 'bash -s'")"
BEFORE_BTIME="$(printf '%s\n' "$out" | sed -n 's/^BTIME=//p')"; test -n "$BEFORE_BTIME"

# Trigger exactly one known-good reboot.
ssh "${O[@]}" "$OU@$OVH_HOST" "ssh -n -o BatchMode=yes -o ConnectTimeout=8 lpi4a sudo -n systemctl reboot" >/dev/null 2>&1 || true
sleep 12

wait_ovh(){ for _ in $(seq 1 70); do ssh "${O[@]}" "$OU@$OVH_HOST" "ssh -n -o BatchMode=yes -o ConnectTimeout=5 lpi4a true" >/dev/null 2>&1 && return 0; sleep 3; done; return 1; }
wait_hetz(){ for _ in $(seq 1 70); do ssh "${O[@]}" "$OU@$OVH_HOST" "ssh -n -o BatchMode=yes -o ConnectTimeout=5 lpi4a-hetzner true" >/dev/null 2>&1 && return 0; sleep 3; done; return 1; }
wait_do(){ for _ in $(seq 1 70); do ssh "${D[@]}" "$DU@$DO_HOST" "ssh -n -o BatchMode=yes -o ConnectTimeout=5 lpi4a-digitalocean true" >/dev/null 2>&1 && return 0; sleep 3; done; return 1; }
wait_ovh; wait_hetz; wait_do

VERIFY=$(cat <<'PI'
set -euo pipefail
NORMAL='run bootcmd_load; bootslave; sysboot mmc ${mmcdev}:${mmcbootpart} any $boot_conf_addr_r $boot_conf_file;'
cfg=/tmp/3dvr-fw_env-oneshot.config; printf '/dev/mmcblk0 0xe0000 0x20000\n' > "$cfg"; trap 'rm -f "$cfg"' EXIT
get(){ sudo -n fw_printenv -c "$cfg" "$1" 2>/dev/null | sed -n "s/^$1=//p"; }
test "$(get bootcmd)" = "$NORMAL"
test "$(get normal_bootcmd)" = "$NORMAL"
grep -Eq '^[[:space:]]*default[[:space:]]+l0([[:space:]]|$)' /boot/extlinux/extlinux.conf
case "$(uname -r)" in 5.10.113*) ;; *) exit 30;; esac
for u in lichee-tunnel.service 3dvr-lpi-hetzner.service 3dvr-lpi-digitalocean.service; do systemctl is-active --quiet "$u"; done
# The helper is no longer needed after proving U-Boot restored bootcmd before Linux.
sudo -n fw_setenv -c "$cfg" normal_bootcmd
all="$(sudo -n fw_printenv -c "$cfg" 2>/dev/null)"; ! grep -q '^normal_bootcmd=' <<<"$all"
raw=/tmp/3dvr-oneshot-after.bin; sudo -n dd if=/dev/mmcblk0 of="$raw" bs=512 skip=1792 count=256 status=none; sudo -n chmod 0644 "$raw"
python3 - "$raw" <<'PY'
import hashlib,struct,sys,zlib
b=open(sys.argv[1],'rb').read(); s=struct.unpack('<I',b[:4])[0]; c=zlib.crc32(b[4:])&0xffffffff
assert s==c
print('ENV_SHA='+hashlib.sha256(b).hexdigest()); print('CRC='+hex(c))
PY
sudo -n rm -f "$raw"
printf 'AFTER_BTIME=%s\nKERNEL=%s\nDEFAULT=l0\nBOOTCMD_RESTORED=true\n' "$(awk '$1=="btime"{print $2;exit}' /proc/stat)" "$(uname -r)"
PI
)
VB64="$(printf '%s' "$VERIFY" | base64 -w0)"
post="$(ssh "${O[@]}" "$OU@$OVH_HOST" "printf '%s' '$VB64' | base64 -d | ssh -o BatchMode=yes -o ConnectTimeout=12 lpi4a 'bash -s'")"
AFTER_BTIME="$(printf '%s\n' "$post"|sed -n 's/^AFTER_BTIME=//p')"; test -n "$AFTER_BTIME"; test "$AFTER_BTIME" != "$BEFORE_BTIME"
KERNEL="$(printf '%s\n' "$post"|sed -n 's/^KERNEL=//p')"; ENV_SHA="$(printf '%s\n' "$post"|sed -n 's/^ENV_SHA=//p')"; CRC="$(printf '%s\n' "$post"|sed -n 's/^CRC=//p')"

BEFORE_BTIME="$BEFORE_BTIME" AFTER_BTIME="$AFTER_BTIME" KERNEL="$KERNEL" ENV_SHA="$ENV_SHA" CRC="$CRC" python3 - <<'PY' > "$RESULT"
import datetime,json,os
print(json.dumps({
 'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(), 'ok':True,
 'oneShotTarget':'l0','bootcmdRestoredBeforeLinux':True,'helperRemovedAfterVerification':True,
 'bootTimeBefore':int(os.environ['BEFORE_BTIME']),'bootTimeAfter':int(os.environ['AFTER_BTIME']),'bootTimeChanged':True,
 'kernelAfter':os.environ['KERNEL'],'extlinuxDefault':'l0','crcAfter':os.environ['CRC'],'environmentSha256After':os.environ['ENV_SHA'],
 'routesAfterReboot':{'ovh':True,'hetzner':True,'digitalOcean':True}
},indent=2))
PY
cat "$RESULT"

if [ -n "${GITHUB_TOKEN:-}" ]; then
  content="$(base64 -w0 "$RESULT")"; url="https://api.github.com/repos/$GITHUB_REPOSITORY/contents/ops/licheepi-oneshot-l0-result.json"
  sha="$(curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha", ""))' 2>/dev/null || true)"
  python3 - "$content" "$sha" <<'PY' >/tmp/lpi-one-payload.json
import json,sys
p={'message':'Record LicheePi one-shot l0 rollback drill','content':sys.argv[1],'branch':'main'}
if sys.argv[2]: p['sha']=sys.argv[2]
print(json.dumps(p))
PY
  curl -fsS -X PUT -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" --data-binary @/tmp/lpi-one-payload.json >/dev/null
fi
rm -f /tmp/lpi-one-a /tmp/lpi-one-b /tmp/lpi-one-c /tmp/lpi-one-payload.json
