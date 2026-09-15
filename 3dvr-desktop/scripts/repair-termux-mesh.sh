#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
trap 'rc=$?; echo "Repair failed at line $LINENO (exit $rc)"; exit $rc' ERR

NAME=${1:-termux-phone}
PORT=${2:-22106}
OVH_ALIAS=${THREEDVR_OVH_ALIAS:-3dvr-ovh}
LOCAL_PORT=${THREEDVR_DEVICE_SSH_PORT:-8022}
LOCAL_USER=$(id -un)
STATE="$HOME/.3dvr"
BIN="$STATE/bin"
LOG="$HOME/.local/state/3dvr-desktop"
TUNNEL="$BIN/mesh-tunnel-$NAME"

mkdir -p "$HOME/.ssh" "$BIN" "$LOG"
chmod 700 "$HOME/.ssh" "$BIN"

echo '[1/5] Starting Termux SSH...'
command -v sshd >/dev/null 2>&1 || { echo 'OpenSSH is missing.' >&2; exit 2; }
pgrep -x sshd >/dev/null 2>&1 || sshd

echo '[2/5] Checking OVH trust...'
ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=8 "$OVH_ALIAS" true

echo '[3/5] Authorizing OVH mesh key on phone...'
ovh_pub=$(ssh -o BatchMode=yes "$OVH_ALIAS" 'cat ~/.ssh/id_ed25519_3dvr_mesh.pub')
touch "$HOME/.ssh/authorized_keys"
chmod 600 "$HOME/.ssh/authorized_keys"
grep -qxF "$ovh_pub" "$HOME/.ssh/authorized_keys" || printf '%s\n' "$ovh_pub" >> "$HOME/.ssh/authorized_keys"

echo '[4/5] Registering phone alias on OVH...'
ssh -o BatchMode=yes "$OVH_ALIAS" bash -s -- "$NAME" "$PORT" "$LOCAL_USER" <<'REMOTE'
set -euo pipefail
name=$1; port=$2; user=$3; alias="3dvr-$name"
cfg="$HOME/.ssh/config"
mkdir -p "$HOME/.ssh"; touch "$cfg"; chmod 700 "$HOME/.ssh"; chmod 600 "$cfg"
tmp=$(mktemp)
sed "/^# BEGIN $alias$/,/^# END $alias$/d" "$cfg" > "$tmp"
cat >> "$tmp" <<CFG
# BEGIN $alias
Host $alias
  HostName 127.0.0.1
  Port $port
  User $user
  IdentityFile ~/.ssh/id_ed25519_3dvr_mesh
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
  ConnectTimeout 6
  ServerAliveInterval 30
  ServerAliveCountMax 3
# END $alias
CFG
mv "$tmp" "$cfg"; chmod 600 "$cfg"
REMOTE

echo '[5/5] Starting reverse tunnel...'
cat > "$TUNNEL" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
exec ssh -N -T -o ExitOnForwardFailure=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=8 -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -R 127.0.0.1:$PORT:127.0.0.1:$LOCAL_PORT $OVH_ALIAS
EOF
chmod 700 "$TUNNEL"
pkill -f "$TUNNEL" >/dev/null 2>&1 || true
nohup "$TUNNEL" >> "$LOG/mesh-$NAME.log" 2>&1 &
sleep 2

if ssh -o BatchMode=yes -o ConnectTimeout=8 "$OVH_ALIAS" "ssh -o BatchMode=yes -o ConnectTimeout=6 3dvr-$NAME true" >/dev/null 2>&1; then
  echo 'Reverse path: healthy'
  echo "Mesh node: 3dvr-$NAME"
  echo "Reverse port: $PORT"
else
  echo 'Reverse path: started; verification pending'
  echo "Tunnel log: $LOG/mesh-$NAME.log"
  exit 3
fi
