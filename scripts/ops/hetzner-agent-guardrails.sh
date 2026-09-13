#!/usr/bin/env bash
set -euo pipefail

agent_root="${1:-$HOME/.3dvr/managed-worker/apps/agent}"
worker="$agent_root/thomas-agent/scripts/ask-agent-worker-daemon"

if [ "$(id -u)" -ne 0 ]; then
  echo 'hetzner-agent-guardrails requires root so the host-level limits can be installed.' >&2
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
# Preserve immediate recovery headroom for sshd/systemd/control-plane work.
vm.min_free_kbytes=131072
# Swap is a pressure buffer, not the normal working set.
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

# tmux 3.4 places panes in tmux-spawn-*.scope units under the root user
# manager, so service-level limits alone do not contain the real workers.
# Apply limits directly to the known 3DVR pane scopes after every start.
cat >/usr/local/sbin/3dvr-apply-tmux-guards <<'EOF'
#!/usr/bin/env bash
set -u
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/0}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=/run/user/0/bus}"
command -v tmux >/dev/null 2>&1 || exit 0
for attempt in 1 2 3 4 5; do
  applied=0
  while IFS=: read -r session pid command; do
    case "$session" in
      3dvr-worker) high=380M; max=520M; swap=256M; cpu=75% ;;
      3dvr-autopilot) high=300M; max=420M; swap=192M; cpu=60% ;;
      3dvr-inbox) high=220M; max=320M; swap=128M; cpu=50% ;;
      3dvr-context-router) high=180M; max=260M; swap=128M; cpu=50% ;;
      3dvr-organism-sync) high=180M; max=260M; swap=128M; cpu=50% ;;
      3dvr-supervisor) high=120M; max=180M; swap=96M; cpu=35% ;;
      3dvr-heartbeat) high=120M; max=180M; swap=96M; cpu=35% ;;
      *) continue ;;
    esac
    scope="$(sed -n 's#^0::.*\/\([^/]*\.scope\)$#\1#p' "/proc/$pid/cgroup" 2>/dev/null | head -n1)"
    [ -n "$scope" ] || continue
    systemctl --user set-property "$scope" \
      MemoryAccounting=yes MemoryHigh="$high" MemoryMax="$max" MemorySwapMax="$swap" \
      CPUAccounting=yes CPUQuota="$cpu" TasksMax=160 OOMPolicy=continue >/dev/null 2>&1 || true
    applied=$((applied + 1))
  done < <(tmux list-panes -a -F '#{session_name}:#{pane_pid}:#{pane_current_command}' 2>/dev/null || true)
  [ "$applied" -gt 0 ] && exit 0
  sleep 1
done
exit 0
EOF
chmod 755 /usr/local/sbin/3dvr-apply-tmux-guards

cat >/etc/systemd/system/3dvr-agent-stack.service <<EOF
[Unit]
Description=3DVR managed agent stack with pane-level resource guardrails
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$agent_root
Environment=HOME=/root
ExecStart=$worker start
ExecStartPost=/usr/local/sbin/3dvr-apply-tmux-guards
ExecStop=$worker stop
TimeoutStopSec=30
Nice=5

[Install]
WantedBy=multi-user.target
EOF

# Ollama caused a host-global OOM. Keep it available for manual experiments,
# but never let it auto-start or consume the entire 3.7 GiB host again.
mkdir -p /etc/systemd/system/ollama.service.d
cat >/etc/systemd/system/ollama.service.d/zz-3dvr-resilience.conf <<'EOF'
[Service]
MemoryAccounting=yes
MemoryHigh=800M
MemoryMax=1100M
MemorySwapMax=256M
CPUQuota=100%
TasksMax=256
OOMPolicy=stop
Restart=no
EOF

systemctl daemon-reload
systemctl disable --now ollama.service >/dev/null 2>&1 || true
systemctl enable 3dvr-agent-stack.service
systemctl restart systemd-journald || true
journalctl --vacuum-size=300M >/dev/null 2>&1 || true
apt-get clean >/dev/null 2>&1 || true
npm cache clean --force >/dev/null 2>&1 || true
systemctl restart 3dvr-agent-stack.service
/usr/local/sbin/3dvr-apply-tmux-guards || true

echo '=== post-guardrail health ==='
systemctl --no-pager --full status 3dvr-agent-stack.service || true
free -h || true
df -h / || true

echo '=== 3dvr pane scope limits ==='
if command -v tmux >/dev/null 2>&1; then
  export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/0}"
  export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=/run/user/0/bus}"
  tmux ls 2>/dev/null || true
  while IFS=: read -r session pid command; do
    [ -n "$pid" ] || continue
    cgroup="$(sed -n 's/^0:://p' "/proc/$pid/cgroup" 2>/dev/null || true)"
    scope="${cgroup##*/}"
    printf '%s pid=%s command=%s cgroup=%s\n' "$session" "$pid" "$command" "$cgroup"
    case "$session" in
      3dvr-*) systemctl --user show "$scope" -p MemoryCurrent -p MemoryHigh -p MemoryMax -p MemorySwapMax -p CPUQuotaPerSecUSec -p TasksCurrent -p TasksMax -p OOMPolicy 2>/dev/null || true ;;
    esac
  done < <(tmux list-panes -a -F '#{session_name}:#{pane_pid}:#{pane_current_command}' 2>/dev/null || true)
fi

for unit in openclaw-cloud.service ollama.service; do
  if systemctl list-unit-files "$unit" --no-legend 2>/dev/null | grep -q "$unit"; then
    echo "--- $unit ---"
    systemctl show "$unit" -p ActiveState -p SubState -p UnitFileState -p Restart -p MemoryCurrent -p MemoryHigh -p MemoryMax -p MemorySwapMax -p CPUQuotaPerSecUSec -p TasksCurrent -p TasksMax || true
  fi
done

echo '=== desktop commander audit ==='
ps -eo pid,ppid,etimes,rss,cmd --sort=-rss | grep -Ei 'desktop.?commander|claude-server-commander|remote.?desktop.?commander' | grep -v grep || true
systemctl list-unit-files --type=service --no-legend 2>/dev/null | grep -Ei 'desktop|commander|openclaw' || true
find /etc/systemd/system /root/.config/systemd -maxdepth 4 -type f 2>/dev/null | grep -Ei 'desktop|commander' || true
find /root/.claude-server-commander -maxdepth 2 -type f -printf '%p\n' 2>/dev/null | head -40 || true

echo '=== disk hotspots after cleanup ==='
du -xhd1 /var /root 2>/dev/null | sort -h | tail -20 || true
for dir in /root/.cache /root/.openclaw-cloud /root/.3dvr /root/workspaces /root/opensource-loop; do
  [ -d "$dir" ] || continue
  echo "--- $dir ---"
  du -xhd1 "$dir" 2>/dev/null | sort -h | tail -12 || true
done
