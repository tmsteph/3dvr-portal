#!/usr/bin/env bash
set -euo pipefail

OVH_HOST="${OVH_HOST:-40.160.137.41}"
HETZNER_HOST="${HETZNER_HOST:-167.233.174.20}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-tmsteph/3dvr-portal}"
RESULT=/tmp/licheepi-dual-rendezvous-result.json

write_key() {
  local raw="$1" dest="$2"
  [ -n "$raw" ] || return 0
  printf '%s\n' "$raw" > "$dest.raw"
  if grep -q 'BEGIN .*PRIVATE KEY' "$dest.raw"; then
    cp "$dest.raw" "$dest"
  elif base64 -d "$dest.raw" > "$dest" 2>/dev/null && grep -q 'BEGIN .*PRIVATE KEY' "$dest"; then
    :
  else
    rm -f "$dest" "$dest.raw"
    return 0
  fi
  chmod 600 "$dest"
  rm -f "$dest.raw"
}

for pair in "${SSH_A:-}:/tmp/lpi-dual-a" "${SSH_B:-}:/tmp/lpi-dual-b" "${SSH_C:-}:/tmp/lpi-dual-c"; do
  write_key "${pair%%:*}" "${pair#*:}"
done

pick_connection() {
  local host="$1"; shift
  local user key
  for user in "$@"; do
    for key in /tmp/lpi-dual-a /tmp/lpi-dual-b /tmp/lpi-dual-c; do
      [ -f "$key" ] || continue
      if ssh -i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$user@$host" true >/dev/null 2>&1; then
        printf '%s|%s\n' "$user" "$key"
        return 0
      fi
    done
  done
  return 1
}

ovh="$(pick_connection "$OVH_HOST" debian root)" || { echo '{"ok":false,"note":"Cannot reach OVH"}' > "$RESULT"; exit 1; }
hetz="$(pick_connection "$HETZNER_HOST" root debian ubuntu tmsteph)" || { echo '{"ok":false,"note":"Cannot reach Hetzner"}' > "$RESULT"; exit 1; }
OVH_USER="${ovh%%|*}"; OVH_KEY="${ovh#*|}"
HETZ_USER="${hetz%%|*}"; HETZ_KEY="${hetz#*|}"
O=(-i "$OVH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)
H=(-i "$HETZ_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6)

# Never proceed unless the known-good primary path is healthy.
ssh "${O[@]}" "$OVH_USER@$OVH_HOST" "ssh -o BatchMode=yes -o ConnectTimeout=6 lpi4a true"

# Get the Pi tunnel public key through the primary path without exposing private material.
PI_PUB="$(ssh "${O[@]}" "$OVH_USER@$OVH_HOST" "ssh -o BatchMode=yes -o ConnectTimeout=6 lpi4a 'test -s ~/.ssh/3dvr_tunnel_ed25519.pub && cat ~/.ssh/3dvr_tunnel_ed25519.pub || ssh-keygen -y -f ~/.ssh/3dvr_tunnel_ed25519'")"
case "$PI_PUB" in ssh-ed25519\ *|ssh-rsa\ *|ecdsa-sha2-*\ *) ;; *) echo '{"ok":false,"note":"Could not derive LicheePi tunnel public key"}' > "$RESULT"; exit 1;; esac

# Authorize the Pi to establish its independent outbound tunnel to Hetzner.
printf -v PI_PUB_Q '%q' "$PI_PUB"
ssh "${H[@]}" "$HETZ_USER@$HETZNER_HOST" "umask 077; mkdir -p ~/.ssh; touch ~/.ssh/authorized_keys; chmod 700 ~/.ssh; chmod 600 ~/.ssh/authorized_keys; grep -qxF $PI_PUB_Q ~/.ssh/authorized_keys || printf '%s\\n' $PI_PUB_Q >> ~/.ssh/authorized_keys"

