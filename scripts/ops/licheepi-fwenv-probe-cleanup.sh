#!/usr/bin/env bash
set -euo pipefail

OVH_HOST="${OVH_HOST:-40.160.137.41}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-tmsteph/3dvr-portal}"
RESULT=/tmp/licheepi-fwenv-probe-cleanup-result.json

write_key(){
  local raw="$1" dest="$2"
  [ -n "$raw" ] || return 0
  printf '%s\n' "$raw" > "$dest.raw"
  if grep -q 'BEGIN .*PRIVATE KEY' "$dest.raw"; then cp "$dest.raw" "$dest"
  elif base64 -d "$dest.raw" > "$dest" 2>/dev/null && grep -q 'BEGIN .*PRIVATE KEY' "$dest"; then :
  else rm -f "$dest" "$dest.raw"; return 0; fi
  chmod 600 "$dest"; rm -f "$dest.raw"
}
write_key "${SSH_A:-}" /tmp/lpi-c-a; write_key "${SSH_B:-}" /tmp/lpi-c-b; write_key "${SSH_C:-}" /tmp/lpi-c-c
user=''; key=''
for u in debian root; do
  for k in /tmp/lpi-c-a /tmp/lpi-c-b /tmp/lpi-c-c; do
    [ -f "$k" ] || continue
    if ssh -i "$k" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$u@$OVH_HOST" true >/dev/null 2>&1; then user="$u"; key="$k"; break 2; fi
  done
done
test -n "$user"
O=(-i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)

REMOTE=$(cat <<'REMOTE'
set -euo pipefail
cfg=/tmp/3dvr-fw_env_cleanup.config
raw=/tmp/3dvr-fw_env_cleanup.bin
printf '/dev/mmcblk0 0xe0000 0x20000\n' > "$cfg"
cleanup(){ rm -f "$cfg"; sudo -n rm -f "$raw"; }
trap cleanup EXIT

command -v fw_printenv >/dev/null
command -v fw_setenv >/dev/null
sudo -n true

# Refuse cleanup if critical boot state is already unhealthy.
bootcmd_before="$(sudo -n fw_printenv -c "$cfg" bootcmd 2>/dev/null | sed 's/^bootcmd=//')"
conf_before="$(sudo -n fw_printenv -c "$cfg" boot_conf_file 2>/dev/null | sed 's/^boot_conf_file=//')"
expected='run bootcmd_load; bootslave; sysboot mmc ${mmcdev}:${mmcbootpart} any $boot_conf_addr_r $boot_conf_file;'
test "$bootcmd_before" = "$expected"
test "$conf_before" = /extlinux/extlinux.conf
grep -Eq '^[[:space:]]*default[[:space:]]+l0([[:space:]]|$)' /boot/extlinux/extlinux.conf

present_before=false
if sudo -n fw_printenv -c "$cfg" threedvr_probe >/dev/null 2>&1; then present_before=true; fi

if [ "$present_before" = true ]; then
  sudo -n fw_setenv -c "$cfg" threedvr_probe
fi

present_after=false
if sudo -n fw_printenv -c "$cfg" threedvr_probe >/dev/null 2>&1; then present_after=true; fi
test "$present_after" = false

sudo -n dd if=/dev/mmcblk0 of="$raw" bs=512 skip=1792 count=256 status=none
sudo -n chmod 0644 "$raw"
bootcmd_after="$(sudo -n fw_printenv -c "$cfg" bootcmd 2>/dev/null | sed 's/^bootcmd=//')"
conf_after="$(sudo -n fw_printenv -c "$cfg" boot_conf_file 2>/dev/null | sed 's/^boot_conf_file=//')"
test "$bootcmd_after" = "$expected"
test "$conf_after" = /extlinux/extlinux.conf
grep -Eq '^[[:space:]]*default[[:space:]]+l0([[:space:]]|$)' /boot/extlinux/extlinux.conf

python3 - "$raw" "$present_before" "$present_after" <<'PY'
import json,struct,sys,zlib
p,before,after=sys.argv[1:]
data=open(p,'rb').read(); stored=struct.unpack('<I',data[:4])[0]; calc=zlib.crc32(data[4:])&0xffffffff
ok=(len(data)==0x20000 and stored==calc and after=='false')
print(json.dumps({
 'ok':ok,
 'probePresentBeforeCleanup':before=='true',
 'probePresentAfterCleanup':after=='true',
 'crcMatches':stored==calc,
 'crcStoredLE':hex(stored),
 'crcCalculated':hex(calc),
 'bootcmdPreserved':True,
 'bootConfigPreserved':True,
 'extlinuxDefault':'l0'
},indent=2))
raise SystemExit(0 if ok else 7)
PY
REMOTE
)
B64="$(printf '%s' "$REMOTE" | base64 -w0)"
ssh "${O[@]}" "$user@$OVH_HOST" "printf '%s' '$B64' | base64 -d | ssh -o BatchMode=yes -o ConnectTimeout=20 lpi4a 'bash -s'" > "$RESULT"
cat "$RESULT"

if [ -n "${GITHUB_TOKEN:-}" ]; then
  content="$(base64 -w0 "$RESULT")"
  url="https://api.github.com/repos/$GITHUB_REPOSITORY/contents/ops/licheepi-fwenv-probe-cleanup-result.json"
  sha="$(curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha", ""))' 2>/dev/null || true)"
  python3 - "$content" "$sha" <<'PY' >/tmp/lpi-c-payload.json
import json,sys
p={'message':'Record LicheePi U-Boot probe cleanup','content':sys.argv[1],'branch':'main'}
if sys.argv[2]: p['sha']=sys.argv[2]
print(json.dumps(p))
PY
  curl -fsS -X PUT -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" --data-binary @/tmp/lpi-c-payload.json >/dev/null
fi
rm -f /tmp/lpi-c-a /tmp/lpi-c-b /tmp/lpi-c-c /tmp/lpi-c-payload.json
python3 - "$RESULT" <<'PY'
import json,sys
raise SystemExit(0 if json.load(open(sys.argv[1])).get('ok') else 1)
PY
