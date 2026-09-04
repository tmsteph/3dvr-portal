#!/usr/bin/env bash
set -euo pipefail

OVH_HOST="${OVH_HOST:-40.160.137.41}"
HETZNER_HOST="${HETZNER_HOST:-167.233.174.20}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-tmsteph/3dvr-portal}"
RESULT=/tmp/licheepi-resilience-result.json

write_key(){
  local raw="$1" dest="$2"
  [ -n "$raw" ] || return 0
  printf '%s\n' "$raw" > "$dest.raw"
  if grep -q 'BEGIN .*PRIVATE KEY' "$dest.raw"; then cp "$dest.raw" "$dest"
  elif base64 -d "$dest.raw" > "$dest" 2>/dev/null && grep -q 'BEGIN .*PRIVATE KEY' "$dest"; then :
  else rm -f "$dest" "$dest.raw"; return 0; fi
  chmod 600 "$dest"; rm -f "$dest.raw"
}
write_key "${SSH_A:-}" /tmp/lpi-r-a
write_key "${SSH_B:-}" /tmp/lpi-r-b
write_key "${SSH_C:-}" /tmp/lpi-r-c

pick(){
  local host="$1"; shift
  local u k
  for u in "$@"; do
    for k in /tmp/lpi-r-a /tmp/lpi-r-b /tmp/lpi-r-c; do
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
ovh_fb(){ cloud_ovh "ssh -n -o BatchMode=yes -o ConnectTimeout=7 lpi4a-fallback $*"; }
hetz_pi(){ cloud_hetz "ssh -n -o BatchMode=yes -o ConnectTimeout=7 lpi4a-hetzner $*"; }

route_ok(){
  case "$1" in
    ovh) cloud_ovh "ssh -n -o BatchMode=yes -o ConnectTimeout=5 lpi4a true" >/dev/null 2>&1 ;;
    ovhfb) cloud_ovh "ssh -n -o BatchMode=yes -o ConnectTimeout=5 lpi4a-fallback true" >/dev/null 2>&1 ;;
    hetz) cloud_hetz "ssh -n -o BatchMode=yes -o ConnectTimeout=5 lpi4a-hetzner true" >/dev/null 2>&1 ;;
  esac
}
wait_route(){ local name="$1" tries="${2:-20}"; for ((i=0;i<tries;i++)); do route_ok "$name" && return 0; sleep 3; done; return 1; }

# Require the two already-proven independent clouds before adding/testing route 3.
route_ok ovh
route_ok hetz

# Build the second OVH reverse tunnel (2224) without modifying the known-good 2223 service.
PI_PUB="$(hetz_pi "'test -s ~/.ssh/3dvr_tunnel_ed25519.pub && cat ~/.ssh/3dvr_tunnel_ed25519.pub || ssh-keygen -y -f ~/.ssh/3dvr_tunnel_ed25519'")"
case "$PI_PUB" in ssh-*\ *) ;; *) echo 'bad Pi tunnel public key' >&2; exit 2;; esac
printf -v PI_PUB_Q '%q' "$PI_PUB"
cloud_ovh "umask 077; mkdir -p ~/.ssh; touch ~/.ssh/authorized_keys; chmod 700 ~/.ssh; chmod 600 ~/.ssh/authorized_keys; grep -qxF $PI_PUB_Q ~/.ssh/authorized_keys || printf '%s\\n' $PI_PUB_Q >> ~/.ssh/authorized_keys"

# Reuse the identity that already authenticates OVH -> Pi for the fallback alias.
cloud_ovh 'bash -s' <<'OVHCFG'
set -euo pipefail
cfg="$HOME/.ssh/config"; mkdir -p "$HOME/.ssh"; touch "$cfg"; chmod 700 "$HOME/.ssh"; chmod 600 "$cfg"
identity="$(ssh -G lpi4a 2>/dev/null | awk '$1=="identityfile"{print $2; exit}')"
user="$(ssh -G lpi4a 2>/dev/null | awk '$1=="user"{print $2; exit}')"
[ -n "$identity" ]; [ -n "$user" ]
tmp="$(mktemp)"
sed '/^# BEGIN 3DVR LPI4A OVH FALLBACK$/,/^# END 3DVR LPI4A OVH FALLBACK$/d' "$cfg" > "$tmp"
cat >> "$tmp" <<CFG
# BEGIN 3DVR LPI4A OVH FALLBACK
Host lpi4a-fallback
  HostName 127.0.0.1
  Port 2224
  User $user
  IdentityFile $identity
  IdentitiesOnly yes
  BatchMode yes
  StrictHostKeyChecking accept-new
  ConnectTimeout 6
  ServerAliveInterval 15
  ServerAliveCountMax 2
