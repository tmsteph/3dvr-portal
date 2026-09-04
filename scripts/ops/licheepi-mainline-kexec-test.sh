#!/usr/bin/env bash
set -euo pipefail

OVH_HOST="${OVH_HOST:-40.160.137.41}"
HETZNER_HOST="${HETZNER_HOST:-167.233.174.20}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-tmsteph/3dvr-portal}"
CUTOFF_UTC="${CUTOFF_UTC:-2026-09-04T23:00:00Z}"
RESULT=/tmp/licheepi-mainline-kexec-result.json

python3 - "$CUTOFF_UTC" <<'PY'
import datetime,sys
cut=datetime.datetime.fromisoformat(sys.argv[1].replace('Z','+00:00'))
if datetime.datetime.now(datetime.timezone.utc) >= cut:
    print('On-site safety window expired; refusing mainline kexec.', file=sys.stderr)
    raise SystemExit(20)
PY

test -f ops/licheepi-resilience-result.json
python3 - <<'PY'
import json
r=json.load(open('ops/licheepi-resilience-result.json'))
assert r.get('ok') is True, 'resilience drill is not green'
assert r.get('boot',{}).get('default') == 'l0', 'known-good l0 is not default'
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
write_key "${SSH_A:-}" /tmp/lpi-k-a
write_key "${SSH_B:-}" /tmp/lpi-k-b
write_key "${SSH_C:-}" /tmp/lpi-k-c

pick(){
  local host="$1"; shift
  local u k
  for u in "$@"; do
    for k in /tmp/lpi-k-a /tmp/lpi-k-b /tmp/lpi-k-c; do
      [ -f "$k" ] || continue
      if ssh -i "$k" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$u@$host" true >/dev/null 2>&1; then
        printf '%s|%s\n' "$u" "$k"; return 0
      fi
    done
  done
  return 1
}

ovh="$(pick "$OVH_HOST" debian root)"
hetz="$(pick "$HETZNER_HOST" root debian ubuntu tmsteph)"
OU="${ovh%%|*}"; OK="${ovh#*|}"; HU="${hetz%%|*}"; HK="${hetz#*|}"
O=(-i "$OK" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)
H=(-i "$HK" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)
cloud_ovh(){ ssh "${O[@]}" "$OU@$OVH_HOST" "$@"; }
cloud_hetz(){ ssh "${H[@]}" "$HU@$HETZNER_HOST" "$@"; }
ovh_pi(){ cloud_ovh "ssh -n -o BatchMode=yes -o ConnectTimeout=7 lpi4a $*"; }
hetz_pi(){ cloud_hetz "ssh -n -o BatchMode=yes -o ConnectTimeout=7 lpi4a-hetzner $*"; }
route_ok(){
  case "$1" in
    ovh) cloud_ovh "ssh -n -o BatchMode=yes -o ConnectTimeout=5 lpi4a true" >/dev/null 2>&1 ;;
    hetz) cloud_hetz "ssh -n -o BatchMode=yes -o ConnectTimeout=5 lpi4a-hetzner true" >/dev/null 2>&1 ;;
  esac
}
wait_any(){ local tries="${1:-60}"; for ((i=0;i<tries;i++)); do route_ok hetz && { echo hetz; return 0; }; route_ok ovh && { echo ovh; return 0; }; sleep 3; done; return 1; }
pi(){ local r; r="$(wait_any 1)" || return 1; [ "$r" = hetz ] && hetz_pi "$*" || ovh_pi "$*"; }

route_ok ovh
route_ok hetz

PRE="$(pi "'uname -r; awk '\''$1==\"default\"{print $2; exit}'\'' /boot/extlinux/extlinux.conf'")"
printf '%s\n' "$PRE" | grep -q '^5\.10\.113'
printf '%s\n' "$PRE" | grep -qx 'l0'

SETUP=$(cat <<'PISETUP'
set -euo pipefail
sudo -n true
test -f /boot/vmlinux-7.1.12+deb14-riscv64
test -f /boot/initrd.img-7.1.12+deb14-riscv64
test "$(awk '$1=="default"{print $2; exit}' /boot/extlinux/extlinux.conf)" = l0
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y kexec-tools >/dev/null
command -v kexec >/dev/null
sudo tee /usr/local/sbin/3dvr-mainline-auto-return >/dev/null <<'SH'
#!/bin/sh
case "$(uname -r)" in
  7.1.12*) sleep 180; systemctl reboot ;;
esac
SH
sudo chmod 755 /usr/local/sbin/3dvr-mainline-auto-return
sudo tee /etc/systemd/system/3dvr-mainline-auto-return.service >/dev/null <<'UNIT'
[Unit]
Description=3DVR temporary auto-return from LicheePi mainline trial
After=multi-user.target

[Service]
Type=oneshot
TimeoutStartSec=0
ExecStart=/usr/local/sbin/3dvr-mainline-auto-return

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable 3dvr-mainline-auto-return.service >/dev/null
APPEND="$(awk 'BEGIN{f=0} tolower($1)=="label" && $2=="mainline71"{f=1;next} tolower($1)=="label" && f{exit} f && tolower($1)=="append"{$1=""; sub(/^ /,""); print; exit}' /boot/extlinux/extlinux.conf)"
test -n "$APPEND"
sudo kexec -l /boot/vmlinux-7.1.12+deb14-riscv64 --initrd=/boot/initrd.img-7.1.12+deb14-riscv64 --command-line="$APPEND panic=30"
echo READY
PISETUP
)
S64="$(printf '%s' "$SETUP" | base64 -w0)"
pi "\"printf '%s' '$S64' | base64 -d | bash -s\"" | grep -q READY

