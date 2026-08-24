#!/usr/bin/env bash
set -euo pipefail

repo="${1:-$HOME/.3dvr/self-host-portal/source}"
port="${2:-4310}"
base="${THREEDVR_SELF_HOST_DIR:-$HOME/.3dvr/self-host-portal}"
public="$base/public"
public_next="$base/public.next"
server_session="3dvr-self-host-portal-server"
sync_session="3dvr-self-host-portal-sync"
tunnel_session="3dvr-self-host-portal-tunnel"
config_file="${THREEDVR_CONFIG_FILE:-$HOME/.3dvr/config/env}"
operator_upstream="${THREEDVR_OPERATOR_UPSTREAM_ORIGIN:-https://3dvr-portal-tmstephs-projects.vercel.app}"

if [ ! -d "$repo/.git" ]; then
  echo "Self-host portal repo not found: $repo" >&2
  exit 2
fi

mkdir -p "$base" "$base/bin" "$(dirname "$config_file")"
touch "$config_file"
chmod 600 "$config_file" || true

set_config() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  awk -F= -v key="$key" -v value="$value" '
    BEGIN { found=0 }
    $1 == key { print key "=" value; found=1; next }
    { print }
    END { if (!found) print key "=" value }
  ' "$config_file" > "$tmp"
  cat "$tmp" > "$config_file"
  rm -f "$tmp"
}

set_config THREEDVR_OPERATOR_PORTAL_REPO "$repo"
set_config THREEDVR_AGENT_PORTAL_REPO "$repo"

sync_once() {
  rm -rf "$public_next"
  mkdir -p "$public_next"
  (
    cd "$repo"
    git ls-files -z --cached --others --exclude-standard \
      | tar --null -T - -cf -
  ) | tar -xf - -C "$public_next"
  rm -rf "$public"
  mv "$public_next" "$public"
}

stop_session() {
  local session="$1"
  if command -v tmux >/dev/null 2>&1; then
    tmux kill-session -t "$session" 2>/dev/null || true
  fi
}

sync_once
stop_session "$server_session"
stop_session "$sync_session"
stop_session "$tunnel_session"

cat > "$base/sync-run.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
repo='$repo'
public='$public'
public_next='$public_next'
while true; do
  rm -rf "\$public_next"
  mkdir -p "\$public_next"
  (cd "\$repo" && git ls-files -z --cached --others --exclude-standard | tar --null -T - -cf -) | tar -xf - -C "\$public_next"
  rm -rf "\$public"
  mv "\$public_next" "\$public"
  sleep 2
done
EOF
chmod +x "$base/sync-run.sh"

sha="$(git -C "$repo" rev-parse HEAD)"
cat > "$base/server-run.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd '$repo'
exec env \
  HOST=127.0.0.1 \
  PORT='$port' \
  PREVIEW_ROOT='$public' \
  PREVIEW_REF='self-host-main' \
  PREVIEW_SHA='$sha' \
  PREVIEW_PRODUCTION_ORIGIN='$operator_upstream' \
  node --max-old-space-size=128 scripts/preview-server.mjs >>'$base/server.log' 2>&1
EOF
chmod +x "$base/server-run.sh"

start_process() {
  local session="$1" script="$2"
  if command -v tmux >/dev/null 2>&1; then
    tmux new-session -d -s "$session" "$script"
  else
    nohup "$script" >/dev/null 2>&1 </dev/null &
    echo $! > "$base/$session.pid"
  fi
}

: > "$base/server.log"
: > "$base/tunnel.log"
start_process "$sync_session" "$base/sync-run.sh"
start_process "$server_session" "$base/server-run.sh"

ready=false
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$port/__3dvr-preview" 2>/dev/null | grep -Fq '"ok":true'; then
    ready=true
    break
  fi
  sleep 0.5
done
if [ "$ready" != true ]; then
  echo "Self-hosted portal server failed to start." >&2
  tail -n 100 "$base/server.log" >&2 || true
  exit 3
fi

# The same machine consumes Portal Forge edits. It receives the repo path above
# through ~/.3dvr/config/env, so approved edits target the live self-host checkout.
agent_scripts="$repo/apps/agent/thomas-agent/scripts"
if [ -x "$agent_scripts/ask-agent-worker-daemon" ]; then
  "$agent_scripts/ask-agent-worker-daemon" stop || true
  "$agent_scripts/ask-agent-worker-daemon" start
  "$agent_scripts/ask-agent-worker-daemon" status
fi

cloudflared="$(command -v cloudflared || true)"
if [ -z "$cloudflared" ]; then
  cloudflared="$base/bin/cloudflared"
  if [ ! -x "$cloudflared" ]; then
    case "$(uname -m)" in
      x86_64|amd64) cf_arch=amd64 ;;
      aarch64|arm64) cf_arch=arm64 ;;
      *) echo "Unsupported architecture for cloudflared: $(uname -m)" >&2; exit 4 ;;
    esac
    curl -fsSL --retry 3 --connect-timeout 10 \
      "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$cf_arch" \
      -o "$cloudflared.tmp"
    chmod +x "$cloudflared.tmp"
    mv "$cloudflared.tmp" "$cloudflared"
  fi
fi

cat > "$base/tunnel-run.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec '$cloudflared' tunnel --no-autoupdate --url 'http://127.0.0.1:$port' >>'$base/tunnel.log' 2>&1
EOF
chmod +x "$base/tunnel-run.sh"
start_process "$tunnel_session" "$base/tunnel-run.sh"

url=''
for _ in $(seq 1 60); do
  url="$(grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' "$base/tunnel.log" | tail -n 1 || true)"
  [ -n "$url" ] && break
  sleep 0.5
done
if [ -z "$url" ]; then
  echo "Self-hosted portal tunnel failed to publish." >&2
  tail -n 100 "$base/tunnel.log" >&2 || true
  exit 5
fi

# Give the Forge worker an immediate pass over anything that was queued while
# the old deployment path was unavailable. The daemon continues polling after this.
(
  set -a
  . "$config_file"
  set +a
  cd "$repo/apps/agent"
  node thomas-agent/node/operator-forge-worker.js run-once --json || true
)

cat > "$base/current.env" <<EOF
SELF_HOST_URL=$url
SELF_HOST_REPO=$repo
SELF_HOST_PORT=$port
SELF_HOST_SHA=$sha
EOF

printf 'SELF_HOST_URL=%s\n' "$url"
printf 'SELF_HOST_REPO=%s\n' "$repo"
printf 'SELF_HOST_PORT=%s\n' "$port"
printf 'SELF_HOST_SHA=%s\n' "$sha"
printf 'SELF_HOST_HOST=%s\n' "$(hostname)"