# END 3DVR LPI4A OVH FALLBACK
CFG
mv "$tmp" "$cfg"; chmod 600 "$cfg"
OVHCFG

PI_SETUP=$(cat <<EOF
set -euo pipefail
KEY=\"\$HOME/.ssh/3dvr_tunnel_ed25519\"
test -s \"\$KEY\"
sudo -n true
mkdir -p \"\$HOME/.local/bin\"
cat > \"\$HOME/.local/bin/3dvr-lpi-ovh-fallback-tunnel\" <<'SH'
#!/usr/bin/env bash
exec /usr/bin/ssh -NT -i \"\$HOME/.ssh/3dvr_tunnel_ed25519\" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=8 -o ServerAliveInterval=15 -o ServerAliveCountMax=2 -o ExitOnForwardFailure=yes -R 127.0.0.1:2224:127.0.0.1:22 $OU@$OVH_HOST
SH
chmod 700 \"\$HOME/.local/bin/3dvr-lpi-ovh-fallback-tunnel\"
sudo tee /etc/systemd/system/3dvr-lpi-ovh-fallback.service >/dev/null <<UNIT
[Unit]
Description=3DVR LicheePi second reverse SSH tunnel to OVH
Wants=network-online.target
After=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
User=\$(id -un)
Environment=HOME=\$HOME
ExecStart=\$HOME/.local/bin/3dvr-lpi-ovh-fallback-tunnel
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now 3dvr-lpi-ovh-fallback.service >/dev/null
EOF
)
P64="$(printf '%s' "$PI_SETUP" | base64 -w0)"
cloud_hetz "printf '%s' '$P64' | base64 -d | ssh -o BatchMode=yes -o ConnectTimeout=8 lpi4a-hetzner 'bash -s'"
wait_route ovhfb 20

# Snapshot static reliability prerequisites from the Pi.
AUDIT=$(cat <<'PIAUDIT'
set -euo pipefail
python3 - <<'PY'
import json,re,subprocess
from pathlib import Path

def cmd(s):
 p=subprocess.run(s,shell=True,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT); return p.returncode,p.stdout.strip()
def state(unit,prop): return cmd(f"systemctl show {unit} -p {prop} --value 2>/dev/null")[1]
def active(unit): return cmd(f"systemctl is-active {unit} 2>/dev/null")[1]
def enabled(unit): return cmd(f"systemctl is-enabled {unit} 2>/dev/null")[1]
ext=Path('/boot/extlinux/extlinux.conf').read_text(errors='replace')
m=re.search(r'^\s*default\s+(\S+)',ext,re.M|re.I)
units=['lichee-tunnel.service','3dvr-lpi-ovh-fallback.service','3dvr-lpi-hetzner.service']
r={
 'defaultBoot':m.group(1) if m else '',
 'sshActive':active('ssh') or active('sshd'),
 'sshEnabled':enabled('ssh') or enabled('sshd'),
 'networkHealActive':active('3dvr-lpi-network-heal.timer'),
 'networkHealEnabled':enabled('3dvr-lpi-network-heal.timer'),
 'tunnels':{}
}
for u in units:
 r['tunnels'][u]={'active':active(u),'enabled':enabled(u),'restart':state(u,'Restart'),'restartSec':state(u,'RestartUSec'),'mainPid':state(u,'MainPID')}
r['ok']=(r['defaultBoot']=='l0' and r['sshActive']=='active' and r['sshEnabled']=='enabled' and r['networkHealEnabled']=='enabled' and all(x['active']=='active' and x['enabled']=='enabled' and x['restart']=='always' for x in r['tunnels'].values()))
print(json.dumps(r))
PY
PIAUDIT
)
A64="$(printf '%s' "$AUDIT" | base64 -w0)"
STATIC="$(cloud_hetz "printf '%s' '$A64' | base64 -d | ssh -o BatchMode=yes -o ConnectTimeout=8 lpi4a-hetzner 'bash -s'")"
STATIC_OK="$(printf '%s' "$STATIC" | python3 -c 'import json,sys; print(str(bool(json.load(sys.stdin).get("ok"))).lower())')"
[ "$STATIC_OK" = true ]

# Crash-test each tunnel process. A different live route performs the kill.
crash_and_wait(){
  local unit="$1" route="$2"
  local q
  q="pid=\$(systemctl show '$unit' -p MainPID --value); test \"\$pid\" -gt 1; sudo -n kill -9 \"\$pid\""
  case "$route" in hetz) hetz_pi "\"$q\"" ;; ovh) ovh_pi "\"$q\"" ;; ovhfb) ovh_fb "\"$q\"" ;; esac
}

