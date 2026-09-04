#!/usr/bin/env bash
set -euo pipefail

OVH_HOST="${OVH_HOST:-40.160.137.41}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-tmsteph/3dvr-portal}"
RESULT=/tmp/licheepi-fwsetenv-diagnostic-result.json

write_key(){
  local raw="$1" dest="$2"
  [ -n "$raw" ] || return 0
  printf '%s\n' "$raw" > "$dest.raw"
  if grep -q 'BEGIN .*PRIVATE KEY' "$dest.raw"; then cp "$dest.raw" "$dest"
  elif base64 -d "$dest.raw" > "$dest" 2>/dev/null && grep -q 'BEGIN .*PRIVATE KEY' "$dest"; then :
  else rm -f "$dest" "$dest.raw"; return 0; fi
  chmod 600 "$dest"; rm -f "$dest.raw"
}
write_key "${SSH_A:-}" /tmp/lpi-fwd-a; write_key "${SSH_B:-}" /tmp/lpi-fwd-b; write_key "${SSH_C:-}" /tmp/lpi-fwd-c
user=''; key=''
for u in debian root; do
  for k in /tmp/lpi-fwd-a /tmp/lpi-fwd-b /tmp/lpi-fwd-c; do
    [ -f "$k" ] || continue
    if ssh -i "$k" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$u@$OVH_HOST" true >/dev/null 2>&1; then user="$u"; key="$k"; break 2; fi
  done
done
test -n "$user"
O=(-i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)

REMOTE=$(cat <<'REMOTE'
set -euo pipefail
cfg=/tmp/3dvr-fw_env_diag.config
raw=/tmp/3dvr-fw_env_diag.bin
printf '/dev/mmcblk0 0xe0000 0x20000\n' > "$cfg"
cleanup(){ rm -f "$cfg"; sudo -n rm -f "$raw"; }
trap cleanup EXIT

printenv_path="$(command -v fw_printenv || true)"
setenv_path="$(command -v fw_setenv || true)"
test -n "$printenv_path" -a -n "$setenv_path"

# Capture only CLI capabilities, never environment secrets.
help="$($setenv_path -h 2>&1 || true)"
has_c=false; has_s=false; has_N=false
printf '%s' "$help" | grep -q -- '-c' && has_c=true || true
printf '%s' "$help" | grep -q -- '-s' && has_s=true || true
printf '%s' "$help" | grep -q -- '-N' && has_N=true || true

probe_present=false
probe_len=0
if line="$(sudo -n "$printenv_path" -c "$cfg" threedvr_probe 2>/dev/null)"; then
  probe_present=true
  value="${line#*=}"
  probe_len="${#value}"
fi

bootcmd="$(sudo -n "$printenv_path" -c "$cfg" bootcmd 2>/dev/null | sed 's/^bootcmd=//')"
boot_conf_file="$(sudo -n "$printenv_path" -c "$cfg" boot_conf_file 2>/dev/null | sed 's/^boot_conf_file=//')"
extlinux_default="$(awk 'tolower($1)=="default"{print $2; exit}' /boot/extlinux/extlinux.conf)"

sudo -n dd if=/dev/mmcblk0 of="$raw" bs=512 skip=1792 count=256 status=none
sudo -n chmod 0644 "$raw"

python3 - "$raw" "$printenv_path" "$setenv_path" "$has_c" "$has_s" "$has_N" "$probe_present" "$probe_len" "$bootcmd" "$boot_conf_file" "$extlinux_default" <<'PY'
import json,struct,sys,zlib
p,printenv_path,setenv_path,has_c,has_s,has_N,probe_present,probe_len,bootcmd,conf,default=sys.argv[1:]
data=open(p,'rb').read(); stored=struct.unpack('<I',data[:4])[0]; calc=zlib.crc32(data[4:]) & 0xffffffff
expected='run bootcmd_load; bootslave; sysboot mmc ${mmcdev}:${mmcbootpart} any $boot_conf_addr_r $boot_conf_file;'
print(json.dumps({
  'ok': len(data)==0x20000 and stored==calc and bootcmd==expected and conf=='/extlinux/extlinux.conf' and default=='l0',
  'fwPrintenvPath': printenv_path,
  'fwSetenvPath': setenv_path,
  'fwSetenvOptions': {'c':has_c=='true','s':has_s=='true','N':has_N=='true'},
  'probePresent': probe_present=='true',
  'probeValueLength': int(probe_len),
  'crcMatches': stored==calc,
  'crcStoredLE': hex(stored),
  'crcCalculated': hex(calc),
  'bootcmdPreserved': bootcmd==expected,
  'bootConfigPreserved': conf=='/extlinux/extlinux.conf',
  'extlinuxDefault': default
},indent=2))
PY
REMOTE
)
B64="$(printf '%s' "$REMOTE" | base64 -w0)"
ssh "${O[@]}" "$user@$OVH_HOST" "printf '%s' '$B64' | base64 -d | ssh -o BatchMode=yes -o ConnectTimeout=20 lpi4a 'bash -s'" > "$RESULT"
cat "$RESULT"

if [ -n "${GITHUB_TOKEN:-}" ]; then
  content="$(base64 -w0 "$RESULT")"
  url="https://api.github.com/repos/$GITHUB_REPOSITORY/contents/ops/licheepi-fwsetenv-diagnostic-result.json"
  sha="$(curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha", ""))' 2>/dev/null || true)"
  python3 - "$content" "$sha" <<'PY' >/tmp/lpi-fwd-payload.json
import json,sys
p={'message':'Record LicheePi fw_setenv diagnostic','content':sys.argv[1],'branch':'main'}
if sys.argv[2]: p['sha']=sys.argv[2]
print(json.dumps(p))
PY
  curl -fsS -X PUT -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" --data-binary @/tmp/lpi-fwd-payload.json >/dev/null
fi
rm -f /tmp/lpi-fwd-a /tmp/lpi-fwd-b /tmp/lpi-fwd-c /tmp/lpi-fwd-payload.json
python3 - "$RESULT" <<'PY'
import json,sys
raise SystemExit(0 if json.load(open(sys.argv[1])).get('ok') else 1)
PY
