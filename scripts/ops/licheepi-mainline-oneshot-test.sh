#!/usr/bin/env bash
set -euo pipefail

OVH_HOST="${OVH_HOST:-40.160.137.41}"
DO_HOST="${DO_HOST:-167.172.193.194}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-tmsteph/3dvr-portal}"
RESULT=/tmp/licheepi-mainline-oneshot-result.json

python3 - <<'PY'
import json
req=[
 'ops/licheepi-anchor-backup-result.json',
 'ops/licheepi-mainline-preflight-result.json',
 'ops/licheepi-fwenv-readonly-result.json',
 'ops/licheepi-digitalocean-result.json',
 'ops/licheepi-fwenv-write-drill-result.json',
 'ops/licheepi-oneshot-l0-result.json',
]
for p in req:
    d=json.load(open(p)); assert d.get('ok') is True,(p,d)
assert json.load(open('ops/licheepi-oneshot-l0-result.json')).get('bootcmdRestoredBeforeLinux') is True
PY

write_key(){
  local raw="$1" dest="$2"; [ -n "$raw" ] || return 0
  printf '%s\n' "$raw" > "$dest.raw"
  if grep -q 'BEGIN .*PRIVATE KEY' "$dest.raw"; then cp "$dest.raw" "$dest"
  elif base64 -d "$dest.raw" > "$dest" 2>/dev/null && grep -q 'BEGIN .*PRIVATE KEY' "$dest"; then :
  else rm -f "$dest" "$dest.raw"; return 0; fi
  chmod 600 "$dest"; rm -f "$dest.raw"
}
write_key "${SSH_A:-}" /tmp/ml-a; write_key "${SSH_B:-}" /tmp/ml-b; write_key "${SSH_C:-}" /tmp/ml-c
pick(){
  local host="$1"; shift; local u k
  for u in "$@"; do for k in /tmp/ml-a /tmp/ml-b /tmp/ml-c; do
    [ -f "$k" ] || continue
    if ssh -i "$k" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$u@$host" true >/dev/null 2>&1; then printf '%s|%s\n' "$u" "$k"; return 0; fi
  done; done; return 1
}
ovh="$(pick "$OVH_HOST" debian root)"; do_c="$(pick "$DO_HOST" root debian)"
OU="${ovh%%|*}"; OK="${ovh#*|}"; DU="${do_c%%|*}"; DK="${do_c#*|}"
O=(-i "$OK" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)
D=(-i "$DK" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)

route_ovh(){ ssh "${O[@]}" "$OU@$OVH_HOST" "ssh -n -o BatchMode=yes -o ConnectTimeout=5 lpi4a true" >/dev/null 2>&1; }
route_hetz(){ ssh "${O[@]}" "$OU@$OVH_HOST" "ssh -n -o BatchMode=yes -o ConnectTimeout=5 lpi4a-hetzner true" >/dev/null 2>&1; }
route_do(){ ssh "${D[@]}" "$DU@$DO_HOST" "ssh -n -o BatchMode=yes -o ConnectTimeout=5 lpi4a-digitalocean true" >/dev/null 2>&1; }
route_ovh; route_hetz; route_do

# Arm through DigitalOcean because it was the first route to recover in the
# preceding known-good reboot drill. The durable extlinux file remains l0.
ARM=$(cat <<'PI'
set -euo pipefail
NORMAL='run bootcmd_load; bootslave; sysboot mmc ${mmcdev}:${mmcbootpart} any $boot_conf_addr_r $boot_conf_file;'
ONESHOT='setenv bootcmd ${normal_bootcmd}; saveenv; run bootcmd_load; bootslave; sysboot mmc ${mmcdev}:${mmcbootpart} any $boot_conf_addr_r /extlinux/mainline-once.conf;'
cfg=/tmp/3dvr-fw_env-mainline.config
printf '/dev/mmcblk0 0xe0000 0x20000\n' > "$cfg"
trap 'rm -f "$cfg"; sudo -n rm -f /tmp/3dvr-mainline-armed.bin' EXIT
sudo -n true
case "$(uname -r)" in 5.10.113*) ;; *) exit 20;; esac
conf=/boot/extlinux/extlinux.conf
grep -Eq '^[[:space:]]*default[[:space:]]+l0([[:space:]]|$)' "$conf"
for u in lichee-tunnel.service 3dvr-lpi-hetzner.service 3dvr-lpi-digitalocean.service; do systemctl is-active --quiet "$u"; systemctl is-enabled --quiet "$u"; done

