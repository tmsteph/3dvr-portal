#!/usr/bin/env bash
set -euo pipefail

repo="${1:-}"
ref="${2:-main}"
sha="${3:-}"
port="${4:-4320}"

if [ -z "$repo" ] || [ ! -d "$repo/.git" ]; then
  echo 'Usage: deploy-self-host-portal.sh <repo-root> [ref] [sha] [port]' >&2
  exit 2
fi

if [ -z "$sha" ]; then
  sha="$(git -C "$repo" rev-parse "$ref")"
fi

git -C "$repo" fetch --force origin "$ref"
git -C "$repo" cat-file -e "$sha^{commit}"

if [ "$(id -u)" = 0 ]; then
  base="${THREEDVR_PORTAL_PRODUCTION_DIR:-/opt/3dvr-portal-production}"
else
  base="${THREEDVR_PORTAL_PRODUCTION_DIR:-$HOME/.3dvr/portal-production}"
fi
releases="$base/releases"
release="$releases/$sha"
current="$base/current"
state="$base/state"
config_dir="${THREEDVR_CONFIG_DIR:-$HOME/.3dvr/config}"
common_env="$config_dir/env"
portal_env="$config_dir/portal.env"

mkdir -p "$releases" "$state" "$config_dir"
chmod 700 "$config_dir" 2>/dev/null || true

if [ ! -d "$release" ]; then
  tmp="$releases/.tmp-$sha-$$"
  rm -rf "$tmp"
  mkdir -p "$tmp"
  git -C "$repo" archive "$sha" | tar -x -C "$tmp"
  npm --prefix "$tmp" ci --omit=dev
  mv "$tmp" "$release"
fi

ln -sfn "$release" "$current"

cat > "$portal_env.tmp" <<EOF_ENV
PORT=$port
HOST=127.0.0.1
PORTAL_ROOT=$current
PORTAL_RELEASE_REF=$ref
PORTAL_RELEASE_SHA=$sha
EOF_ENV

# Preserve runtime configuration without printing secret values. Keys declared
# in .env.example are portable application settings, while the extra OAuth and
# tunnel keys cover integrations that are intentionally not committed there.
declare -A seen_env_keys=()
preserve_env_key() {
  local key="$1" value=''
  [ -n "$key" ] || return 0
  [ -z "${seen_env_keys[$key]:-}" ] || return 0
  seen_env_keys[$key]=1
  case "$key" in
    PORT|HOST|PORTAL_ROOT|PORTAL_RELEASE_REF|PORTAL_RELEASE_SHA) return 0 ;;
  esac
  value="${!key:-}"
  if [ -z "$value" ] && [ -f "$portal_env" ]; then
    value="$(sed -n "s/^${key}=//p" "$portal_env" | tail -n1)"
  fi
  if [ -z "$value" ] && [ -f "$common_env" ]; then
    value="$(sed -n "s/^${key}=//p" "$common_env" | tail -n1)"
  fi
  if [ -n "$value" ]; then
    printf '%s=%s\n' "$key" "$value" >> "$portal_env.tmp"
  fi
}

if [ -f "$release/.env.example" ]; then
  while IFS= read -r key; do
    preserve_env_key "$key"
  done < <(sed -n 's/^\([A-Z][A-Z0-9_]*\)=.*/\1/p' "$release/.env.example")
fi
for key in \
  AI_GATEWAY_API_KEY \
  THREEDVR_CLOUDFLARE_TUNNEL_TOKEN \
  GOOGLE_OAUTH_CLIENT_ID GOOGLE_OAUTH_CLIENT_SECRET \
  MICROSOFT_OAUTH_CLIENT_ID MICROSOFT_OAUTH_CLIENT_SECRET MICROSOFT_OAUTH_TENANT \
  APPLE_OAUTH_CLIENT_ID APPLE_OAUTH_TEAM_ID APPLE_OAUTH_KEY_ID APPLE_OAUTH_PRIVATE_KEY; do
  preserve_env_key "$key"
done

mv "$portal_env.tmp" "$portal_env"
chmod 600 "$portal_env"

start_with_systemd() {
  [ "$(id -u)" = 0 ] || return 1
  command -v systemctl >/dev/null 2>&1 || return 1
  cat > /etc/systemd/system/3dvr-portal.service <<EOF_SERVICE
[Unit]
Description=3DVR self-hosted portal
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$current
EnvironmentFile=-$common_env
EnvironmentFile=$portal_env
ExecStart=/usr/bin/env node $current/scripts/self-host-server.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF_SERVICE
  systemctl daemon-reload
  systemctl enable --now 3dvr-portal.service
  systemctl restart 3dvr-portal.service
}

