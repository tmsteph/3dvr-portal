#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this installer as root." >&2
  exit 1
fi

REPO_URL="${THREEDVR_PREVIEW_REPO_URL:-https://github.com/tmsteph/3dvr-portal.git}"
PREVIEW_REF="${THREEDVR_PREVIEW_REF:-machine-host/current}"
BASE_DIR="${THREEDVR_PREVIEW_BASE_DIR:-/opt/3dvr-preview}"
SOURCE_DIR="$BASE_DIR/source"
RELEASE_DIR="$BASE_DIR/release"
CURRENT_ENV="$BASE_DIR/current.env"
CONFIG_FILE="/etc/3dvr-preview.conf"
REFRESH_BIN="/usr/local/bin/3dvr-preview-refresh"
SERVICE_FILE="/etc/systemd/system/3dvr-preview.service"
REFRESH_SERVICE_FILE="/etc/systemd/system/3dvr-preview-refresh.service"
TIMER_FILE="/etc/systemd/system/3dvr-preview-refresh.timer"
CADDY_FILE="${THREEDVR_CADDY_FILE:-/etc/caddy/Caddyfile}"
PUBLIC_HOST="${THREEDVR_PREVIEW_PUBLIC_HOST:-preview.167.172.193.194.nip.io}"
PORT="${THREEDVR_PREVIEW_PORT:-4310}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

for command in git node systemctl curl tar awk sed grep; do
  need "$command"
done
need caddy

NODE_BIN="$(command -v node)"
CADDY_BIN="$(command -v caddy)"
mkdir -p "$BASE_DIR"

if [ ! -d "$SOURCE_DIR/.git" ]; then
  rm -rf "$SOURCE_DIR"
  git clone --filter=blob:none "$REPO_URL" "$SOURCE_DIR"
else
  git -C "$SOURCE_DIR" remote set-url origin "$REPO_URL"
fi

cat > "$CONFIG_FILE" <<EOF
REPO_URL=$REPO_URL
PREVIEW_REF=$PREVIEW_REF
BASE_DIR=$BASE_DIR
SOURCE_DIR=$SOURCE_DIR
RELEASE_DIR=$RELEASE_DIR
CURRENT_ENV=$CURRENT_ENV
PORT=$PORT
EOF
chmod 644 "$CONFIG_FILE"

cat > "$REFRESH_BIN" <<'REFRESH'
#!/usr/bin/env bash
set -euo pipefail
source /etc/3dvr-preview.conf

remote_sha="$(git ls-remote "$REPO_URL" "refs/heads/$PREVIEW_REF" | awk 'NR==1{print $1}')"
if [ -z "$remote_sha" ]; then
  echo "Preview ref not found: $PREVIEW_REF" >&2
  exit 1
fi

current_sha=''
if [ -f "$CURRENT_ENV" ]; then
  current_sha="$(sed -n 's/^PREVIEW_SHA=//p' "$CURRENT_ENV" | head -n1)"
fi

if [ "$remote_sha" = "$current_sha" ] && curl -fsS --connect-timeout 2 "http://127.0.0.1:$PORT/__3dvr-preview" >/dev/null 2>&1; then
  echo "Preview already current: $remote_sha"
  exit 0
fi

git -C "$SOURCE_DIR" fetch --quiet --force origin "refs/heads/$PREVIEW_REF:refs/remotes/origin/$PREVIEW_REF"
git -C "$SOURCE_DIR" cat-file -e "$remote_sha^{commit}"
git -C "$SOURCE_DIR" checkout --quiet --detach "$remote_sha"
git -C "$SOURCE_DIR" reset --hard --quiet "$remote_sha"

tmp_release="$BASE_DIR/release.$remote_sha.tmp"
old_release="$BASE_DIR/release.old"
rm -rf "$tmp_release" "$old_release"
mkdir -p "$tmp_release"
git -C "$SOURCE_DIR" archive "$remote_sha" | tar -x -C "$tmp_release"