# Build a separate one-shot menu and tag only the mainline71 append line.
sudo -n cp -a "$conf" /boot/extlinux/mainline-once.conf
sudo -n python3 - <<'PY'
p='/boot/extlinux/mainline-once.conf'
lines=open(p).read().splitlines()
out=[]; in_main=False; default_done=False; tagged=False
for line in lines:
    s=line.strip(); parts=s.split(None,1)
    key=parts[0].lower() if parts else ''
    if key=='default' and not default_done:
        prefix=line[:len(line)-len(line.lstrip())]; line=prefix+'default mainline71'; default_done=True
    if key=='label':
        in_main=(len(parts)>1 and parts[1].strip()=='mainline71')
    elif in_main and key=='append' and not tagged:
        if '3dvr_mainline_trial=1' not in line:
            line=line.rstrip()+' 3dvr_mainline_trial=1'
        tagged=True
    out.append(line)
assert default_done and tagged
open(p,'w').write('\n'.join(out)+'\n')
PY
grep -Eq '^[[:space:]]*default[[:space:]]+mainline71([[:space:]]|$)' /boot/extlinux/mainline-once.conf
grep -q '3dvr_mainline_trial=1' /boot/extlinux/mainline-once.conf
for f in /boot/vmlinux-7.1.12+deb14-riscv64 /boot/initrd.img-7.1.12+deb14-riscv64 /dtbs/linux-image-7.1.12+deb14-riscv64/thead/th1520-lichee-pi-4a-aic8801-test.dtb; do [ -s "$f" ]; done

# Persistent marker makes a networking-less mainline userspace boot observable
# after the automatic return to vendor.
sudo -n mkdir -p /var/lib/3dvr
sudo -n rm -f /var/lib/3dvr/mainline-trial-seen /var/lib/3dvr/mainline-trial-report
sudo -n tee /usr/local/sbin/3dvr-mainline-auto-return >/dev/null <<'SH'
#!/usr/bin/env bash
set -euo pipefail
mkdir -p /var/lib/3dvr
printf 'seen_at=%s\nkernel=%s\n' "$(date -u +%FT%TZ)" "$(uname -r)" > /var/lib/3dvr/mainline-trial-seen
sleep 120
systemctl reboot
SH
sudo -n chmod 0755 /usr/local/sbin/3dvr-mainline-auto-return
sudo -n tee /etc/systemd/system/3dvr-mainline-auto-return.service >/dev/null <<'UNIT'
[Unit]
Description=3DVR mainline one-shot automatic return to vendor boot
ConditionKernelCommandLine=3dvr_mainline_trial=1
After=multi-user.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/3dvr-mainline-auto-return
TimeoutStartSec=infinity

[Install]
WantedBy=multi-user.target
UNIT
sudo -n systemctl daemon-reload
sudo -n systemctl enable 3dvr-mainline-auto-return.service >/dev/null

sudo -n tee /usr/local/sbin/3dvr-mainline-trial-report >/dev/null <<'SH'
#!/usr/bin/env bash
set -u
printf 'KERNEL=%s\n' "$(uname -r)"
printf 'BTIME=%s\n' "$(awk '$1=="btime"{print $2;exit}' /proc/stat)"
printf 'SYSTEM=%s\n' "$(systemctl is-system-running 2>/dev/null || true)"
printf 'ROOT=%s\n' "$(findmnt -n -o SOURCE / 2>/dev/null || true)"
for u in lichee-tunnel.service 3dvr-lpi-hetzner.service 3dvr-lpi-digitalocean.service; do printf 'SERVICE_%s=%s\n' "${u//[^A-Za-z0-9]/_}" "$(systemctl is-active "$u" 2>/dev/null || true)"; done
printf 'ETH=%s\n' "$(ip -brief addr show end1 2>/dev/null | tr -s ' ' || true)"
printf 'WIFI=%s\n' "$(ip -brief addr show wlan0 2>/dev/null | tr -s ' ' || true)"
printf 'AIC=%s\n' "$(lsmod 2>/dev/null | awk '/aic8800/{a=a $1 ","} END{sub(/,$/,"",a);print a}')"
printf 'PVR=%s\n' "$(lsmod 2>/dev/null | awk 'tolower($1) ~ /pvr|powervr/{a=a $1 ","} END{sub(/,$/,"",a);print a}')"
printf 'DRM=%s\n' "$(ls /sys/class/drm 2>/dev/null | tr '\n' ',' | sed 's/,$//' || true)"
printf 'MARKER=%s\n' "$(tr '\n' ';' </var/lib/3dvr/mainline-trial-seen 2>/dev/null || true)"
SH
sudo -n chmod 0755 /usr/local/sbin/3dvr-mainline-trial-report

