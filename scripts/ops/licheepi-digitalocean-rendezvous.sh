#!/usr/bin/env bash
set -euo pipefail

OVH_HOST="${OVH_HOST:-40.160.137.41}"
DO_HOST="${DO_HOST:-167.172.193.194}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-tmsteph/3dvr-portal}"
RESULT=/tmp/licheepi-digitalocean-result.json

write_key(){
  local raw="$1" dest="$2"
  [ -n "$raw" ] || return 0
  printf '%s\n' "$raw" > "$dest.raw"
  if grep -q 'BEGIN .*PRIVATE KEY' "$dest.raw"; then cp "$dest.raw" "$dest"
  elif base64 -d "$dest.raw" > "$dest" 2>/dev/null && grep -q 'BEGIN .*PRIVATE KEY' "$dest"; then :
  else rm -f "$dest" "$dest.raw"; return 0; fi
  chmod 600 "$dest"; rm -f "$dest.raw"
}
for pair in "${SSH_A:-}:/tmp/lpi-do-a" "${SSH_B:-}:/tmp/lpi-do-b" "${SSH_C:-}:/tmp/lpi-do-c"; do
  write_key "${pair%%:*}" "${pair#*:}"
done

pick(){
  local host="$1"; shift
  local user key
  for user in "$@"; do
    for key in /tmp/lpi-do-a /tmp/lpi-do-b /tmp/lpi-do-c; do
      [ -f "$key" ] || continue
      if ssh -i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$user@$host" true >/dev/null 2>&1; then
        printf '%s|%s\n' "$user" "$key"; return 0
      fi
    done
  done
  return 1
}

ovh="$(pick "$OVH_HOST" debian root)" || { echo '{"ok":false,"reason":"OVH bootstrap unavailable"}' > "$RESULT"; exit 1; }
do_conn="$(pick "$DO_HOST" root debian)" || { echo '{"ok":false,"reason":"DigitalOcean bootstrap unavailable"}' > "$RESULT"; exit 1; }
OU="${ovh%%|*}"; OK="${ovh#*|}"
DU="${do_conn%%|*}"; DK="${do_conn#*|}"
O=(-i "$OK" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)
D=(-i "$DK" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)

# Existing OVH recovery must be healthy before adding anything.
ssh "${O[@]}" "$OU@$OVH_HOST" "ssh -n -o BatchMode=yes -o ConnectTimeout=7 lpi4a true"

# Refuse to trample an unrelated listener on DO:2223. If the expected alias is
# already functional, the rest of this script is idempotent and can repair the
# Pi service definition safely.
if ssh "${D[@]}" "$DU@$DO_HOST" "ss -ltnH 2>/dev/null | awk '{print \$4}' | grep -Eq '(^|:)2223$'"; then
  if ! ssh "${D[@]}" "$DU@$DO_HOST" "ssh -n -o BatchMode=yes -o ConnectTimeout=5 lpi4a-digitalocean true" >/dev/null 2>&1; then
    echo '{"ok":false,"reason":"DigitalOcean loopback port 2223 is already occupied by an unknown service"}' > "$RESULT"
    cat "$RESULT"
    exit 2
  fi
fi

# Reuse the Pi's existing outbound tunnel identity; expose only its public key.
PI_PUB="$(ssh "${O[@]}" "$OU@$OVH_HOST" "ssh -n -o BatchMode=yes -o ConnectTimeout=7 lpi4a 'test -s ~/.ssh/3dvr_tunnel_ed25519.pub && cat ~/.ssh/3dvr_tunnel_ed25519.pub || ssh-keygen -y -f ~/.ssh/3dvr_tunnel_ed25519'")"
case "$PI_PUB" in ssh-ed25519\ *|ssh-rsa\ *|ecdsa-sha2-*\ *) ;; *) echo '{"ok":false,"reason":"Could not derive Pi tunnel public key"}' > "$RESULT"; exit 3;; esac
PI_PUB_B64="$(printf '%s' "$PI_PUB" | base64 -w0)"

