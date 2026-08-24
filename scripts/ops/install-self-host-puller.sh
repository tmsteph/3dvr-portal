#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo 'Run this installer as root.' >&2
  exit 1
fi

REPO_URL="${THREEDVR_PORTAL_REPO_URL:-https://github.com/tmsteph/3dvr-portal.git}"
REF="${THREEDVR_PORTAL_REF:-main}"
SOURCE_DIR="${THREEDVR_PORTAL_SOURCE_DIR:-/opt/3dvr-portal-source}"
PORT="${THREEDVR_PORTAL_PORT:-4320}"
CONFIG_FILE=/etc/3dvr-portal-puller.conf
REFRESH_BIN=/usr/local/bin/3dvr-portal-refresh
CRON_BIN=/usr/local/bin/3dvr-portal-cron
REFRESH_SERVICE=/etc/systemd/system/3dvr-portal-refresh.service
REFRESH_TIMER=/etc/systemd/system/3dvr-portal-refresh.timer
PORTAL_ENV="${THREEDVR_CONFIG_DIR:-/root/.3dvr/config}/portal.env"

for command in git node npm curl systemctl tar sed awk; do
  command -v "$command" >/dev/null 2>&1 || { echo "Missing required command: $command" >&2; exit 2; }
done

mkdir -p "$(dirname "$SOURCE_DIR")"
if [ ! -d "$SOURCE_DIR/.git" ]; then
  rm -rf "$SOURCE_DIR"
  git clone --filter=blob:none "$REPO_URL" "$SOURCE_DIR"
else
  git -C "$SOURCE_DIR" remote set-url origin "$REPO_URL"
fi

git -C "$SOURCE_DIR" fetch --quiet --force origin "$REF"

cat > "$CONFIG_FILE" <<EOF_CONFIG
REPO_URL=$REPO_URL
REF=$REF
SOURCE_DIR=$SOURCE_DIR
PORT=$PORT
PORTAL_ENV=$PORTAL_ENV
EOF_CONFIG
chmod 644 "$CONFIG_FILE"

cat > "$REFRESH_BIN" <<'EOF_REFRESH'
#!/usr/bin/env bash
set -euo pipefail
source /etc/3dvr-portal-puller.conf
remote_sha="$(git ls-remote "$REPO_URL" "refs/heads/$REF" | awk 'NR==1{print $1}')"
[ -n "$remote_sha" ] || { echo "Unable to resolve $REF from $REPO_URL" >&2; exit 1; }
current_sha=''
if [ -f "$PORTAL_ENV" ]; then
  current_sha="$(sed -n 's/^PORTAL_RELEASE_SHA=//p' "$PORTAL_ENV" | tail -n1)"
fi
if [ "$remote_sha" = "$current_sha" ]; then
  if curl -fsS --connect-timeout 2 --max-time 5 "http://127.0.0.1:$PORT/__3dvr-health" >/dev/null 2>&1; then
    echo "Portal already current: $remote_sha"
    exit 0
  fi
fi

git -C "$SOURCE_DIR" fetch --quiet --force origin "$REF"
git -C "$SOURCE_DIR" checkout --quiet --detach "$remote_sha"
bash "$SOURCE_DIR/scripts/ops/deploy-self-host-portal.sh" "$SOURCE_DIR" "$REF" "$remote_sha" "$PORT"
echo "Portal refreshed: $REF -> $remote_sha"
EOF_REFRESH
chmod 755 "$REFRESH_BIN"

cat > "$CRON_BIN" <<'EOF_CRON'
#!/usr/bin/env bash
set -euo pipefail
route="${1:-}"
enabled_key="${2:-}"
secret_key="${3:-CRON_SECRET}"
[ -n "$route" ] && [ -n "$enabled_key" ] || { echo 'Usage: 3dvr-portal-cron <route> <enabled-env-key> [secret-env-key]' >&2; exit 2; }
source /etc/3dvr-portal-puller.conf
[ -f "$PORTAL_ENV" ] || exit 0
set -a
. "$PORTAL_ENV"
set +a
enabled="${!enabled_key:-false}"
case "${enabled,,}" in 1|true|yes|on) ;; *) exit 0 ;; esac
secret="${CRON_SECRET:-}"
if [ -z "$secret" ]; then secret="${!secret_key:-}"; fi
[ -n "$secret" ] || { echo "Cron secret is not configured for $route" >&2; exit 1; }
curl -fsS --retry 2 --connect-timeout 5 --max-time 300 \
  -H "Authorization: Bearer $secret" \
  "http://127.0.0.1:$PORT$route" >/dev/null
EOF_CRON
chmod 755 "$CRON_BIN"

cat > "$REFRESH_SERVICE" <<EOF_SERVICE
[Unit]
Description=Refresh 3DVR Portal from Git
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=$REFRESH_BIN
Nice=10
EOF_SERVICE

cat > "$REFRESH_TIMER" <<'EOF_TIMER'
[Unit]
Description=Check for a new 3DVR Portal release

[Timer]
OnBootSec=20s
OnUnitActiveSec=60s
RandomizedDelaySec=5s
Persistent=true
Unit=3dvr-portal-refresh.service

[Install]
WantedBy=timers.target
EOF_TIMER

cat > /etc/systemd/system/3dvr-growth-homepage.timer <<'EOF_GROWTH_TIMER'
[Unit]
Description=Run 3DVR growth homepage cycle

[Timer]
OnCalendar=*-*-* 02:43:00 UTC
Persistent=true
Unit=3dvr-growth-homepage.service

[Install]
WantedBy=timers.target
EOF_GROWTH_TIMER
cat > /etc/systemd/system/3dvr-growth-homepage.service <<EOF_GROWTH_SERVICE
[Unit]
Description=3DVR growth homepage cron
After=3dvr-portal.service

[Service]
Type=oneshot
ExecStart=$CRON_BIN /api/growth/homepage-hero-cron GROWTH_HOMEPAGE_CRON_ENABLED GROWTH_HOMEPAGE_CRON_SECRET
EOF_GROWTH_SERVICE

cat > /etc/systemd/system/3dvr-money-autopilot.timer <<'EOF_MONEY_TIMER'
[Unit]
Description=Run 3DVR money autopilot cycle

[Timer]
OnCalendar=Mon..Fri *-*-* 16:17:00 UTC
Persistent=true
Unit=3dvr-money-autopilot.service

[Install]
WantedBy=timers.target
EOF_MONEY_TIMER
cat > /etc/systemd/system/3dvr-money-autopilot.service <<EOF_MONEY_SERVICE
[Unit]
Description=3DVR money autopilot cron
After=3dvr-portal.service

[Service]
Type=oneshot
ExecStart=$CRON_BIN /api/money/autopilot-cron MONEY_AUTOPILOT_CRON_ENABLED MONEY_AUTOPILOT_CRON_SECRET
EOF_MONEY_SERVICE

systemctl daemon-reload
systemctl enable --now 3dvr-portal-refresh.timer
systemctl enable --now 3dvr-growth-homepage.timer
systemctl enable --now 3dvr-money-autopilot.timer
systemctl start 3dvr-portal-refresh.service

printf 'SELF_HOST_PULLER=installed\n'
printf 'SELF_HOST_REF=%s\n' "$REF"
printf 'SELF_HOST_SOURCE=%s\n' "$SOURCE_DIR"
printf 'SELF_HOST_PORT=%s\n' "$PORT"
