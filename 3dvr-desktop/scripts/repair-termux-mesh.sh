#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
trap 'rc=$?; echo "Repair failed at line $LINENO (exit $rc)" >&2; exit $rc' ERR

NAME=${1:-termux-phone}
PORT=${2:-22106}
OVH_ALIAS=${THREEDVR_OVH_ALIAS:-3dvr-ovh}
OVH_HOST=${THREEDVR_OVH_HOST:-40.160.137.41}
OVH_USER=${THREEDVR_OVH_USER:-debian}
LOCAL_PORT=${THREEDVR_DEVICE_SSH_PORT:-8022}
LOCAL_USER=$(id -un)
STATE="$HOME/.3dvr"
BIN="$STATE/bin"
LOG="$HOME/.local/state/3dvr-desktop"
TUNNEL="$BIN/mesh-tunnel-$NAME"
SSH_CFG="$HOME/.ssh/config"

mkdir -p "$HOME/.ssh" "$BIN" "$LOG"
chmod 700 "$HOME/.ssh" "$BIN"
touch "$SSH_CFG"
chmod 600 "$SSH_CFG"

choose_ovh_key() {
  local key
  local -a candidates=()
  [ -z "${THREEDVR_DEVICE_KEY:-}" ] || candidates+=("$THREEDVR_DEVICE_KEY")
  candidates+=(
    "$HOME/.ssh/id_ed25519_3dvr"
    "$HOME/.ssh/id_ed25519_3dvr_mesh"
    "$HOME/.ssh/id_ed25519"
  )

  for key in "${candidates[@]}"; do
    [ -s "$key" ] || continue
    if ssh -i "$key" -o IdentitiesOnly=yes -o BatchMode=yes \
      -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 \
      "$OVH_USER@$OVH_HOST" true >/dev/null 2>&1; then
      printf '%s\n' "$key"
      return 0
    fi
  done
  return 1
}

write_ovh_alias() {
  local key=$1 tmp
  tmp=$(mktemp)
  awk -v alias="$OVH_ALIAS" '
    BEGIN { skip=0 }
    /^[[:space:]]*Host[[:space:]]+/ {
      if (skip) skip=0
      if (NF == 2 && $2 == alias) { skip=1; next }
    }
    !skip { print }
  ' "$SSH_CFG" > "$tmp"
  cat >> "$tmp" <<CFG

Host $OVH_ALIAS
  HostName $OVH_HOST
  User $OVH_USER
  IdentityFile $key
  IdentitiesOnly yes
  BatchMode yes
  StrictHostKeyChecking accept-new
  ConnectTimeout 8
  ServerAliveInterval 30
  ServerAliveCountMax 3
CFG
  mv "$tmp" "$SSH_CFG"
  chmod 600 "$SSH_CFG"
}

echo '[1/6] Starting Termux SSH...'
command -v sshd >/dev/null 2>&1 || { echo 'OpenSSH is missing.' >&2; exit 2; }
pgrep -x sshd >/dev/null 2>&1 || sshd

echo '[2/6] Recovering OVH bootstrap access...'
if ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 "$OVH_ALIAS" true >/dev/null 2>&1; then
  echo "OVH alias already works: $OVH_ALIAS"
else
  OVH_KEY=$(choose_ovh_key) || {
    echo "No approved local SSH key could reach $OVH_USER@$OVH_HOST." >&2
    echo 'Checked the canonical 3DVR device keys; server-side approval may be missing or the local key was renamed.' >&2
    exit 4
  }
  write_ovh_alias "$OVH_KEY"
  ssh -o BatchMode=yes -o ConnectTimeout=8 "$OVH_ALIAS" true
  echo "Recovered OVH alias with $(basename "$OVH_KEY")."
fi

echo '[3/6] Authorizing OVH mesh key on phone...'
ovh_pub=$(ssh -o BatchMode=yes "$OVH_ALIAS" 'cat ~/.ssh/id_ed25519_3dvr_mesh.pub')
touch "$HOME/.ssh/authorized_keys"
chmod 600 "$HOME/.ssh/authorized_keys"
grep -qxF "$ovh_pub" "$HOME/.ssh/authorized_keys" || printf '%s\n' "$ovh_pub" >> "$HOME/.ssh/authorized_keys"

echo '[4/6] Registering phone alias on OVH...'
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

echo '[5/6] Starting reverse tunnel...'
cat > "$TUNNEL" <<EOF_TUNNEL
#!/data/data/com.termux/files/usr/bin/bash
exec ssh -N -T -o ExitOnForwardFailure=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=8 -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -R 127.0.0.1:$PORT:127.0.0.1:$LOCAL_PORT $OVH_ALIAS
EOF_TUNNEL
chmod 700 "$TUNNEL"
pkill -f "$TUNNEL" >/dev/null 2>&1 || true
nohup "$TUNNEL" >> "$LOG/mesh-$NAME.log" 2>&1 &
sleep 2

echo '[6/6] Verifying reverse path...'
if ssh -o BatchMode=yes -o ConnectTimeout=8 "$OVH_ALIAS" "ssh -o BatchMode=yes -o ConnectTimeout=6 3dvr-$NAME true" >/dev/null 2>&1; then
  echo 'Reverse path: healthy'
  echo "Mesh node: 3dvr-$NAME"
  echo "Reverse port: $PORT"
else
  echo 'Reverse path: started; verification pending'
  echo "Tunnel log: $LOG/mesh-$NAME.log"
  exit 3
fi
