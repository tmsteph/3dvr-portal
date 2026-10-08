#!/usr/bin/env bash
set -euo pipefail
[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo "root required" >&2; exit 77; }
source_root="${1:?source checkout required}"
release_id="${2:?Git commit required}"
[[ "$release_id" =~ ^[0-9a-f]{40}$ ]] || { echo "full commit SHA required" >&2; exit 2; }
install -m 755 "$source_root/scripts/ops/cloud-reliability-health.py" /usr/local/sbin/3dvr-cloud-reliability-health
install -d -m 700 /root/.cache/3dvr
# OVH has no ingress runner; do not create a duplicate control daemon there.
if systemctl list-unit-files 3dvr-open-runner.service --no-legend | grep -q '^3dvr-open-runner.service'; then
  config=/root/.config/3dvr-server-bridge/config.json
  test -r "$config"
  release="/opt/3dvr-open-runner/releases/$release_id"
  install -d -m 700 "$release"
  install -m 755 "$source_root/apps/agent/tools/github-open-runner.py" "$release/github-open-runner.py"
  python3 -m py_compile "$release/github-open-runner.py"
  install -d -m 755 /etc/systemd/system/3dvr-open-runner.service.d
  cat >/etc/systemd/system/3dvr-open-runner.service.d/99-owned-job-safety.conf <<UNIT
[Service]
ExecStart=
ExecStart=/usr/bin/python3 $release/github-open-runner.py --config $config
Slice=3dvr-recovery.slice
CPUWeight=1000
IOWeight=1000
MemoryLow=64M
MemoryHigh=256M
MemoryMax=256M
KillMode=control-group
Restart=always
RestartSec=5
UNIT
fi
if [ "$(hostname)" = hetzner-openclaw ]; then
  install -d -m 755 /var/lib/3dvr/cloud-health
  cat >/usr/local/sbin/3dvr-cloud-mesh-health <<'SCRIPT'
#!/usr/bin/env bash
set -u
failed=0
report=$(mktemp /var/lib/3dvr/cloud-health/.report.XXXXXX)
trap 'rm -f "$report"' EXIT
python3 /usr/local/sbin/3dvr-cloud-reliability-health >>"$report" || failed=1
for node in 3dvr-ovh 3dvr-do; do
  ssh -o BatchMode=yes -o ConnectTimeout=5 "$node" python3 /usr/local/sbin/3dvr-cloud-reliability-health >>"$report" || failed=1
done
cat "$report"
mv "$report" /var/lib/3dvr/cloud-health/latest.jsonl
exit "$failed"
SCRIPT
  chmod 755 /usr/local/sbin/3dvr-cloud-mesh-health
  cat >/etc/systemd/system/3dvr-cloud-mesh-health.service <<'UNIT'
[Unit]
Description=Independent read-only 3DVR cloud mesh and recovery health

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/3dvr-cloud-mesh-health
TimeoutStartSec=45
MemoryMax=128M
CPUQuota=25%
Nice=15
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/var/lib/3dvr/cloud-health /root/.cache/3dvr
UNIT
  cat >/etc/systemd/system/3dvr-cloud-mesh-health.timer <<'UNIT'
[Unit]
Description=Probe 3DVR cloud health independently of hosted remote access

[Timer]
OnBootSec=2min
OnUnitActiveSec=15min
Unit=3dvr-cloud-mesh-health.service

[Install]
WantedBy=timers.target
UNIT
fi
systemctl daemon-reload
if [ "$(hostname)" = hetzner-openclaw ]; then
  systemctl enable --now 3dvr-cloud-mesh-health.timer
fi
if [ -f /etc/systemd/system/3dvr-open-runner.service.d/99-owned-job-safety.conf ]; then
  # Let the current queue command post its receipt before restarting its daemon.
  systemd-run --quiet --on-active=20s --unit=3dvr-runner-safety-reload /usr/bin/systemctl restart 3dvr-open-runner.service
fi