BOOT_BEFORE="$(pi "'cat /proc/sys/kernel/random/boot_id'")"
# Non-persistent jump: U-Boot/extlinux is untouched; normal reboot remains l0.
pi "'sudo -n kexec -e'" >/dev/null 2>&1 || true

MAINLINE_SEEN=false
MAINLINE_KERNEL=''
for ((i=0;i<60;i++)); do
  sleep 3
  if r="$(wait_any 1 2>/dev/null)"; then
    if [ "$r" = hetz ]; then MAINLINE_KERNEL="$(hetz_pi "'uname -r'" 2>/dev/null || true)"; else MAINLINE_KERNEL="$(ovh_pi "'uname -r'" 2>/dev/null || true)"; fi
    case "$MAINLINE_KERNEL" in 7.1.12*) MAINLINE_SEEN=true; break;; esac
  fi
done

# The temporary systemd service reboots mainline after 180s even if networking is broken.
VENDOR_RETURNED=false
VENDOR_KERNEL=''
BOOT_AFTER=''
for ((i=0;i<100;i++)); do
  sleep 3
  if r="$(wait_any 1 2>/dev/null)"; then
    if [ "$r" = hetz ]; then
      VENDOR_KERNEL="$(hetz_pi "'uname -r'" 2>/dev/null || true)"
      BOOT_AFTER="$(hetz_pi "'cat /proc/sys/kernel/random/boot_id'" 2>/dev/null || true)"
    else
      VENDOR_KERNEL="$(ovh_pi "'uname -r'" 2>/dev/null || true)"
      BOOT_AFTER="$(ovh_pi "'cat /proc/sys/kernel/random/boot_id'" 2>/dev/null || true)"
    fi
    case "$VENDOR_KERNEL" in 5.10.113*) VENDOR_RETURNED=true; break;; esac
  fi
done

OVH_OK=false; HETZ_OK=false
route_ok ovh && OVH_OK=true
route_ok hetz && HETZ_OK=true
DEFAULT_AFTER=''
if [ "$VENDOR_RETURNED" = true ]; then
  DEFAULT_AFTER="$(pi "\"awk '\\$1==\\\"default\\\"{print \\$2; exit}' /boot/extlinux/extlinux.conf\"")"
  pi "'sudo -n systemctl disable 3dvr-mainline-auto-return.service >/dev/null 2>&1 || true; sudo -n rm -f /etc/systemd/system/3dvr-mainline-auto-return.service /usr/local/sbin/3dvr-mainline-auto-return; sudo -n systemctl daemon-reload'" || true
fi

MAINLINE_SEEN="$MAINLINE_SEEN" MAINLINE_KERNEL="$MAINLINE_KERNEL" VENDOR_RETURNED="$VENDOR_RETURNED" VENDOR_KERNEL="$VENDOR_KERNEL" OVH_OK="$OVH_OK" HETZ_OK="$HETZ_OK" DEFAULT_AFTER="$DEFAULT_AFTER" BEFORE="$BOOT_BEFORE" AFTER="$BOOT_AFTER" python3 - <<'PY' > "$RESULT"
import datetime,json,os
r={
 'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'mainlineSeen':os.environ['MAINLINE_SEEN']=='true',
 'mainlineKernel':os.environ['MAINLINE_KERNEL'],
 'vendorReturned':os.environ['VENDOR_RETURNED']=='true',
 'vendorKernel':os.environ['VENDOR_KERNEL'],
 'routesAfterReturn':{'ovh':os.environ['OVH_OK']=='true','hetzner':os.environ['HETZ_OK']=='true'},
 'defaultAfter':os.environ['DEFAULT_AFTER'],
 'bootIdBefore':os.environ['BEFORE'],'bootIdAfter':os.environ['AFTER'],
}
r['recoveryOk']=r['vendorReturned'] and r['defaultAfter']=='l0' and all(r['routesAfterReturn'].values()) and r['bootIdAfter'] and r['bootIdAfter']!=r['bootIdBefore']
r['ok']=r['mainlineSeen'] and r['recoveryOk']
print(json.dumps(r,indent=2))
PY
cat "$RESULT"

if [ -n "${GITHUB_TOKEN:-}" ]; then
  content="$(base64 -w0 "$RESULT")"; url="https://api.github.com/repos/$GITHUB_REPOSITORY/contents/ops/licheepi-mainline-kexec-result.json"
  sha="$(curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha", ""))' 2>/dev/null || true)"
  python3 - "$content" "$sha" <<'PY' >/tmp/lpi-k-payload.json
import json,sys
p={'message':'Record LicheePi mainline kexec trial','content':sys.argv[1],'branch':'main'}
if sys.argv[2]: p['sha']=sys.argv[2]
print(json.dumps(p))
PY
  curl -fsS -X PUT -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" --data-binary @/tmp/lpi-k-payload.json >/dev/null
fi

python3 - "$RESULT" <<'PY'
import json,sys
raise SystemExit(0 if json.load(open(sys.argv[1])).get('ok') else 1)
PY