# Authorize Pi outbound tunnel and ensure DO has its cloud-mesh key.
DO_MESH_PUB="$(ssh "${D[@]}" "$DU@$DO_HOST" "PI_PUB_B64='$PI_PUB_B64' bash -s" <<'DO'
set -euo pipefail
umask 077
mkdir -p "$HOME/.ssh"; chmod 700 "$HOME/.ssh"
touch "$HOME/.ssh/authorized_keys"; chmod 600 "$HOME/.ssh/authorized_keys"
pub="$(printf '%s' "$PI_PUB_B64" | base64 -d)"
grep -qxF "$pub" "$HOME/.ssh/authorized_keys" || printf '%s\n' "$pub" >> "$HOME/.ssh/authorized_keys"
test -s "$HOME/.ssh/id_ed25519_3dvr_mesh" || ssh-keygen -q -t ed25519 -N '' -C 3dvr-mesh-do -f "$HOME/.ssh/id_ed25519_3dvr_mesh"
cat "$HOME/.ssh/id_ed25519_3dvr_mesh.pub"
DO
)"
case "$DO_MESH_PUB" in ssh-ed25519\ *|ssh-rsa\ *|ecdsa-sha2-*\ *) ;; *) echo '{"ok":false,"reason":"Could not obtain DO mesh public key"}' > "$RESULT"; exit 4;; esac
DO_PUB_B64="$(printf '%s' "$DO_MESH_PUB" | base64 -w0)"

# Configure the third outbound tunnel on the Pi through the already-proven OVH
# path. This is additive; OVH and Hetzner units are untouched.
PI_SCRIPT=$(cat <<'PI'
set -euo pipefail
DO_HOST="$1"; DO_USER="$2"; DO_PUB_B64="$3"
KEY="$HOME/.ssh/3dvr_tunnel_ed25519"
[ -s "$KEY" ]
sudo -n true
mkdir -p "$HOME/.ssh" "$HOME/.local/bin"
chmod 700 "$HOME/.ssh"
touch "$HOME/.ssh/authorized_keys"; chmod 600 "$HOME/.ssh/authorized_keys"
do_pub="$(printf '%s' "$DO_PUB_B64" | base64 -d)"
grep -qxF "$do_pub" "$HOME/.ssh/authorized_keys" || printf '%s\n' "$do_pub" >> "$HOME/.ssh/authorized_keys"
cat > "$HOME/.local/bin/3dvr-lpi-digitalocean-tunnel" <<EOF
#!/usr/bin/env bash
exec /usr/bin/ssh -NT -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=8 -o ServerAliveInterval=15 -o ServerAliveCountMax=2 -o ExitOnForwardFailure=yes -R 127.0.0.1:2223:localhost:22 $DO_USER@$DO_HOST
EOF
chmod 700 "$HOME/.local/bin/3dvr-lpi-digitalocean-tunnel"
sudo tee /etc/systemd/system/3dvr-lpi-digitalocean.service >/dev/null <<EOF
[Unit]
Description=3DVR LicheePi reverse SSH recovery tunnel to DigitalOcean
Wants=network-online.target
After=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
User=$(id -un)
Environment=HOME=$HOME
ExecStart=$HOME/.local/bin/3dvr-lpi-digitalocean-tunnel
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now 3dvr-lpi-digitalocean.service >/dev/null
printf 'SERVICE=%s\nENABLED=%s\n' "$(systemctl is-active 3dvr-lpi-digitalocean.service)" "$(systemctl is-enabled 3dvr-lpi-digitalocean.service)"
PI
)
PI_B64="$(printf '%s' "$PI_SCRIPT" | base64 -w0)"
ssh "${O[@]}" "$OU@$OVH_HOST" "printf '%s' '$PI_B64' | base64 -d | ssh -o BatchMode=yes -o ConnectTimeout=12 lpi4a 'bash -s -- $DO_HOST $DU $DO_PUB_B64'" > /tmp/lpi-do-pi.txt