# Get Hetzner's mesh public key so Hetzner itself can authenticate back through the reverse tunnel.
HETZ_MESH_PUB="$(ssh "${H[@]}" "$HETZ_USER@$HETZNER_HOST" "umask 077; mkdir -p ~/.ssh; test -s ~/.ssh/id_ed25519_3dvr_mesh || ssh-keygen -q -t ed25519 -N '' -C 3dvr-mesh-hetzner -f ~/.ssh/id_ed25519_3dvr_mesh; cat ~/.ssh/id_ed25519_3dvr_mesh.pub")"
printf -v HETZ_MESH_PUB_Q '%q' "$HETZ_MESH_PUB"

# Configure the Pi through OVH. Everything below is additive; the primary 2223 service is untouched.
PI_SCRIPT=$(cat <<'PI'
set -euo pipefail
OVH_HOST="$1"
HETZNER_HOST="$2"
HETZ_USER="$3"
HETZ_MESH_PUB="$4"
KEY="$HOME/.ssh/3dvr_tunnel_ed25519"
[ -s "$KEY" ]
sudo -n true
mkdir -p "$HOME/.ssh" "$HOME/.local/bin"
chmod 700 "$HOME/.ssh"
touch "$HOME/.ssh/authorized_keys"
chmod 600 "$HOME/.ssh/authorized_keys"
grep -qxF "$HETZ_MESH_PUB" "$HOME/.ssh/authorized_keys" || printf '%s\n' "$HETZ_MESH_PUB" >> "$HOME/.ssh/authorized_keys"

# Ensure local SSH itself is always available.
if sudo systemctl cat ssh >/dev/null 2>&1; then sudo systemctl enable --now ssh >/dev/null
elif sudo systemctl cat sshd >/dev/null 2>&1; then sudo systemctl enable --now sshd >/dev/null
fi

cat > "$HOME/.local/bin/3dvr-lpi-hetzner-tunnel" <<EOF
#!/usr/bin/env bash
exec /usr/bin/ssh -NT -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=8 -o ServerAliveInterval=15 -o ServerAliveCountMax=2 -o ExitOnForwardFailure=yes -R 127.0.0.1:2223:localhost:22 $HETZ_USER@$HETZNER_HOST
EOF
chmod 700 "$HOME/.local/bin/3dvr-lpi-hetzner-tunnel"

sudo tee /etc/systemd/system/3dvr-lpi-hetzner.service >/dev/null <<EOF
[Unit]
Description=3DVR LicheePi reverse SSH recovery tunnel to Hetzner
Wants=network-online.target
After=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
User=$(id -un)
Environment=HOME=$HOME
ExecStart=$HOME/.local/bin/3dvr-lpi-hetzner-tunnel
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now 3dvr-lpi-hetzner.service >/dev/null

# Keep the conservative network self-heal from the primary hardening pass.
if [ -f /etc/systemd/system/3dvr-lpi-network-heal.timer ]; then
  sudo systemctl enable --now 3dvr-lpi-network-heal.timer >/dev/null || true
fi

primary_pid="$(pgrep -f '/usr/bin/ssh .*2223:localhost:22 debian@40.160.137.41' | head -n1 || true)"
primary_unit=''
if [ -n "$primary_pid" ] && [ -r "/proc/$primary_pid/cgroup" ]; then
  primary_unit="$(awk -F/ '{for(i=NF;i>=1;i--) if($i ~ /\.service$/){print $i; exit}}' "/proc/$primary_pid/cgroup")"
fi
printf 'PRIMARY_PID=%s\n' "$primary_pid"
printf 'PRIMARY_UNIT=%s\n' "$primary_unit"
printf 'PRIMARY_UNIT_ENABLED=%s\n' "$([ -n "$primary_unit" ] && systemctl is-enabled "$primary_unit" 2>/dev/null || true)"
printf 'SSH_ACTIVE=%s\n' "$(systemctl is-active ssh 2>/dev/null || systemctl is-active sshd 2>/dev/null || true)"
printf 'NETWORK_HEAL=%s\n' "$(systemctl is-enabled 3dvr-lpi-network-heal.timer 2>/dev/null || true)"
printf 'HETZNER_SERVICE=%s\n' "$(systemctl is-active 3dvr-lpi-hetzner.service 2>/dev/null || true)"
printf 'HETZNER_ENABLED=%s\n' "$(systemctl is-enabled 3dvr-lpi-hetzner.service 2>/dev/null || true)"
printf 'IPS=%s\n' "$(hostname -I 2>/dev/null || true)"
PI
)
PI_B64="$(printf '%s' "$PI_SCRIPT" | base64 -w0)"
HETZ_PUB_B64="$(printf '%s' "$HETZ_MESH_PUB" | base64 -w0)"
ssh "${O[@]}" "$OVH_USER@$OVH_HOST" "printf '%s' '$PI_B64' | base64 -d | ssh -o BatchMode=yes -o ConnectTimeout=8 lpi4a 'bash -s -- $OVH_HOST $HETZNER_HOST $HETZ_USER \"\$(printf %s '$HETZ_PUB_B64' | base64 -d)\"'" > /tmp/lpi-dual-pi.txt

