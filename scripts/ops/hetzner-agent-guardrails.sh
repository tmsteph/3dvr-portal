#!/usr/bin/env bash
set -euo pipefail

agent_root="${1:-$HOME/.3dvr/managed-worker/apps/agent}"
worker="$agent_root/thomas-agent/scripts/ask-agent-worker-daemon"

if [ "$(id -u)" -ne 0 ]; then
  echo 'hetzner-agent-guardrails requires root so the cgroup limits protect the whole agent stack.' >&2
  exit 2
fi
[ -x "$worker" ] || { echo "Worker script not found: $worker" >&2; exit 1; }

echo '=== pre-guardrail health ==='
uptime || true
free -h || true
swapon --show || true
df -h / || true
journalctl -b -1 -k --no-pager 2>/dev/null | grep -Ei 'oom|out of memory|killed process' | tail -40 || true

echo '=== stop unmanaged agent stack ==='
"$worker" stop || true

mkdir -p /etc/systemd/journald.conf.d
cat >/etc/systemd/journald.conf.d/3dvr-resilience.conf <<'EOF'
[Journal]
SystemMaxUse=300M
RuntimeMaxUse=100M
EOF

cat >/etc/sysctl.d/99-3dvr-resilience.conf <<'EOF'
# Keep enough memory immediately reclaimable for SSH, the control plane, and recovery work.
vm.min_free_kbytes=131072
# Prefer RAM for active work; swap is a pressure buffer, not the steady state.
vm.swappiness=30
EOF
sysctl --system >/dev/null || true

cat >/etc/logrotate.d/3dvr-agent <<'EOF'
/root/.3dvr/managed-worker/apps/agent/thomas-agent/state/*.log /root/.3dvr/portal/apps/agent/thomas-agent/state/*.log {
  daily
  rotate 7
  size 20M
  compress
  delaycompress
  missingok
  notifempty
  copytruncate
}
EOF

cat >/etc/systemd/system/3dvr-agent-stack.service <<EOF
[Unit]
Description=3DVR managed agent stack with resource guardrails
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$agent_root
Environment=HOME=/root
EnvironmentFile=-/root/.3dvr/config/env
ExecStart=$worker start
ExecStop=$worker stop
KillMode=control-group
TimeoutStopSec=30
MemoryAccounting=yes
MemoryHigh=1800M
MemoryMax=2300M
MemorySwapMax=1024M
CPUAccounting=yes
CPUQuota=150%
CPUWeight=50
IOAccounting=yes
IOWeight=50
TasksMax=192
Nice=5
OOMPolicy=stop

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable 3dvr-agent-stack.service
systemctl restart systemd-journald || true
journalctl --vacuum-size=300M >/dev/null 2>&1 || true
apt-get clean >/dev/null 2>&1 || true
systemctl restart 3dvr-agent-stack.service

echo '=== post-guardrail health ==='
systemctl --no-pager --full status 3dvr-agent-stack.service || true
systemctl show 3dvr-agent-stack.service -p ActiveState -p SubState -p MemoryCurrent -p MemoryHigh -p MemoryMax -p MemorySwapMax -p CPUQuotaPerSecUSec -p TasksCurrent -p TasksMax || true
free -h || true
df -h / || true

echo '=== workload cgroup audit ==='
if command -v tmux >/dev/null 2>&1; then
  tmux ls 2>/dev/null || true
  while IFS=: read -r session pid command; do
    [ -n "$pid" ] || continue
    printf '%s pid=%s command=%s cgroup=' "$session" "$pid" "$command"
    sed -n 's/^0:://p' "/proc/$pid/cgroup" 2>/dev/null || true
  done < <(tmux list-panes -a -F '#{session_name}:#{pane_pid}:#{pane_current_command}' 2>/dev/null || true)
fi
for unit in openclaw-cloud.service ollama.service; do
  if systemctl list-unit-files "$unit" --no-legend 2>/dev/null | grep -q "$unit"; then
    echo "--- $unit ---"
    systemctl show "$unit" -p ActiveState -p SubState -p Restart -p MemoryCurrent -p MemoryHigh -p MemoryMax -p MemorySwapMax -p CPUQuotaPerSecUSec -p TasksCurrent -p TasksMax || true
    systemctl cat "$unit" --no-pager || true
  fi
done

echo '=== disk hotspots ==='
du -xhd1 /var /root 2>/dev/null | sort -h | tail -20 || true