# Configure DO's stable local alias to its own reverse listener.
ssh "${D[@]}" "$DU@$DO_HOST" 'bash -s' <<'DOALIAS'
set -euo pipefail
cfg="$HOME/.ssh/config"; mkdir -p "$HOME/.ssh"; touch "$cfg"; chmod 700 "$HOME/.ssh"; chmod 600 "$cfg"
tmp="$(mktemp)"
sed '/^# BEGIN 3DVR LPI4A DIGITALOCEAN$/,/^# END 3DVR LPI4A DIGITALOCEAN$/d' "$cfg" > "$tmp"
cat >> "$tmp" <<'CFG'
# BEGIN 3DVR LPI4A DIGITALOCEAN
Host lpi4a-digitalocean
  HostName 127.0.0.1
  Port 2223
  User sipeed
  IdentityFile ~/.ssh/id_ed25519_3dvr_mesh
  IdentitiesOnly yes
  BatchMode yes
  StrictHostKeyChecking accept-new
  ConnectTimeout 6
  ServerAliveInterval 20
  ServerAliveCountMax 3
# END 3DVR LPI4A DIGITALOCEAN
CFG
mv "$tmp" "$cfg"; chmod 600 "$cfg"
DOALIAS

# Verify DO independently, plus ensure existing routes are still intact.
do_ok=false; ovh_ok=false; hetz_ok=false
for _ in 1 2 3 4 5 6 7 8; do
  if ssh "${D[@]}" "$DU@$DO_HOST" "ssh -n -o BatchMode=yes -o ConnectTimeout=6 lpi4a-digitalocean true" >/dev/null 2>&1; then do_ok=true; break; fi
  sleep 3
done
ssh "${O[@]}" "$OU@$OVH_HOST" "ssh -n -o BatchMode=yes -o ConnectTimeout=6 lpi4a true" >/dev/null 2>&1 && ovh_ok=true
ssh "${O[@]}" "$OU@$OVH_HOST" "ssh -n -o BatchMode=yes -o ConnectTimeout=8 lpi4a-hetzner true" >/dev/null 2>&1 && hetz_ok=true

DETAILS="$(cat /tmp/lpi-do-pi.txt)" DO_OK="$do_ok" OVH_OK="$ovh_ok" HETZ_OK="$hetz_ok" DO_USER="$DU" python3 - <<'PY' > "$RESULT"
import datetime,json,os
kv={}
for line in os.environ.get('DETAILS','').splitlines():
    if '=' in line:
        k,v=line.split('=',1); kv[k]=v
print(json.dumps({
 'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'ok':all(os.environ.get(k)=='true' for k in ['DO_OK','OVH_OK','HETZ_OK']),
 'ovh':os.environ.get('OVH_OK')=='true',
 'hetzner':os.environ.get('HETZ_OK')=='true',
 'digitalOcean':os.environ.get('DO_OK')=='true',
 'digitalOceanUser':os.environ.get('DO_USER',''),
 'piService':kv
},indent=2))
PY
cat "$RESULT"

if [ -n "${GITHUB_TOKEN:-}" ]; then
  content="$(base64 -w0 "$RESULT")"
  url="https://api.github.com/repos/$GITHUB_REPOSITORY/contents/ops/licheepi-digitalocean-result.json"
  sha="$(curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha", ""))' 2>/dev/null || true)"
  python3 - "$content" "$sha" <<'PY' >/tmp/lpi-do-payload.json
import json,sys
p={'message':'Record LicheePi DigitalOcean recovery route','content':sys.argv[1],'branch':'main'}
if sys.argv[2]: p['sha']=sys.argv[2]
print(json.dumps(p))
PY
  curl -fsS -X PUT -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" --data-binary @/tmp/lpi-do-payload.json >/dev/null
fi

rm -f /tmp/lpi-do-a /tmp/lpi-do-b /tmp/lpi-do-c /tmp/lpi-do-pi.txt /tmp/lpi-do-payload.json
python3 - "$RESULT" <<'PY'
import json,sys
raise SystemExit(0 if json.load(open(sys.argv[1])).get('ok') else 1)
PY