get(){ sudo -n fw_printenv -c "$cfg" "$1" 2>/dev/null | sed -n "s/^$1=//p"; }
test "$(get bootcmd)" = "$NORMAL"
before_btime="$(awk '$1=="btime"{print $2;exit}' /proc/stat)"
sudo -n fw_setenv -c "$cfg" normal_bootcmd "$NORMAL"
sudo -n fw_setenv -c "$cfg" bootcmd "$ONESHOT"
test "$(get normal_bootcmd)" = "$NORMAL"
test "$(get bootcmd)" = "$ONESHOT"
sudo -n dd if=/dev/mmcblk0 of=/tmp/3dvr-mainline-armed.bin bs=512 skip=1792 count=256 status=none
sudo -n chmod 0644 /tmp/3dvr-mainline-armed.bin
python3 - /tmp/3dvr-mainline-armed.bin <<'PY'
import struct,sys,zlib
b=open(sys.argv[1],'rb').read(); assert len(b)==0x20000
assert struct.unpack('<I',b[:4])[0] == (zlib.crc32(b[4:])&0xffffffff)
PY
printf 'BEFORE_BTIME=%s\n' "$before_btime"
PI
)
A64="$(printf '%s' "$ARM" | base64 -w0)"
arm_out="$(ssh "${D[@]}" "$DU@$DO_HOST" "printf '%s' '$A64' | base64 -d | ssh -o BatchMode=yes -o ConnectTimeout=15 lpi4a-digitalocean 'bash -s'")"
BEFORE_BTIME="$(printf '%s\n' "$arm_out" | sed -n 's/^BEFORE_BTIME=//p')"; test -n "$BEFORE_BTIME"

# Launch the one-shot. At this point the next U-Boot execution will restore and
# save the normal bootcmd before it attempts mainline71.
ssh "${D[@]}" "$DU@$DO_HOST" "ssh -n -o BatchMode=yes -o ConnectTimeout=8 lpi4a-digitalocean sudo -n systemctl reboot" >/dev/null 2>&1 || true
sleep 12

first_route=''; first_kernel=''; first_report=''; mainline_seen=false
for _ in $(seq 1 65); do
  if route_do; then first_route=do; first_report="$(ssh "${D[@]}" "$DU@$DO_HOST" "ssh -n -o BatchMode=yes -o ConnectTimeout=8 lpi4a-digitalocean sudo -n /usr/local/sbin/3dvr-mainline-trial-report" 2>/dev/null || true)"; break; fi
  if route_ovh; then first_route=ovh; first_report="$(ssh "${O[@]}" "$OU@$OVH_HOST" "ssh -n -o BatchMode=yes -o ConnectTimeout=8 lpi4a sudo -n /usr/local/sbin/3dvr-mainline-trial-report" 2>/dev/null || true)"; break; fi
  if route_hetz; then first_route=hetzner; first_report="$(ssh "${O[@]}" "$OU@$OVH_HOST" "ssh -n -o BatchMode=yes -o ConnectTimeout=8 lpi4a-hetzner sudo -n /usr/local/sbin/3dvr-mainline-trial-report" 2>/dev/null || true)"; break; fi
  sleep 3
done
first_kernel="$(printf '%s\n' "$first_report" | sed -n 's/^KERNEL=//p')"
case "$first_kernel" in 7.1.12*) mainline_seen=true;; esac