crash_and_wait lichee-tunnel.service hetz
wait_route ovh 20
route_ok hetz; route_ok ovhfb

crash_and_wait 3dvr-lpi-ovh-fallback.service hetz
wait_route ovhfb 20
route_ok ovh; route_ok hetz

crash_and_wait 3dvr-lpi-hetzner.service ovh
wait_route hetz 20
route_ok ovh; route_ok ovhfb

# Restart local SSH and prove every reverse route still works.
hetz_pi "'sudo -n systemctl restart ssh || sudo -n systemctl restart sshd'" || true
wait_route ovh 20; wait_route ovhfb 20; wait_route hetz 20

# Reboot only the known-good l0 system. This is the final persistence test.
DEFAULT="$(hetz_pi "\"awk '\\$1==\\\"default\\\"{print \\$2; exit}' /boot/extlinux/extlinux.conf\"")"
[ "$DEFAULT" = l0 ]
BOOT_ID_BEFORE="$(hetz_pi "'cat /proc/sys/kernel/random/boot_id'")"
hetz_pi "'sudo -n systemctl reboot'" >/dev/null 2>&1 || true

# All old routes should disappear briefly; then all three must return.
sleep 12
wait_route ovh 60
wait_route ovhfb 60
wait_route hetz 60
BOOT_ID_AFTER="$(hetz_pi "'cat /proc/sys/kernel/random/boot_id'")"
[ -n "$BOOT_ID_AFTER" ]
[ "$BOOT_ID_AFTER" != "$BOOT_ID_BEFORE" ]
POST_DEFAULT="$(hetz_pi "\"awk '\\$1==\\\"default\\\"{print \\$2; exit}' /boot/extlinux/extlinux.conf\"")"
[ "$POST_DEFAULT" = l0 ]

OVH_OK=false; OVH_FB_OK=false; HETZ_OK=false
route_ok ovh && OVH_OK=true
route_ok ovhfb && OVH_FB_OK=true
route_ok hetz && HETZ_OK=true
POST="$(cloud_hetz "printf '%s' '$A64' | base64 -d | ssh -o BatchMode=yes -o ConnectTimeout=8 lpi4a-hetzner 'bash -s'")"
POST_OK="$(printf '%s' "$POST" | python3 -c 'import json,sys; print(str(bool(json.load(sys.stdin).get("ok"))).lower())')"

STATIC="$STATIC" POST="$POST" OVH_OK="$OVH_OK" OVH_FB_OK="$OVH_FB_OK" HETZ_OK="$HETZ_OK" BEFORE="$BOOT_ID_BEFORE" AFTER="$BOOT_ID_AFTER" python3 - <<'PY' > "$RESULT"
import datetime,json,os
static=json.loads(os.environ['STATIC']); post=json.loads(os.environ['POST'])
ok=(os.environ['OVH_OK']=='true' and os.environ['OVH_FB_OK']=='true' and os.environ['HETZ_OK']=='true' and static.get('ok') and post.get('ok') and os.environ['BEFORE']!=os.environ['AFTER'])
print(json.dumps({
 'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'ok':ok,
 'routes':{'ovh2223':os.environ['OVH_OK']=='true','ovh2224':os.environ['OVH_FB_OK']=='true','hetzner2223':os.environ['HETZ_OK']=='true'},
 'tests':{'staticPrerequisites':bool(static.get('ok')),'primaryCrashRecovery':True,'ovhFallbackCrashRecovery':True,'hetznerCrashRecovery':True,'sshRestartRecovery':True,'knownGoodRebootRecovery':os.environ['BEFORE']!=os.environ['AFTER']},
 'boot':{'beforeId':os.environ['BEFORE'],'afterId':os.environ['AFTER'],'default':'l0'},
 'static':static,'postReboot':post
},indent=2))
PY
cat "$RESULT"

if [ -n "${GITHUB_TOKEN:-}" ]; then
  content="$(base64 -w0 "$RESULT")"; url="https://api.github.com/repos/$GITHUB_REPOSITORY/contents/ops/licheepi-resilience-result.json"
  sha="$(curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha", ""))' 2>/dev/null || true)"
  python3 - "$content" "$sha" <<'PY' >/tmp/lpi-r-payload.json
import json,sys
p={'message':'Record LicheePi resilience drill','content':sys.argv[1],'branch':'main'}
if sys.argv[2]: p['sha']=sys.argv[2]
print(json.dumps(p))
PY
  curl -fsS -X PUT -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" --data-binary @/tmp/lpi-r-payload.json >/dev/null
fi

python3 - "$RESULT" <<'PY'
import json,sys
raise SystemExit(0 if json.load(open(sys.argv[1])).get('ok') else 1)
PY
