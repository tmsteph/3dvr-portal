#!/usr/bin/env bash
set -euo pipefail

root="${1:-}"
ref="${2:-}"
sha="${3:-}"
port="${4:-4310}"

if [ -z "$root" ] || [ ! -d "$root/.git" ]; then
  echo "A valid 3DVR repository root is required." >&2
  exit 2
fi
if [ -z "$ref" ] || [ -z "$sha" ]; then
  echo "Usage: start-machine-preview.sh <repo-root> <ref> <sha> [port]" >&2
  exit 2
fi

base="${THREEDVR_MACHINE_PREVIEW_DIR:-$HOME/.cache/3dvr-machine-preview}"
release="$base/release"
bin_dir="$base/bin"
server_session="3dvr-machine-preview-server"
tunnel_session="3dvr-machine-preview-tunnel"

mkdir -p "$base" "$bin_dir"

stop_slot() {
  if command -v tmux >/dev/null 2>&1; then
    tmux kill-session -t "$server_session" 2>/dev/null || true
    tmux kill-session -t "$tunnel_session" 2>/dev/null || true
  fi
  for pid_file in "$base/server.pid" "$base/tunnel.pid"; do
    if [ -f "$pid_file" ]; then
      pid="$(cat "$pid_file" 2>/dev/null || true)"
      if [ -n "$pid" ]; then
        kill "$pid" 2>/dev/null || true
      fi
      rm -f "$pid_file"
    fi
  done
}

stop_slot
rm -rf "$release"
mkdir -p "$release"

# Fetch only the requested ref, then export a clean tracked snapshot. Using
# git archive keeps .git, local .env files, and other server-only state out of
# the public preview tree.
git -C "$root" fetch --force origin "$ref"
git -C "$root" cat-file -e "$sha^{commit}"
git -C "$root" archive "$sha" | tar -x -C "$release"

: > "$base/server.log"
: > "$base/tunnel.log"

cat > "$base/server-run.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd '$release'
exec env HOST=127.0.0.1 PORT='$port' node scripts/dev-server.mjs >>'$base/server.log' 2>&1
EOF
chmod +x "$base/server-run.sh"

start_process() {
  local session="$1"
  local command_file="$2"
  local pid_file="$3"
  if command -v tmux >/dev/null 2>&1; then
    tmux new-session -d -s "$session" "$command_file"
  else
    nohup "$command_file" >/dev/null 2>&1 </dev/null &
    echo $! > "$pid_file"
  fi
}

start_process "$server_session" "$base/server-run.sh" "$base/server.pid"

server_ready=false
for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:$port/" >/dev/null 2>&1; then
    server_ready=true
    break
  fi
  sleep 0.5
done

if [ "$server_ready" != true ]; then
  echo "Preview server did not become ready." >&2
  tail -n 80 "$base/server.log" >&2 || true
  exit 3
fi

cloudflared="$(command -v cloudflared || true)"
if [ -z "$cloudflared" ]; then
  cloudflared="$bin_dir/cloudflared"
  if [ ! -x "$cloudflared" ]; then
    case "$(uname -m)" in
      x86_64|amd64) cf_arch=amd64 ;;
      aarch64|arm64) cf_arch=arm64 ;;
      *) echo "Unsupported architecture for cloudflared: $(uname -m)" >&2; exit 4 ;;
    esac
    url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$cf_arch"
    tmp="$cloudflared.tmp"
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL --retry 3 --connect-timeout 10 "$url" -o "$tmp"
    elif command -v wget >/dev/null 2>&1; then
      wget -qO "$tmp" "$url"
    else
      echo "Neither curl nor wget is available to install cloudflared." >&2
      exit 4
    fi
    chmod +x "$tmp"
    mv "$tmp" "$cloudflared"
  fi
fi

cat > "$base/tunnel-run.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec '$cloudflared' tunnel --no-autoupdate --url 'http://127.0.0.1:$port' >>'$base/tunnel.log' 2>&1
EOF
chmod +x "$base/tunnel-run.sh"
start_process "$tunnel_session" "$base/tunnel-run.sh" "$base/tunnel.pid"

preview_url=""
for _ in $(seq 1 40); do
  preview_url="$(grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' "$base/tunnel.log" | tail -n 1 || true)"
  if [ -n "$preview_url" ]; then
    break
  fi
  sleep 0.5
done

if [ -z "$preview_url" ]; then
  echo "Cloudflare preview tunnel did not publish a URL." >&2
  tail -n 100 "$base/tunnel.log" >&2 || true
  exit 5
fi

cat > "$base/current.env" <<EOF
PREVIEW_URL=$preview_url
PREVIEW_REF=$ref
PREVIEW_SHA=$sha
PREVIEW_PORT=$port
EOF

printf 'PREVIEW_URL=%s\n' "$preview_url"
printf 'PREVIEW_REF=%s\n' "$ref"
printf 'PREVIEW_SHA=%s\n' "$sha"
printf 'PREVIEW_PORT=%s\n' "$port"
printf 'PREVIEW_HOST=%s\n' "$(hostname)"
printf 'LOAD=%s\n' "$(cut -d ' ' -f 1-3 /proc/loadavg 2>/dev/null || true)"
printf 'MEMORY=%s\n' "$(free -h 2>/dev/null | awk '/^Mem:/{print $3 "/" $2}' || true)"