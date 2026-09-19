#!/usr/bin/env bash
set -euo pipefail

[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo "root required" >&2; exit 77; }

archive="${1:-/tmp/3dvr-portal-standby.tar.gz}"
sha="${2:-unknown}"
ref="${3:-main}"
base=/opt/3dvr-portal-standby
releases="$base/releases"
release="$releases/$sha"
current="$base/current"
port=4322

[ -f "$archive" ] || { echo "archive missing: $archive" >&2; exit 2; }

install -d -m 0755 "$releases"

if [ ! -d "$release" ]; then
  tmp="$releases/.tmp-$sha-$$"
  rm -rf "$tmp"
  install -d -m 0755 "$tmp"
  tar -xzf "$archive" -C "$tmp"

  # Build/install is deliberately bounded so standby preparation cannot starve
  # the worker host.
  systemd-run --scope --quiet \
    -p CPUQuota=100% \
    -p CPUWeight=50 \
    -p MemoryHigh=700M \
    -p MemoryMax=1000M \
    -p MemorySwapMax=512M \
    -- npm --prefix "$tmp" ci --omit=dev

  mv "$tmp" "$release"
fi

ln -sfn "$release" "$current"

cat >/etc/3dvr-portal-standby.env <<EOF
PORT=$port
HOST=127.0.0.1
PORTAL_ROOT=$current
PORTAL_RELEASE_REF=$ref
PORTAL_RELEASE_SHA=$sha
PORTAL_STANDBY=true
LEGACY_API_ORIGIN=
THREEDVR_OUTREACH_SUPPRESSION_ENFORCED=true
THREEDVR_OUTREACH_REQUIRE_PERSONAL_SENT_CHECK=true
EOF
chmod 600 /etc/3dvr-portal-standby.env

cat >/etc/systemd/system/3dvr-portal-standby.service <<'UNIT'
[Unit]
Description=3DVR warm standby portal
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/3dvr-portal-standby.env
WorkingDirectory=/opt/3dvr-portal-standby/current
ExecStart=/usr/bin/env node /opt/3dvr-portal-standby/current/scripts/self-host-server.mjs
Restart=always
RestartSec=3
CPUWeight=500
IOWeight=500
CPUQuota=75%
MemoryLow=128M
MemoryHigh=384M
MemoryMax=640M
MemorySwapMax=256M
TasksMax=256
OOMScoreAdjust=-300

[Install]
WantedBy=multi-user.target
UNIT

# Protect open recovery/control services from worker experiments without
# turning proprietary desktop control back into a dependency.
for service in 3dvr-open-runner.service 3dvr-personal-mcp.service 3dvr-server-bridge.service; do
  if systemctl list-unit-files "$service" --no-legend 2>/dev/null | grep -q .; then
    install -d -m 0755 "/etc/systemd/system/${service}.d"
    cat >"/etc/systemd/system/${service}.d/45-3dvr-recovery-plane.conf" <<'UNIT'
[Service]
CPUWeight=1000
IOWeight=1000
MemoryLow=64M
OOMScoreAdjust=-700
UNIT
  fi
done

ssh_unit=""
for candidate in ssh.service sshd.service; do
  if systemctl list-unit-files "$candidate" --no-legend 2>/dev/null | grep -q .; then
    ssh_unit="$candidate"
    break
  fi
done
if [ -n "$ssh_unit" ]; then
  install -d -m 0755 "/etc/systemd/system/${ssh_unit}.d"
  cat >"/etc/systemd/system/${ssh_unit}.d/45-3dvr-recovery-plane.conf" <<'UNIT'
[Service]
CPUWeight=1000
IOWeight=1000
MemoryLow=32M
OOMScoreAdjust=-900
UNIT
fi

if systemctl list-unit-files desktop-commander-remote.service --no-legend 2>/dev/null | grep -q .; then
  install -d -m 0755 /etc/systemd/system/desktop-commander-remote.service.d
  cat >/etc/systemd/system/desktop-commander-remote.service.d/45-3dvr-break-glass.conf <<'UNIT'
