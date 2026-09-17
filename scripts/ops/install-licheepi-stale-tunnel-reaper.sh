#!/usr/bin/env bash
set -euo pipefail

PORT="${LICHEEPI_REVERSE_PORT:-2223}"
SCRIPT=/usr/local/sbin/3dvr-lpi-stale-tunnel-reaper
SERVICE=/etc/systemd/system/3dvr-lpi-stale-tunnel-reaper.service
TIMER=/etc/systemd/system/3dvr-lpi-stale-tunnel-reaper.timer

[ "$(id -u)" -eq 0 ] || { echo "Run as root (or through sudo)." >&2; exit 1; }

cat > "$SCRIPT" <<'SH'
#!/usr/bin/env bash
set -u
port="${LICHEEPI_REVERSE_PORT:-2223}"
line=$(ss -ltnp "( sport = :$port )" 2>/dev/null | sed -n '2p')
[ -n "$line" ] || exit 0

banner=$(timeout 6 bash -c "exec 3<>/dev/tcp/127.0.0.1/$port; IFS= read -r line <&3; printf '%s' \"\$line\"" 2>/dev/null || true)
case "$banner" in SSH-*) exit 0;; esac

pid=$(printf '%s\n' "$line" | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | head -1)
[ -n "$pid" ] || exit 0
comm=$(ps -p "$pid" -o comm= 2>/dev/null | tr -d ' ')
case "$comm" in
  sshd|sshd-session)
    kill "$pid" || true
    logger -t 3dvr-lpi-reaper "removed stale LicheePi reverse listener pid=$pid port=$port"
    ;;
esac
SH
chmod 0755 "$SCRIPT"

cat > "$SERVICE" <<'UNIT'
[Unit]
Description=3DVR LicheePi stale reverse-tunnel reaper
After=network-online.target ssh.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/3dvr-lpi-stale-tunnel-reaper
UNIT

cat > "$TIMER" <<'UNIT'
[Unit]
Description=Check LicheePi reverse tunnel for stale listeners

[Timer]
OnBootSec=90s
OnUnitActiveSec=60s
AccuracySec=10s
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now 3dvr-lpi-stale-tunnel-reaper.timer >/dev/null
systemctl start 3dvr-lpi-stale-tunnel-reaper.service
printf 'LicheePi stale-tunnel reaper active on port %s\n' "$PORT"
