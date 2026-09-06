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
settings_env="$config_dir/portal-settings.env"
portal_env="$config_dir/portal.env"
secrets_env="$config_dir/portal-secrets.env"

mkdir -p "$releases" "$state" "$config_dir"
chmod 700 "$config_dir" 2>/dev/null || true
if [ -f "$settings_env" ]; then
  set -a
  . "$settings_env"
  set +a
fi
legacy_api_origin="${THREEDVR_LEGACY_API_ORIGIN-https://3dvr-portal.vercel.app}"

if [ ! -d "$release" ]; then
  tmp="$releases/.tmp-$sha-$$"
  rm -rf "$tmp"
  mkdir -p "$tmp"
  git -C "$repo" archive "$sha" | tar -x -C "$tmp"
  npm --prefix "$tmp" ci --omit=dev
  mv "$tmp" "$release"
fi

wait_for_release() {
  local base_url="$1"
  local expected_sha="$2"
  local health
  for _ in $(seq 1 30); do
    health="$(curl -fsS "$base_url/__3dvr-health" 2>/dev/null || true)"
    if printf '%s' "$health" | grep -Fq "\"sha\":\"$expected_sha\""; then
      return 0
    fi
    sleep 1
  done
  return 1
}

validate_workboard() {
  local base_url="$1"
  local html feed
  html="$(curl -fsS --retry 3 --retry-delay 1 "$base_url/workboard/")" || return 1
  [[ "$html" == *'id="page-title"'* && "$html" == *'id="dispatch-form"'* ]] || return 1

  # The Workboard shell is release-critical; its external GitHub feed is not.
  # A temporary GitHub API outage or rate limit should degrade the feed rather
  # than roll back otherwise healthy portal releases.
  if feed="$(curl -fsS --retry 2 --retry-delay 1 "$base_url/api/workboard/github" 2>/dev/null)"; then
    if ! printf '%s' "$feed" | node -e 'let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s); if(!p.ok||!Array.isArray(p.items)) throw new Error("invalid Workboard GitHub feed");})' 2>/dev/null; then
      echo 'Workboard GitHub feed returned an invalid payload during deploy validation; continuing because the Workboard shell is healthy.' >&2
    fi
  else
    echo 'Workboard GitHub feed unavailable during deploy validation; continuing because the Workboard shell is healthy.' >&2
  fi
  return 0
}

candidate_port="${THREEDVR_PORTAL_CANDIDATE_PORT:-$((port + 1000))}"
if ! [[ "$candidate_port" =~ ^[0-9]+$ ]] || [ "$candidate_port" -lt 1 ] || [ "$candidate_port" -gt 65535 ] || [ "$candidate_port" -eq "$port" ]; then
  echo "Invalid candidate port: $candidate_port" >&2
  exit 2
fi
candidate_log="$state/candidate-$sha.log"
candidate_pid=''

cleanup_candidate() {
  if [ -n "$candidate_pid" ]; then
    kill "$candidate_pid" 2>/dev/null || true
    wait "$candidate_pid" 2>/dev/null || true
    candidate_pid=''
  fi
}
trap cleanup_candidate EXIT

(
  set -a
  [ -f "$common_env" ] && . "$common_env"
  [ -f "$portal_env" ] && . "$portal_env"
  [ -f "$secrets_env" ] && . "$secrets_env"
  set +a
  export PORT="$candidate_port"
  export HOST=127.0.0.1
  export PORTAL_ROOT="$release"
  export PORTAL_RELEASE_REF="$ref"
  export PORTAL_RELEASE_SHA="$sha"
  export LEGACY_API_ORIGIN="$legacy_api_origin"
  cd "$release"
  exec node scripts/self-host-server.mjs
) >"$candidate_log" 2>&1 &
candidate_pid=$!

candidate_url="http://127.0.0.1:$candidate_port"
if ! wait_for_release "$candidate_url" "$sha"; then
  echo 'Candidate 3DVR portal release did not become healthy.' >&2
  tail -n 100 "$candidate_log" >&2 2>/dev/null || true
  exit 4
fi
if ! validate_workboard "$candidate_url"; then
  echo 'Candidate 3DVR portal release failed Workboard validation.' >&2
  tail -n 100 "$candidate_log" >&2 2>/dev/null || true
  exit 4
fi
cleanup_candidate
trap - EXIT