# If mainline networking came up, capture it and return to vendor immediately;
# otherwise the userspace auto-return service gets a chance to do so itself.
if [ "$mainline_seen" = true ]; then
  case "$first_route" in
    do) ssh "${D[@]}" "$DU@$DO_HOST" "ssh -n -o BatchMode=yes -o ConnectTimeout=8 lpi4a-digitalocean sudo -n systemctl reboot" >/dev/null 2>&1 || true;;
    ovh) ssh "${O[@]}" "$OU@$OVH_HOST" "ssh -n -o BatchMode=yes -o ConnectTimeout=8 lpi4a sudo -n systemctl reboot" >/dev/null 2>&1 || true;;
    hetzner) ssh "${O[@]}" "$OU@$OVH_HOST" "ssh -n -o BatchMode=yes -o ConnectTimeout=8 lpi4a-hetzner sudo -n systemctl reboot" >/dev/null 2>&1 || true;;
  esac
  sleep 12
fi

# Wait for durable vendor state. This also covers a mainline userspace boot with
# broken networking that is returned by the 120-second service.
vendor_route=''; vendor_report=''
for _ in $(seq 1 90); do
  if route_do; then
    r="$(ssh "${D[@]}" "$DU@$DO_HOST" "ssh -n -o BatchMode=yes -o ConnectTimeout=8 lpi4a-digitalocean sudo -n /usr/local/sbin/3dvr-mainline-trial-report" 2>/dev/null || true)"
    k="$(printf '%s\n' "$r"|sed -n 's/^KERNEL=//p')"; case "$k" in 5.10.113*) vendor_route=do; vendor_report="$r"; break;; esac
  fi
  if route_ovh; then
    r="$(ssh "${O[@]}" "$OU@$OVH_HOST" "ssh -n -o BatchMode=yes -o ConnectTimeout=8 lpi4a sudo -n /usr/local/sbin/3dvr-mainline-trial-report" 2>/dev/null || true)"
    k="$(printf '%s\n' "$r"|sed -n 's/^KERNEL=//p')"; case "$k" in 5.10.113*) vendor_route=ovh; vendor_report="$r"; break;; esac
  fi
  sleep 3
done
test -n "$vendor_route"

# Verify and clean the temporary helper only after known-good vendor Linux is up.
CLEAN=$(cat <<'PI'
set -euo pipefail
NORMAL='run bootcmd_load; bootslave; sysboot mmc ${mmcdev}:${mmcbootpart} any $boot_conf_addr_r $boot_conf_file;'
cfg=/tmp/3dvr-fw_env-mainline-clean.config; raw=/tmp/3dvr-mainline-clean.bin
printf '/dev/mmcblk0 0xe0000 0x20000\n' > "$cfg"; trap 'rm -f "$cfg"; sudo -n rm -f "$raw"' EXIT
case "$(uname -r)" in 5.10.113*) ;; *) exit 40;; esac
get(){ sudo -n fw_printenv -c "$cfg" "$1" 2>/dev/null | sed -n "s/^$1=//p"; }
test "$(get bootcmd)" = "$NORMAL"
grep -Eq '^[[:space:]]*default[[:space:]]+l0([[:space:]]|$)' /boot/extlinux/extlinux.conf
all="$(sudo -n fw_printenv -c "$cfg" 2>/dev/null)"
if grep -q '^normal_bootcmd=' <<<"$all"; then test "$(get normal_bootcmd)" = "$NORMAL"; sudo -n fw_setenv -c "$cfg" normal_bootcmd; fi
sudo -n dd if=/dev/mmcblk0 of="$raw" bs=512 skip=1792 count=256 status=none; sudo -n chmod 0644 "$raw"
python3 - "$raw" <<'PY'
import hashlib,struct,sys,zlib
b=open(sys.argv[1],'rb').read(); s=struct.unpack('<I',b[:4])[0]; c=zlib.crc32(b[4:])&0xffffffff
assert s==c
print('CRC='+hex(c)); print('ENV_SHA='+hashlib.sha256(b).hexdigest())
PY
printf 'MARKER=%s\n' "$(tr '\n' ';' </var/lib/3dvr/mainline-trial-seen 2>/dev/null || true)"
printf 'AFTER_BTIME=%s\n' "$(awk '$1=="btime"{print $2;exit}' /proc/stat)"
PI
)
C64="$(printf '%s' "$CLEAN" | base64 -w0)"
if [ "$vendor_route" = do ]; then clean_out="$(ssh "${D[@]}" "$DU@$DO_HOST" "printf '%s' '$C64' | base64 -d | ssh -o BatchMode=yes -o ConnectTimeout=12 lpi4a-digitalocean 'bash -s'")"; else clean_out="$(ssh "${O[@]}" "$OU@$OVH_HOST" "printf '%s' '$C64' | base64 -d | ssh -o BatchMode=yes -o ConnectTimeout=12 lpi4a 'bash -s'")"; fi
CRC="$(printf '%s\n' "$clean_out"|sed -n 's/^CRC=//p')"; ENV_SHA="$(printf '%s\n' "$clean_out"|sed -n 's/^ENV_SHA=//p')"; MARKER="$(printf '%s\n' "$clean_out"|sed -n 's/^MARKER=//p')"; AFTER_BTIME="$(printf '%s\n' "$clean_out"|sed -n 's/^AFTER_BTIME=//p')"

