#!/usr/bin/env bash
set -euo pipefail

[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo "root required" >&2; exit 77; }

install -d -m 0755 /etc/systemd/system/3dvr-production.slice.d
cat >/etc/systemd/system/3dvr-production.slice <<'UNIT'
[Unit]
Description=3DVR protected production slice

[Slice]
CPUWeight=1000
IOWeight=1000
MemoryLow=1536M
TasksMax=4096
UNIT

protect_service() {
  local service="$1"
  local mem_low="$2"
  local dir="/etc/systemd/system/${service}.d"
  install -d -m 0755 "$dir"
  cat >"$dir/40-3dvr-resilience.conf" <<UNIT
[Service]
Slice=3dvr-production.slice
CPUWeight=1000
IOWeight=1000
MemoryLow=${mem_low}
OOMScoreAdjust=-700
UNIT
}

protect_service 3dvr-portal.service 512M
protect_service 3dvr-secrets-broker.service 128M
protect_service openbao.service 256M
protect_service caddy.service 128M
protect_service 3dvr-human-handoff.service 128M

# Browser lanes already have per-instance MemoryHigh/MemoryMax. Add CPU/IO
# de-prioritization so a busy browser cannot starve the production slice.
install -d -m 0755 /etc/systemd/system/3dvr-browser-lane@.service.d
cat >/etc/systemd/system/3dvr-browser-lane@.service.d/40-3dvr-resilience.conf <<'UNIT'
[Service]
CPUWeight=100
IOWeight=100
CPUQuota=75%
OOMScoreAdjust=500
UNIT

# A safe default launcher for ad-hoc local experiments. The limits live in a
# transient user scope, so experiments can fail without consuming the host.
cat >/usr/local/bin/3dvr-experiment <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -eq 0 ]; then
  echo "usage: 3dvr-experiment <command> [args...]" >&2
  exit 64
fi
exec systemd-run --user --scope --quiet \
  -p CPUQuota=150% \
  -p CPUWeight=50 \
  -p MemoryHigh=1536M \
  -p MemoryMax=2560M \
  -p OOMScoreAdjust=700 \
  -- "$@"
SCRIPT
chmod 0755 /usr/local/bin/3dvr-experiment

cat >/usr/local/sbin/3dvr-production-watchdog <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

state=/run/3dvr-production-watchdog.failures
health=/tmp/3dvr-production-watchdog-health.$$
trap 'rm -f "$health"' EXIT

healthy=false
if curl -fsS --max-time 8 http://127.0.0.1:4320/__3dvr-health >"$health" 2>/dev/null; then
  if /usr/bin/node -e '
    const fs=require("fs");
    const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
    process.exit(x?.ok===true && x?.host==="self" ? 0 : 1);
  ' "$health" >/dev/null 2>&1; then
    healthy=true
  fi
fi

if [ "$healthy" = true ]; then
  rm -f "$state"
  exit 0
fi

failures=0
[ -f "$state" ] && read -r failures <"$state" || true
case "$failures" in ''|*[!0-9]*) failures=0;; esac
failures=$((failures + 1))
printf '%s\n' "$failures" >"$state"
logger -t 3dvr-watchdog "portal health failure #$failures"

# Avoid flapping on a single transient miss.
if [ "$failures" -lt 2 ]; then
  exit 0
fi

logger -t 3dvr-watchdog "restarting 3dvr-portal.service after repeated health failures"
systemctl restart 3dvr-portal.service
sleep 3

if curl -fsS --max-time 8 http://127.0.0.1:4320/__3dvr-health >/dev/null 2>&1; then
  rm -f "$state"
  logger -t 3dvr-watchdog "portal recovered"
  exit 0
fi

logger -t 3dvr-watchdog "portal still unhealthy after restart"
exit 1
SCRIPT
chmod 0755 /usr/local/sbin/3dvr-production-watchdog

cat >/etc/systemd/system/3dvr-production-watchdog.service <<'UNIT'
[Unit]
Description=3DVR production portal health watchdog
After=network-online.target 3dvr-portal.service

[Service]
Type=oneshot
Slice=3dvr-production.slice
CPUWeight=1000
IOWeight=1000
MemoryLow=64M
OOMScoreAdjust=-800
ExecStart=/usr/local/sbin/3dvr-production-watchdog
UNIT

cat >/etc/systemd/system/3dvr-production-watchdog.timer <<'UNIT'
[Unit]
Description=Run 3DVR production watchdog every minute

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
AccuracySec=10s
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload

# Apply the production slice now. Restart only the core services whose brief
# recycle does not break persistent browser sessions.
for service in openbao.service 3dvr-secrets-broker.service 3dvr-portal.service caddy.service 3dvr-human-handoff.service; do
  if systemctl is-active --quiet "$service"; then
    systemctl restart "$service"
  fi
done

# Apply CPU/IO limits to running browser lanes without restarting their sessions.
for lane in general encore messaging training; do
  unit="3dvr-browser-lane@${lane}.service"
  if systemctl is-active --quiet "$unit"; then
    systemctl set-property --runtime "$unit" CPUWeight=100 IOWeight=100 CPUQuota=75% >/dev/null
  fi
done

systemctl enable --now 3dvr-production-watchdog.timer
/usr/local/sbin/3dvr-production-watchdog

echo "3dvr_resilience_installed=true"
systemctl show 3dvr-portal.service -p Slice -p CPUWeight -p IOWeight -p MemoryLow -p OOMScoreAdjust --no-pager
systemctl show 3dvr-browser-lane@messaging.service -p CPUWeight -p CPUQuotaPerSecUSec -p MemoryHigh -p MemoryMax --no-pager 2>/dev/null || true
systemctl is-active 3dvr-production-watchdog.timer