[Service]
CPUWeight=20
IOWeight=20
MemoryHigh=192M
MemoryMax=256M
OOMScoreAdjust=600
UNIT
fi

cat >/etc/systemd/system/3dvr-portal-do-standby-tunnel.service <<'UNIT'
[Unit]
Description=3DVR Hetzner standby reverse tunnel to DigitalOcean edge
After=network-online.target 3dvr-portal-standby.service
Wants=network-online.target
Requires=3dvr-portal-standby.service

[Service]
Type=simple
ExecStart=/usr/bin/ssh -NT -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=20 -o ServerAliveCountMax=3 -o ConnectTimeout=8 -R 127.0.0.1:14322:127.0.0.1:4322 3dvr-do
Restart=always
RestartSec=5
CPUWeight=100
IOWeight=100
MemoryHigh=96M
MemoryMax=160M
OOMScoreAdjust=-300

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload

for service in 3dvr-open-runner.service 3dvr-personal-mcp.service 3dvr-server-bridge.service; do
  if systemctl is-active --quiet "$service"; then
    systemctl set-property --runtime "$service" CPUWeight=1000 IOWeight=1000 MemoryLow=64M >/dev/null 2>&1 || true
  fi
done
if [ -n "${ssh_unit:-}" ] && systemctl is-active --quiet "$ssh_unit"; then
  systemctl set-property --runtime "$ssh_unit" CPUWeight=1000 IOWeight=1000 MemoryLow=32M >/dev/null 2>&1 || true
fi
if systemctl is-active --quiet desktop-commander-remote.service; then
  systemctl set-property --runtime desktop-commander-remote.service CPUWeight=20 IOWeight=20 MemoryHigh=192M MemoryMax=256M >/dev/null 2>&1 || true
fi

systemctl enable --now 3dvr-portal-standby.service
systemctl restart 3dvr-portal-standby.service

for _ in $(seq 1 30); do
  if health="$(curl -fsS --max-time 5 http://127.0.0.1:4322/__3dvr-health 2>/dev/null || true)" \
    && printf '%s' "$health" | grep -q '"standby":true' \
    && printf '%s' "$health" | grep -Fq "\"sha\":\"$sha\""; then
    break
  fi
  sleep 1
done

health="$(curl -fsS --max-time 5 http://127.0.0.1:4322/__3dvr-health)"
printf '%s' "$health" | grep -q '"standby":true'
printf '%s' "$health" | grep -Fq "\"sha\":\"$sha\""

# Validate the standby policy: pages work, protected AI path degrades safely.
curl -fsS --max-time 8 http://127.0.0.1:4322/ >/dev/null
code="$(curl -sS --max-time 8 -o /tmp/standby-ai.json -w '%{http_code}' \
  -H 'content-type: application/json' \
  --data '{"prompt":"health"}' \
  http://127.0.0.1:4322/api/openai-site)"
[ "$code" = 503 ]
grep -q '"standby":true' /tmp/standby-ai.json
rm -f /tmp/standby-ai.json

systemctl enable 3dvr-portal-do-standby-tunnel.service
if ! systemctl is-active --quiet 3dvr-portal-do-standby-tunnel.service; then
  systemctl start 3dvr-portal-do-standby-tunnel.service
fi

for _ in $(seq 1 20); do
  if tunnel_health="$(ssh -o BatchMode=yes -o ConnectTimeout=8 3dvr-do \
    'curl -fsS --max-time 5 http://127.0.0.1:14322/__3dvr-health' 2>/dev/null || true)" \
    && printf '%s' "$tunnel_health" | grep -q '"standby":true'; then
    echo "hetzner_standby_ready=true"
    exit 0
  fi
  sleep 1
done

echo "standby tunnel did not become healthy" >&2
exit 4