# Require all recovery routes again in final vendor state.
for _ in $(seq 1 45); do route_ovh && route_hetz && route_do && break; sleep 3; done
route_ovh; route_hetz; route_do

FIRST_REPORT_B64="$(printf '%s' "$first_report"|base64 -w0)" VENDOR_REPORT_B64="$(printf '%s' "$vendor_report"|base64 -w0)" BEFORE_BTIME="$BEFORE_BTIME" AFTER_BTIME="$AFTER_BTIME" FIRST_ROUTE="$first_route" FIRST_KERNEL="$first_kernel" MAINLINE_SEEN="$mainline_seen" VENDOR_ROUTE="$vendor_route" CRC="$CRC" ENV_SHA="$ENV_SHA" MARKER="$MARKER" python3 - <<'PY' > "$RESULT"
import base64,datetime,json,os
def parse(s):
 d={}
 for line in s.splitlines():
  if '=' in line:
   k,v=line.split('=',1); d[k]=v
 return d
first=parse(base64.b64decode(os.environ['FIRST_REPORT_B64']).decode(errors='replace'))
vendor=parse(base64.b64decode(os.environ['VENDOR_REPORT_B64']).decode(errors='replace'))
marker=os.environ.get('MARKER','')
mainline_seen=os.environ.get('MAINLINE_SEEN')=='true' or 'kernel=7.1.12' in marker
print(json.dumps({
 'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'ok':True,
 'mainlineReachedNetwork':os.environ.get('MAINLINE_SEEN')=='true',
 'mainlineReachedUserspace':mainline_seen,
 'firstReachableRoute':os.environ.get('FIRST_ROUTE',''),
 'firstKernel':os.environ.get('FIRST_KERNEL',''),
 'mainlineReport':first if os.environ.get('MAINLINE_SEEN')=='true' else {},
 'userspaceMarker':marker,
 'returnedToVendor':True,
 'vendorRoute':os.environ.get('VENDOR_ROUTE',''),
 'vendorReport':vendor,
 'bootTimeBefore':int(os.environ['BEFORE_BTIME']),
 'bootTimeAfter':int(os.environ['AFTER_BTIME']),
 'durableExtlinuxDefault':'l0',
 'durableBootcmdRestored':True,
 'crcAfter':os.environ.get('CRC',''),
 'environmentSha256After':os.environ.get('ENV_SHA',''),
 'routesAfterReturn':{'ovh':True,'hetzner':True,'digitalOcean':True},
 'hardHang':False,
},indent=2))
PY
cat "$RESULT"

if [ -n "${GITHUB_TOKEN:-}" ]; then
  content="$(base64 -w0 "$RESULT")"; url="https://api.github.com/repos/$GITHUB_REPOSITORY/contents/ops/licheepi-mainline-oneshot-result.json"
  sha="$(curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha", ""))' 2>/dev/null || true)"
  python3 - "$content" "$sha" <<'PY' >/tmp/ml-payload.json
import json,sys
p={'message':'Record guarded LicheePi mainline one-shot test','content':sys.argv[1],'branch':'main'}
if sys.argv[2]: p['sha']=sys.argv[2]
print(json.dumps(p))
PY
  curl -fsS -X PUT -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" --data-binary @/tmp/ml-payload.json >/dev/null
fi
rm -f /tmp/ml-a /tmp/ml-b /tmp/ml-c /tmp/ml-payload.json