if [ -d "$RELEASE_DIR" ]; then
  mv "$RELEASE_DIR" "$old_release"
fi
mv "$tmp_release" "$RELEASE_DIR"
rm -rf "$old_release"

cat > "$CURRENT_ENV" <<EOF
PREVIEW_SHA=$remote_sha
PREVIEW_REF=$PREVIEW_REF
EOF
chmod 644 "$CURRENT_ENV"

systemctl restart 3dvr-preview.service

ready=false
for _ in $(seq 1 20); do
  if curl -fsS --connect-timeout 2 "http://127.0.0.1:$PORT/__3dvr-preview" | grep -Fq "$remote_sha"; then
    ready=true
    break
  fi
  sleep 0.5
done

if [ "$ready" != true ]; then
  echo "Preview service failed health verification for $remote_sha" >&2
  journalctl -u 3dvr-preview.service -n 60 --no-pager >&2 || true
  exit 1
fi

echo "Preview updated: $PREVIEW_REF -> $remote_sha"
REFRESH
chmod 755 "$REFRESH_BIN"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=3DVR low-load machine preview
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=$CONFIG_FILE
EnvironmentFile=-$CURRENT_ENV
Environment=HOST=127.0.0.1
Environment=PORT=$PORT
Environment=PREVIEW_ROOT=$RELEASE_DIR
Environment=PREVIEW_PRODUCTION_ORIGIN=https://portal.3dvr.tech
Environment=NODE_OPTIONS=--max-old-space-size=96
WorkingDirectory=$SOURCE_DIR
ExecStart=$NODE_BIN $SOURCE_DIR/scripts/preview-server.mjs
Restart=on-failure
RestartSec=2
Nice=10
MemoryMax=128M
CPUQuota=25%
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

cat > "$REFRESH_SERVICE_FILE" <<EOF
[Unit]
Description=Refresh 3DVR machine preview from GitHub
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=$REFRESH_BIN
Nice=12
CPUQuota=20%
EOF

cat > "$TIMER_FILE" <<'EOF'
[Unit]
Description=Check 3DVR machine preview branch

[Timer]
OnBootSec=20s
OnUnitActiveSec=60s
RandomizedDelaySec=5s
Persistent=true
Unit=3dvr-preview-refresh.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable 3dvr-preview.service >/dev/null
systemctl enable --now 3dvr-preview-refresh.timer >/dev/null
systemctl start 3dvr-preview-refresh.service

marker_start='# 3DVR MACHINE PREVIEW START'
marker_end='# 3DVR MACHINE PREVIEW END'
if ! grep -Fq "$marker_start" "$CADDY_FILE"; then
  cp "$CADDY_FILE" "$CADDY_FILE.3dvr-preview.bak"
  cat >> "$CADDY_FILE" <<EOF

$marker_start
$PUBLIC_HOST {
  encode zstd gzip
  reverse_proxy 127.0.0.1:$PORT
}
$marker_end
EOF
  if ! "$CADDY_BIN" validate --config "$CADDY_FILE"; then
    cp "$CADDY_FILE.3dvr-preview.bak" "$CADDY_FILE"
    echo "Caddy validation failed; restored the previous configuration." >&2
    exit 1
  fi
  systemctl reload caddy
fi

local_sha="$(sed -n 's/^PREVIEW_SHA=//p' "$CURRENT_ENV" | head -n1)"
for _ in $(seq 1 15); do
  if curl -fsS --connect-timeout 4 --max-time 8 "https://$PUBLIC_HOST/__3dvr-preview" | grep -Fq "$local_sha"; then
    echo "PREVIEW_URL=https://$PUBLIC_HOST"
    echo "PREVIEW_SHA=$local_sha"
    echo "PREVIEW_REF=$PREVIEW_REF"
    exit 0
  fi
  sleep 2
done

echo "Preview is healthy locally at http://127.0.0.1:$PORT but public HTTPS is not ready yet." >&2
echo "Expected public URL: https://$PUBLIC_HOST" >&2
exit 2