# Configure a stable Hetzner-side alias to the reverse tunnel.
ssh "${H[@]}" "$HETZ_USER@$HETZNER_HOST" 'bash -s' <<'HETZ'
set -euo pipefail
cfg="$HOME/.ssh/config"; mkdir -p "$HOME/.ssh"; touch "$cfg"; chmod 700 "$HOME/.ssh"; chmod 600 "$cfg"
tmp="$(mktemp)"; sed '/^# BEGIN 3DVR LPI4A HETZNER$/,/^# END 3DVR LPI4A HETZNER$/d' "$cfg" > "$tmp"
cat >> "$tmp" <<'CFG'
# BEGIN 3DVR LPI4A HETZNER
Host lpi4a-hetzner
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
# END 3DVR LPI4A HETZNER
CFG
mv "$tmp" "$cfg"; chmod 600 "$cfg"
HETZ

# Verify both clouds independently.
ovh_ok=false
hetz_ok=false
ssh "${O[@]}" "$OVH_USER@$OVH_HOST" "ssh -o BatchMode=yes -o ConnectTimeout=6 lpi4a true" >/dev/null 2>&1 && ovh_ok=true
for _ in 1 2 3 4 5 6; do
  if ssh "${H[@]}" "$HETZ_USER@$HETZNER_HOST" "ssh -o BatchMode=yes -o ConnectTimeout=6 lpi4a-hetzner true" >/dev/null 2>&1; then hetz_ok=true; break; fi
  sleep 3
done

DETAILS="$(cat /tmp/lpi-dual-pi.txt)" OVH_OK="$ovh_ok" HETZ_OK="$hetz_ok" HETZ_USER="$HETZ_USER" python3 - <<'PY' > "$RESULT"
import datetime,json,os
kv={}
for line in os.environ.get('DETAILS','').splitlines():
    if '=' in line:
        k,v=line.split('=',1); kv[k]=v
print(json.dumps({
  'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
  'ok':os.environ.get('OVH_OK')=='true' and os.environ.get('HETZ_OK')=='true',
  'ovhPrimary':os.environ.get('OVH_OK')=='true',
  'hetznerFallback':os.environ.get('HETZ_OK')=='true',
  'hetznerUser':os.environ.get('HETZ_USER',''),
  'pi':kv
},indent=2))
PY
cat "$RESULT"

if [ -n "${GITHUB_TOKEN:-}" ]; then
  content="$(base64 -w0 "$RESULT")"
  url="https://api.github.com/repos/$GITHUB_REPOSITORY/contents/ops/licheepi-dual-rendezvous-result.json"
  sha="$(curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("sha", ""))' 2>/dev/null || true)"
  python3 - "$content" "$sha" <<'PY' >/tmp/lpi-dual-payload.json
import json,sys
p={'message':'Record LicheePi dual-cloud recovery result','content':sys.argv[1],'branch':'main'}
if sys.argv[2]: p['sha']=sys.argv[2]
print(json.dumps(p))
PY
  curl -fsS -X PUT -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' "$url" --data-binary @/tmp/lpi-dual-payload.json >/dev/null
fi

rm -f /tmp/lpi-dual-a /tmp/lpi-dual-b /tmp/lpi-dual-c /tmp/lpi-dual-pi.txt /tmp/lpi-dual-payload.json