previous_release="$(readlink -f "$current" 2>/dev/null || true)"
previous_env="$state/portal.env.before-$sha-$$"
had_previous_env=false
if [ -f "$portal_env" ]; then
  cp "$portal_env" "$previous_env"
  chmod 600 "$previous_env"
  had_previous_env=true
fi

ln -sfn "$release" "$current"

cat > "$portal_env.tmp" <<EOF
PORT=$port
HOST=127.0.0.1
PORTAL_ROOT=$current
PORTAL_RELEASE_REF=$ref
PORTAL_RELEASE_SHA=$sha
LEGACY_API_ORIGIN=$legacy_api_origin
EOF

# Secrets live in their own root-readable file so adding a new API dependency does
# not require editing this deploy script or duplicating secret values into portal.env.
touch "$secrets_env"
chmod 600 "$secrets_env"
mv "$portal_env.tmp" "$portal_env"
chmod 600 "$portal_env"

start_with_systemd() {
  [ "$(id -u)" = 0 ] || return 1
  command -v systemctl >/dev/null 2>&1 || return 1
  cat > /etc/systemd/system/3dvr-portal.service <<EOF
[Unit]
Description=3DVR self-hosted portal
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$current
EnvironmentFile=-$common_env
EnvironmentFile=-$secrets_env
EnvironmentFile=$portal_env
ExecStart=/usr/bin/env node $current/scripts/self-host-server.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
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
  printf -v secrets_env_q '%q' "$secrets_env"
  printf -v log_q '%q' "$log"
  command="set -a; [ -f $common_env_q ] && . $common_env_q; [ -f $secrets_env_q ] && . $secrets_env_q; . $portal_env_q; set +a; cd $current_q; exec node scripts/self-host-server.mjs >>$log_q 2>&1"
  tmux new-session -d -s "$session" "$command"
}

live_backend=''

restart_live_service() {
  case "$live_backend" in
    systemd)
      if systemctl restart 3dvr-portal.service; then
        return 0
      fi
      if command -v tmux >/dev/null 2>&1; then
        start_with_tmux
        live_backend=tmux
        return 0
      fi
      return 1
      ;;
    tmux)
      start_with_tmux
      ;;
    *)
      return 1
      ;;
  esac
}

rollback_live() {
  echo 'Rolling back the failed 3DVR portal release.' >&2
  set +e
  if [ -n "$previous_release" ] && [ -d "$previous_release" ]; then
    ln -sfn "$previous_release" "$current"
    if [ "$had_previous_env" = true ]; then
      cp "$previous_env" "$portal_env"
      chmod 600 "$portal_env"
    else
      rm -f "$portal_env"
    fi
    restart_live_service
  else
    if [ "$(id -u)" = 0 ] && command -v systemctl >/dev/null 2>&1; then
      systemctl stop 3dvr-portal.service
    fi
    if command -v tmux >/dev/null 2>&1; then
      tmux kill-session -t 3dvr-portal-production 2>/dev/null
    fi
  fi
  set -e
}

if start_with_systemd; then
  live_backend=systemd
else
  start_with_tmux
  live_backend=tmux
fi

live_url="http://127.0.0.1:$port"
if ! wait_for_release "$live_url" "$sha"; then
  echo '3DVR portal service did not become healthy.' >&2
  systemctl status 3dvr-portal.service --no-pager 2>/dev/null || true
  [ -f "$state/server.log" ] && tail -n 100 "$state/server.log" >&2 || true
  rollback_live
  rm -f "$previous_env"
  exit 4
fi

if ! validate_workboard "$live_url"; then
  echo 'Live 3DVR portal release failed Workboard validation.' >&2
  rollback_live
  rm -f "$previous_env"
  exit 4
fi
rm -f "$previous_env"

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
[ -f "$secrets_env" ] && . "$secrets_env"
. "$portal_env"
set +a

portal_url=''
if [ -n "${THREEDVR_CLOUDFLARE_TUNNEL_TOKEN:-}" ] && [ "$(id -u)" = 0 ] && command -v systemctl >/dev/null 2>&1; then
  cat > /etc/systemd/system/3dvr-portal-tunnel.service <<EOF
[Unit]
Description=3DVR portal Cloudflare tunnel
After=3dvr-portal.service
Requires=3dvr-portal.service

[Service]
Type=simple
EnvironmentFile=-$secrets_env
EnvironmentFile=$portal_env
ExecStart=/bin/sh -lc 'exec $cloudflared tunnel --no-autoupdate run --token "\$THREEDVR_CLOUDFLARE_TUNNEL_TOKEN"'
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
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
