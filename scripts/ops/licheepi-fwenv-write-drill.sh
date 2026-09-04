#!/usr/bin/env bash
set -euo pipefail

OVH_HOST="${OVH_HOST:-40.160.137.41}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-tmsteph/3dvr-portal}"
RESULT=/tmp/licheepi-fwenv-write-drill-result.json

# Refuse the write unless every prerequisite receipt is green.
python3 - <<'PY'
import json
checks={
 'backups':'ops/licheepi-anchor-backup-result.json',
 'reboot':'ops/licheepi-dual-cloud-reboot-result.json',
 'fwread':'ops/licheepi-fwenv-readonly-result.json',
 'digitalocean':'ops/licheepi-digitalocean-result.json',
}
for name,path in checks.items():
    d=json.load(open(path))
    assert d.get('ok') is True, (name,d)
assert json.load(open(checks['backups'])).get('independentPulls') is True
assert json.load(open(checks['reboot'])).get('routesAfterReboot') == {'ovh':True,'hetzner':True}
assert json.load(open(checks['fwread'])).get('probeVariableAbsent') is True
assert json.load(open(checks['fwread'])).get('threeCloudServicesActive') is True
assert json.load(open(checks['digitalocean'])).get('digitalOcean') is True
PY

write_key(){
  local raw="$1" dest="$2"
  [ -n "$raw" ] || return 0
  printf '%s\n' "$raw" > "$dest.raw"
  if grep -q 'BEGIN .*PRIVATE KEY' "$dest.raw"; then cp "$dest.raw" "$dest"
  elif base64 -d "$dest.raw" > "$dest" 2>/dev/null && grep -q 'BEGIN .*PRIVATE KEY' "$dest"; then :
  else rm -f "$dest" "$dest.raw"; return 0; fi
  chmod 600 "$dest"; rm -f "$dest.raw"
}
write_key "${SSH_A:-}" /tmp/lpi-w-a; write_key "${SSH_B:-}" /tmp/lpi-w-b; write_key "${SSH_C:-}" /tmp/lpi-w-c
user=''; key=''
for u in debian root; do
  for k in /tmp/lpi-w-a /tmp/lpi-w-b /tmp/lpi-w-c; do
    [ -f "$k" ] || continue
    if ssh -i "$k" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$u@$OVH_HOST" true >/dev/null 2>&1; then user="$u"; key="$k"; break 2; fi
  done
done
test -n "$user"
O=(-i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)

