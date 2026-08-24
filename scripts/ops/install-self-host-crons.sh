#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo 'Run this installer as root.' >&2
  exit 1
fi

PORT="${THREEDVR_PORTAL_PORT:-4320}"
PORTAL_ENV="${THREEDVR_CONFIG_DIR:-/root/.3dvr/config}/portal.env"
CRON_BIN=/usr/local/bin/3dvr-portal-cron

for command in curl systemctl; do
  command -v "$command" >/dev/null 2>&1 || { echo "Missing required command: $command" >&2; exit 2; }
done

cat > "$CRON_BIN" <<'EOF_CRON'
#!/usr/bin/env bash
set -euo pipefail
route="${1:-}"
enabled_key="${2:-}"
secret_key="${3:-CRON_SECRET}"
[ -n "$route" ] && [ -n "$enabled_key" ] || { echo 'Usage: 3dvr-portal-cron <route> <enabled-env-key> [secret-env-key]' >&2; exit 2; }
PORT="${THREEDVR_PORTAL_PORT:-4320}"
PORTAL_ENV="${THREEDVR_PORTAL_ENV:-/root/.3dvr/config/portal.env}"
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
Environment=THREEDVR_PORTAL_PORT=$PORT
Environment=THREEDVR_PORTAL_ENV=$PORTAL_ENV
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
Environment=THREEDVR_PORTAL_PORT=$PORT
Environment=THREEDVR_PORTAL_ENV=$PORTAL_ENV
ExecStart=$CRON_BIN /api/money/autopilot-cron MONEY_AUTOPILOT_CRON_ENABLED MONEY_AUTOPILOT_CRON_SECRET
EOF_MONEY_SERVICE

systemctl daemon-reload
systemctl enable --now 3dvr-growth-homepage.timer
systemctl enable --now 3dvr-money-autopilot.timer

printf 'SELF_HOST_CRONS=installed\n'
printf 'SELF_HOST_PORT=%s\n' "$PORT"
