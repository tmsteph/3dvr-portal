#!/usr/bin/env bash
set -euo pipefail

OVH_HOST="${OVH_HOST:-40.160.137.41}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-tmsteph/3dvr-portal}"
RESULT=/tmp/licheepi-fwenv-readonly-result.json

python3 - <<'PY'
import json
p='ops/licheepi-anchor-backup-result.json'
d=json.load(open(p))
assert d.get('ok') and d.get('ovhBackup') and d.get('hetznerBackup') and d.get('independentPulls'), d
PY

write_key(){
  raw="$1"; dest="$2"; [ -n "$raw" ] || return 0
  printf '%s\n' "$raw" > "$dest.raw"
  if grep -q 'BEGIN .*PRIVATE KEY' "$dest.raw"; then cp "$dest.raw" "$dest"
  elif base64 -d "$dest.raw" > "$dest" 2>/dev/null && grep -q 'BEGIN .*PRIVATE KEY' "$dest"; then :
  else rm -f "$dest" "$dest.raw"; return 0; fi
  chmod 600 "$dest"; rm -f "$dest.raw"
}
write_key "${SSH_A:-}" /tmp/fw-a; write_key "${SSH_B:-}" /tmp/fw-b; write_key "${SSH_C:-}" /tmp/fw-c
user=''; key=''
for u in debian root; do
  for k in /tmp/fw-a /tmp/fw-b /tmp/fw-c; do
    [ -f "$k" ] || continue
    if ssh -i "$k" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$u@$OVH_HOST" true >/dev/null 2>&1; then user="$u"; key="$k"; break 2; fi
  done
done
[ -n "$user" ] || exit 1
opts=(-i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)

REMOTE=$(cat <<'REMOTE'
set -euo pipefail
cfg=/tmp/3dvr-fw_env.config
printf '/dev/mmcblk0 0xe0000 0x20000\n' > "$cfg"

# Install Debian's supported userspace reader if missing. This modifies only
# normal rootfs packages; it does not write U-Boot or /boot state.
if ! command -v fw_printenv >/dev/null 2>&1; then
  sudo -n apt-get update >/dev/null
  if ! sudo -n env DEBIAN_FRONTEND=noninteractive apt-get install -y libubootenv-tool >/dev/null 2>&1; then
    sudo -n env DEBIAN_FRONTEND=noninteractive apt-get install -y u-boot-tools >/dev/null
  fi
fi
tool="$(command -v fw_printenv)"
[ -x "$tool" ]
source='installed-debian-package'

help="$($tool -h 2>&1 || true)"
args=()
config_mode='-c'
restore=/tmp/3dvr-fw_env.config.original
had_config=false
cleanup(){
  if [ "$config_mode" = default-file ]; then
    if [ "$had_config" = true ]; then sudo -n cp -a "$restore" /etc/fw_env.config; else sudo -n rm -f /etc/fw_env.config; fi
  fi
  rm -f "$restore" "$cfg"
  sudo -n rm -f /tmp/3dvr-env-after-fwprint.bin
}
trap cleanup EXIT

if printf '%s' "$help" | grep -q -- '-c'; then
  args=(-c "$cfg")
else
  config_mode='default-file'
  if sudo -n test -e /etc/fw_env.config; then sudo -n cp -a /etc/fw_env.config "$restore"; sudo -n chmod 0644 "$restore"; had_config=true; fi
  sudo -n install -m 0644 "$cfg" /etc/fw_env.config
fi

get(){ sudo -n "$tool" "${args[@]}" "$1" 2>/dev/null | sed -n "s/^$1=//p"; }
bootcmd="$(get bootcmd)"
boot_conf_file="$(get boot_conf_file)"
bootdelay="$(get bootdelay)"
mmcdev="$(get mmcdev)"
mmcbootpart="$(get mmcbootpart)"

tmp=/tmp/3dvr-env-after-fwprint.bin
sudo -n dd if=/dev/mmcblk0 of="$tmp" bs=512 skip=1792 count=256 status=none
sudo -n chmod 0644 "$tmp"
python3 - "$tmp" "$source" "$config_mode" "$bootcmd" "$boot_conf_file" "$bootdelay" "$mmcdev" "$mmcbootpart" <<'PY'
import hashlib,json,struct,sys,zlib
p,source,config_mode,bootcmd,conf,delay,mmcdev,part=sys.argv[1:]
data=open(p,'rb').read(); stored=struct.unpack('<I',data[:4])[0]; calc=zlib.crc32(data[4:])&0xffffffff
expected='run bootcmd_load; bootslave; sysboot mmc ${mmcdev}:${mmcbootpart} any $boot_conf_addr_r $boot_conf_file;'
checks={
 'crc': stored==calc,
 'bootcmd': bootcmd==expected,
 'boot_conf_file': conf=='/extlinux/extlinux.conf',
 'bootdelay': delay=='2',
 'mmcdev': mmcdev=='0',
 'mmcbootpart': part=='2',
}
print(json.dumps({
 'ok':all(checks.values()),
 'toolSource':source,
 'configMode':config_mode,
 'config':'/dev/mmcblk0 0xe0000 0x20000',
 'checks':checks,
 'environmentSha256':hashlib.sha256(data).hexdigest(),
 'crcStoredLE':hex(stored),'crcCalculated':hex(calc),
 'bootFlow':{'bootcmd':bootcmd,'boot_conf_file':conf,'bootdelay':delay,'mmcdev':mmcdev,'mmcbootpart':part}
},indent=2))
PY
REMOTE
)
B64="$(printf '%s' "$REMOTE" | base64 -w0)"
ssh "${opts[@]}" "$user@$OVH_HOST" "printf '%s' '$B64' | base64 -d | ssh -o BatchMode=yes -o ConnectTimeout=30 lpi4a 'bash -s'" > "$RESULT"
cat "$RESULT"

if [ -n "${GITHUB_TOKEN:-}" ]; then
  content="$(base64 -w0 "$RESULT")"; url="https://api.github.com/repos/$GITHUB_REPOSITORY/contents/ops/licheepi-fwenv-readonly-result.json"
  sha="$(curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha", ""))' 2>/dev/null || true)"
  python3 - "$content" "$sha" <<'PY' >/tmp/fw-payload.json
import json,sys
p={'message':'Record LicheePi fw_printenv read-only validation','content':sys.argv[1],'branch':'main'}
if sys.argv[2]: p['sha']=sys.argv[2]
print(json.dumps(p))
PY
  curl -fsS -X PUT -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" --data-binary @/tmp/fw-payload.json >/dev/null
fi
python3 - "$RESULT" <<'PY'
import json,sys
raise SystemExit(0 if json.load(open(sys.argv[1])).get('ok') else 1)
PY