REMOTE=$(cat <<'REMOTE'
set -euo pipefail
cfg=/tmp/3dvr-fw_env-write.config
printf '/dev/mmcblk0 0xe0000 0x20000\n' > "$cfg"
var=threedvr_probe
value="onsite-$(date -u +%Y%m%dT%H%M%SZ)-$$"
before=/tmp/3dvr-fwenv-before.txt
after=/tmp/3dvr-fwenv-after.txt
raw=/tmp/3dvr-fwenv-after.bin
old_present=false
old_value=''
mutated=false

restore_probe(){
  # Best-effort emergency restore if any check fails after the write.
  [ "$mutated" = true ] || return 0
  set +e
  if [ "$old_present" = true ]; then
    sudo -n fw_setenv -c "$cfg" "$var" "$old_value"
  else
    sudo -n fw_setenv -c "$cfg" "$var"
  fi
  mutated=false
  set -e
}
cleanup(){
  restore_probe || true
  rm -f "$cfg" "$before" "$after"
  sudo -n rm -f "$raw"
}
trap cleanup EXIT

command -v fw_printenv >/dev/null
command -v fw_setenv >/dev/null
fw_printenv -h 2>&1 | grep -q -- '-c'
fw_setenv -h 2>&1 | grep -q -- '-c'
sudo -n true

conf=/boot/extlinux/extlinux.conf
grep -Eq '^[[:space:]]*default[[:space:]]+l0([[:space:]]|$)' "$conf"
systemctl is-active --quiet ssh || systemctl is-active --quiet sshd
for unit in lichee-tunnel.service 3dvr-lpi-hetzner.service 3dvr-lpi-digitalocean.service; do
  systemctl is-active --quiet "$unit"
  systemctl is-enabled --quiet "$unit"
done

# Full iterator output is the only reliable way to detect variable presence in
# libubootenv; querying one absent name still prints NAME= with exit status 0.
sudo -n fw_printenv -c "$cfg" 2>/dev/null | LC_ALL=C sort > "$before"
if grep -q "^${var}=" "$before"; then
  old_present=true
  old_value="$(sed -n "s/^${var}=//p" "$before" | head -1)"
fi
bootcmd_before="$(sudo -n fw_printenv -c "$cfg" bootcmd 2>/dev/null | sed 's/^bootcmd=//')"
conf_before="$(sudo -n fw_printenv -c "$cfg" boot_conf_file 2>/dev/null | sed 's/^boot_conf_file=//')"

# The only intentional U-Boot mutation in this drill.
sudo -n fw_setenv -c "$cfg" "$var" "$value"
mutated=true
readback="$(sudo -n fw_printenv -c "$cfg" 2>/dev/null | sed -n "s/^${var}=//p" | head -1)"
test "$readback" = "$value"

# Restore exactly what existed before the drill, then disarm emergency restore.
if [ "$old_present" = true ]; then
  sudo -n fw_setenv -c "$cfg" "$var" "$old_value"
else
  sudo -n fw_setenv -c "$cfg" "$var"
fi
mutated=false
sudo -n fw_printenv -c "$cfg" 2>/dev/null | LC_ALL=C sort > "$after"
cmp -s "$before" "$after"

sudo -n dd if=/dev/mmcblk0 of="$raw" bs=512 skip=1792 count=256 status=none
sudo -n chmod 0644 "$raw"
bootcmd_after="$(sudo -n fw_printenv -c "$cfg" bootcmd 2>/dev/null | sed 's/^bootcmd=//')"
conf_after="$(sudo -n fw_printenv -c "$cfg" boot_conf_file 2>/dev/null | sed 's/^boot_conf_file=//')"
test "$bootcmd_before" = "$bootcmd_after"
test "$conf_before" = "$conf_after"
grep -Eq '^[[:space:]]*default[[:space:]]+l0([[:space:]]|$)' "$conf"
for unit in lichee-tunnel.service 3dvr-lpi-hetzner.service 3dvr-lpi-digitalocean.service; do systemctl is-active --quiet "$unit"; done

python3 - "$raw" "$old_present" "$bootcmd_after" "$conf_after" <<'PY'
import json,struct,sys,zlib
p,old_present,bootcmd,conf=sys.argv[1:]
data=open(p,'rb').read(); assert len(data)==0x20000
stored=struct.unpack('<I',data[:4])[0]; calc=zlib.crc32(data[4:]) & 0xffffffff
expected='run bootcmd_load; bootslave; sysboot mmc ${mmcdev}:${mmcbootpart} any $boot_conf_addr_r $boot_conf_file;'
ok=(stored==calc and bootcmd==expected and conf=='/extlinux/extlinux.conf')
print(json.dumps({
 'ok':ok,
 'probeWriteVerified':True,
 'probeRestored':True,
 'semanticEnvironmentRestored':True,
 'probePreviouslyExisted':old_present=='true',
 'crcMatches':stored==calc,
 'crcStoredLE':hex(stored),
 'crcCalculated':hex(calc),
 'bootcmdPreserved':bootcmd==expected,
 'bootConfigPreserved':conf=='/extlinux/extlinux.conf',
 'extlinuxDefault':'l0',
 'cloudServicesActive':{'ovh':True,'hetzner':True,'digitalOcean':True}
},indent=2))
raise SystemExit(0 if ok else 9)
PY
REMOTE
)
B64="$(printf '%s' "$REMOTE" | base64 -w0)"
ssh "${O[@]}" "$user@$OVH_HOST" "printf '%s' '$B64' | base64 -d | ssh -o BatchMode=yes -o ConnectTimeout=20 lpi4a 'bash -s'" > "$RESULT"
cat "$RESULT"

if [ -n "${GITHUB_TOKEN:-}" ]; then
  content="$(base64 -w0 "$RESULT")"
  url="https://api.github.com/repos/$GITHUB_REPOSITORY/contents/ops/licheepi-fwenv-write-drill-result.json"
  sha="$(curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha", ""))' 2>/dev/null || true)"
  python3 - "$content" "$sha" <<'PY' >/tmp/lpi-w-payload.json
import json,sys
p={'message':'Record reversible LicheePi U-Boot environment write drill','content':sys.argv[1],'branch':'main'}
if sys.argv[2]: p['sha']=sys.argv[2]
print(json.dumps(p))
PY
  curl -fsS -X PUT -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" --data-binary @/tmp/lpi-w-payload.json >/dev/null
fi
rm -f /tmp/lpi-w-a /tmp/lpi-w-b /tmp/lpi-w-c /tmp/lpi-w-payload.json
python3 - "$RESULT" <<'PY'
import json,sys
raise SystemExit(0 if json.load(open(sys.argv[1])).get('ok') else 1)
PY