start_with_tmux() {
  local session=3dvr-portal-production
  local log="$state/server.log"
  command -v tmux >/dev/null 2>&1 || {
    echo 'Neither systemd nor tmux is available for the portal service.' >&2
    exit 3
  }
  tmux kill-session -t "$session" 2>/dev/null || true
  printf -v current_q '%q' "$current"
  printf -v common_env_q '%q' "$common_env"
  printf -v portal_env_q '%q' "$portal_env"
  printf -v log_q '%q' "$log"
  command="set -a; [ -f $common_env_q ] && . $common_env_q; . $portal_env_q; set +a; cd $current_q; exec node scripts/self-host-server.mjs >>$log_q 2>&1"
  tmux new-session -d -s "$session" "$command"
}

if ! start_with_systemd; then
  start_with_tmux
fi

ready=false
for _ in $(seq 1 30); do
  health="$(curl -fsS "http://127.0.0.1:$port/__3dvr-health" 2>/dev/null || true)"
  if printf '%s' "$health" | grep -Fq "\"sha\":\"$sha\""; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != true ]; then
  echo '3DVR portal service did not become healthy.' >&2
  systemctl status 3dvr-portal.service --no-pager 2>/dev/null || true
  [ -f "$state/server.log" ] && tail -n 100 "$state/server.log" >&2 || true
  exit 4
fi

cloudflared="$(command -v cloudflared || true)"
if [ -z "$cloudflared" ]; then
  if [ "$(id -u)" = 0 ]; then cloudflared=/usr/local/bin/cloudflared; else cloudflared="$base/bin/cloudflared"; fi
  mkdir -p "$(dirname "$cloudflared")"
  case "$(uname -m)" in
    x86_64|amd64) cf_arch=amd64 ;;
    aarch64|arm64) cf_arch=arm64 ;;
    *) echo "Unsupported cloudflared architecture: $(uname -m)" >&2; exit 5 ;;
  esac
  curl -fsSL --retry 3 --connect-timeout 10 "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$cf_arch" -o "$cloudflared.tmp"
  chmod +x "$cloudflared.tmp"
  mv "$cloudflared.tmp" "$cloudflared"
fi

set -a
[ -f "$common_env" ] && . "$common_env"
. "$portal_env"
set +a

portal_url=''
if [ -n "${THREEDVR_CLOUDFLARE_TUNNEL_TOKEN:-}" ] && [ "$(id -u)" = 0 ] && command -v systemctl >/dev/null 2>&1; then
  cat > /etc/systemd/system/3dvr-portal-tunnel.service <<EOF_TUNNEL
[Unit]
Description=3DVR portal Cloudflare tunnel
After=3dvr-portal.service
Requires=3dvr-portal.service

[Service]
Type=simple
EnvironmentFile=$portal_env
ExecStart=/bin/sh -lc 'exec $cloudflared tunnel --no-autoupdate run --token "\$THREEDVR_CLOUDFLARE_TUNNEL_TOKEN"'
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF_TUNNEL
  systemctl daemon-reload
  systemctl enable --now 3dvr-portal-tunnel.service
  systemctl restart 3dvr-portal-tunnel.service
  portal_url='named-cloudflare-tunnel'
else
  tunnel_session=3dvr-portal-quick-tunnel
  tunnel_log="$state/tunnel.log"
  : > "$tunnel_log"
  if command -v tmux >/dev/null 2>&1; then
    tmux kill-session -t "$tunnel_session" 2>/dev/null || true
    tmux new-session -d -s "$tunnel_session" "$cloudflared tunnel --no-autoupdate --url http://127.0.0.1:$port >>'$tunnel_log' 2>&1"
  else
    nohup "$cloudflared" tunnel --no-autoupdate --url "http://127.0.0.1:$port" >>"$tunnel_log" 2>&1 </dev/null &
    echo $! > "$state/tunnel.pid"
  fi
  for _ in $(seq 1 40); do
    portal_url="$(grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' "$tunnel_log" | tail -n1 || true)"
    [ -n "$portal_url" ] && break
    sleep 0.5
  done
fi

printf 'PORTAL_SELF_HOST_SHA=%s\n' "$sha"
printf 'PORTAL_SELF_HOST_PORT=%s\n' "$port"
printf 'PORTAL_SELF_HOST_URL=%s\n' "$portal_url"
printf 'PORTAL_SELF_HOST_HEALTH=%s\n' "$(curl -fsS "http://127.0.0.1:$port/__3dvr-health")"
