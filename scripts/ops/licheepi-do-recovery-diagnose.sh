#!/usr/bin/env bash
set -euo pipefail

DO_HOST="${DO_HOST:-167.172.193.194}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-tmsteph/3dvr-portal}"
RESULT=/tmp/licheepi-do-recovery-diagnose.json

write_key(){
  local raw="$1" dest="$2"; [ -n "$raw" ] || return 0
  printf '%s\n' "$raw" > "$dest.raw"
  if grep -q 'BEGIN .*PRIVATE KEY' "$dest.raw"; then cp "$dest.raw" "$dest"
  elif base64 -d "$dest.raw" > "$dest" 2>/dev/null && grep -q 'BEGIN .*PRIVATE KEY' "$dest"; then :
  else rm -f "$dest" "$dest.raw"; return 0; fi
  chmod 600 "$dest"; rm -f "$dest.raw"
}
write_key "${SSH_A:-}" /tmp/lpi-do-diag-a
write_key "${SSH_B:-}" /tmp/lpi-do-diag-b
write_key "${SSH_C:-}" /tmp/lpi-do-diag-c

user=''; key=''
for u in root debian; do
  for k in /tmp/lpi-do-diag-a /tmp/lpi-do-diag-b /tmp/lpi-do-diag-c; do
    [ -f "$k" ] || continue
    if ssh -i "$k" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$u@$DO_HOST" true >/dev/null 2>&1; then
      user="$u"; key="$k"; break 2
    fi
  done
done
test -n "$user"
D=(-i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)

REMOTE=$(cat <<'PI'
set -euo pipefail
cfg=/tmp/3dvr-fw_env-do-diag.config
raw=/tmp/3dvr-fwenv-do-diag.bin
printf '/dev/mmcblk0 0xe0000 0x20000\n' > "$cfg"
cleanup(){ rm -f "$cfg"; sudo -n rm -f "$raw"; }
trap cleanup EXIT

get(){ sudo -n fw_printenv -c "$cfg" "$1" 2>/dev/null | sed -n "s/^$1=//p"; }
bootcmd="$(get bootcmd)"
normal_helper="$(get normal_bootcmd)"
all_env="$(sudo -n fw_printenv -c "$cfg" 2>/dev/null)"
helper_present=false; grep -q '^normal_bootcmd=' <<<"$all_env" && helper_present=true
ext_default="$(awk 'tolower($1)=="default"{print $2;exit}' /boot/extlinux/extlinux.conf)"
kernel="$(uname -r)"
btime="$(awk '$1=="btime"{print $2;exit}' /proc/stat)"

svc(){ systemctl is-active "$1" 2>/dev/null || true; }
enabled(){ systemctl is-enabled "$1" 2>/dev/null || true; }
ovh="$(svc lichee-tunnel.service)"; ovh_en="$(enabled lichee-tunnel.service)"
hetz="$(svc 3dvr-lpi-hetzner.service)"; hetz_en="$(enabled 3dvr-lpi-hetzner.service)"
do="$(svc 3dvr-lpi-digitalocean.service)"; do_en="$(enabled 3dvr-lpi-digitalocean.service)"

sudo -n dd if=/dev/mmcblk0 of="$raw" bs=512 skip=1792 count=256 status=none
sudo -n chmod 0644 "$raw"

# Keep journal excerpts compact and avoid shipping arbitrary environment data.
ovh_log="$(journalctl -u lichee-tunnel.service -b -n 12 --no-pager 2>/dev/null | tail -n 12 | tr '\n' '\036')"
hetz_log="$(journalctl -u 3dvr-lpi-hetzner.service -b -n 12 --no-pager 2>/dev/null | tail -n 12 | tr '\n' '\036')"
do_log="$(journalctl -u 3dvr-lpi-digitalocean.service -b -n 8 --no-pager 2>/dev/null | tail -n 8 | tr '\n' '\036')"
route="$(ip route 2>/dev/null | head -n 8 | tr '\n' '\036')"
addrs="$(ip -brief addr 2>/dev/null | head -n 8 | tr '\n' '\036')"

python3 - "$raw" "$bootcmd" "$normal_helper" "$helper_present" "$ext_default" "$kernel" "$btime" "$ovh" "$ovh_en" "$hetz" "$hetz_en" "$do" "$do_en" "$ovh_log" "$hetz_log" "$do_log" "$route" "$addrs" <<'PY'
import datetime,hashlib,json,struct,sys,zlib
(p,bootcmd,helper,hp,default,kernel,btime,ovh,ovh_en,hetz,hetz_en,do,do_en,ovh_log,hetz_log,do_log,route,addrs)=sys.argv[1:]
b=open(p,'rb').read(); stored=struct.unpack('<I',b[:4])[0]; calc=zlib.crc32(b[4:])&0xffffffff
normal='run bootcmd_load; bootslave; sysboot mmc ${mmcdev}:${mmcbootpart} any $boot_conf_addr_r $boot_conf_file;'
def lines(s): return [x for x in s.split('\x1e') if x]
print(json.dumps({
 'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'ok': stored==calc and default=='l0' and kernel.startswith('5.10.113') and do=='active',
 'kernel':kernel,'bootTime':int(btime),'extlinuxDefault':default,
 'bootcmdIsNormal':bootcmd==normal,'bootcmd':bootcmd,
 'normalHelperPresent':hp=='true','normalHelperMatches':helper==normal,
 'crcMatches':stored==calc,'crcStoredLE':hex(stored),'crcCalculated':hex(calc),
 'environmentSha256':hashlib.sha256(b).hexdigest(),
 'services':{
   'ovh':{'active':ovh,'enabled':ovh_en},
   'hetzner':{'active':hetz,'enabled':hetz_en},
   'digitalOcean':{'active':do,'enabled':do_en},
 },
 'network':{'routes':lines(route),'addresses':lines(addrs)},
 'journal':{'ovh':lines(ovh_log),'hetzner':lines(hetz_log),'digitalOcean':lines(do_log)}
},indent=2))
PY
PI
)
R64="$(printf '%s' "$REMOTE" | base64 -w0)"
ssh "${D[@]}" "$user@$DO_HOST" "printf '%s' '$R64' | base64 -d | ssh -o BatchMode=yes -o ConnectTimeout=12 lpi4a-digitalocean 'bash -s'" > "$RESULT"
cat "$RESULT"

if [ -n "${GITHUB_TOKEN:-}" ]; then
  content="$(base64 -w0 "$RESULT")"
  url="https://api.github.com/repos/$GITHUB_REPOSITORY/contents/ops/licheepi-do-recovery-diagnose.json"
  sha="$(curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha", ""))' 2>/dev/null || true)"
  python3 - "$content" "$sha" <<'PY' >/tmp/lpi-do-diag-payload.json
import json,sys
p={'message':'Record LicheePi DigitalOcean recovery diagnosis','content':sys.argv[1],'branch':'main'}
if sys.argv[2]: p['sha']=sys.argv[2]
print(json.dumps(p))
PY
  curl -fsS -X PUT -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" --data-binary @/tmp/lpi-do-diag-payload.json >/dev/null
fi
rm -f /tmp/lpi-do-diag-a /tmp/lpi-do-diag-b /tmp/lpi-do-diag-c /tmp/lpi-do-diag-payload.json
