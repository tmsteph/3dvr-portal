#!/usr/bin/env bash
set -euo pipefail

portal_base="${THREEDVR_PORTAL_PRODUCTION_DIR:-/opt/3dvr-portal-production}"
portal_port="${THREEDVR_PORTAL_PORT:-4320}"
state="$portal_base/state"
session="3dvr-portal-public-tunnel"
log="$state/public-tunnel.log"
pid_file="$state/public-tunnel.pid"
mkdir -p "$state"

cloudflared="$(command -v cloudflared || true)"
if [ -z "$cloudflared" ]; then
  cloudflared=/usr/local/bin/cloudflared
fi
[ -x "$cloudflared" ] || { echo 'cloudflared is not installed.' >&2; exit 5; }

read_url() {
  grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' "$log" 2>/dev/null | tail -n1 || true
}

is_running() {
  if command -v tmux >/dev/null 2>&1 && tmux has-session -t "$session" 2>/dev/null; then
    return 0
  fi
  if [ -f "$pid_file" ]; then
    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && return 0
  fi
  return 1
}

publish_url() {
  local url="$1"
  printf 'PORTAL_SELF_HOST_URL=%s\n' "$url"
  printf 'PORTAL_ORGANISM_BRIDGE_URL=%s\n' "$url"
}

existing_url="$(read_url)"
if is_running && [ -n "$existing_url" ]; then
  publish_url "$existing_url"
  exit 0
fi

start_tunnel() {
  : > "$log"
  rm -f "$pid_file"
  if command -v tmux >/dev/null 2>&1; then
    tmux kill-session -t "$session" 2>/dev/null || true
    tmux new-session -d -s "$session" "$cloudflared tunnel --no-autoupdate --url http://127.0.0.1:$portal_port >>'$log' 2>&1"
  else
    nohup "$cloudflared" tunnel --no-autoupdate --url "http://127.0.0.1:$portal_port" >>"$log" 2>&1 </dev/null &
    echo $! > "$pid_file"
  fi
}

for delay in 0 15 45 90; do
  [ "$delay" -eq 0 ] || sleep "$delay"
  start_tunnel
  for _ in $(seq 1 40); do
    url="$(read_url)"
    if [ -n "$url" ] && is_running; then
      publish_url "$url"
      exit 0
    fi
    sleep 0.5
  done
  echo "Portal public tunnel attempt did not become ready; retrying with backoff." >&2
  tail -n 12 "$log" >&2 2>/dev/null || true
done

echo 'Portal public tunnel is unavailable after retries.' >&2
exit 5
