#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (for example: sudo bash $0)." >&2
  exit 1
fi

if [ ! -d /sys/fs/cgroup ]; then
  echo "cgroup filesystem is not available." >&2
  exit 1
fi

install -d -m 0755 /etc/3dvr

cat >/etc/systemd/system/3dvr-recovery.slice <<'EOF'
[Unit]
Description=3DVR protected recovery lane

[Slice]
CPUWeight=10000
IOWeight=10000
MemoryLow=256M
MemoryHigh=512M
MemoryMax=700M
TasksMax=768
EOF

cat >/etc/systemd/system/3dvr-production.slice <<'EOF'
[Unit]
Description=3DVR production web and API workloads

[Slice]
CPUWeight=1000
IOWeight=1000
MemoryLow=2G
MemoryHigh=2560M
MemoryMax=3G
TasksMax=4096
EOF

cat >/etc/systemd/system/3dvr-workspaces.slice <<'EOF'
[Unit]
Description=3DVR freelancer browser workspaces

[Slice]
CPUWeight=400
CPUQuota=100%
IOWeight=400
MemoryHigh=2560M
MemoryMax=3G
TasksMax=2048
EOF

cat >/etc/systemd/system/3dvr-dev.slice <<'EOF'
[Unit]
Description=3DVR development and AI experiments

[Slice]
CPUWeight=100
CPUQuota=200%
IOWeight=100
MemoryHigh=2G
MemoryMax=3G
TasksMax=768
EOF

cat >/etc/3dvr/resource-lanes.env <<'EOF'
FREELANCER_WORKSPACE_CGROUP_PARENT=3dvr-workspaces.slice
FREELANCER_WORKSPACE_MIN_HOST_RESERVE_MB=2048
FREELANCER_WORKSPACE_MEMORY_MB=3072
FREELANCER_WORKSPACE_CPUS=1.0
FREELANCER_WORKSPACE_PIDS_LIMIT=1024
THREEDVR_DEV_TASKS_MAX=768
THREEDVR_RECOVERY_TASKS_MAX=768
EOF
chmod 0644 /etc/3dvr/resource-lanes.env

cat >/usr/local/bin/3dvr-run-dev <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -eq 0 ]; then
  echo "Usage: sudo 3dvr-run-dev <command> [args...]" >&2
  exit 2
fi
if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo so the command can enter the system dev slice." >&2
  exit 1
fi
user="${SUDO_USER:-debian}"
uid="$(id -u "$user")"
gid="$(id -g "$user")"
home="$(getent passwd "$user" | cut -d: -f6)"
exec systemd-run --quiet --wait --collect --pipe \
  --slice=3dvr-dev.slice \
  --uid="$uid" --gid="$gid" \
  --working-directory="${SUDO_PWD:-$PWD}" \
  --setenv="HOME=$home" --setenv="PATH=$PATH" \
  --property=TasksMax=384 \
  --property=MemoryHigh=1280M \
  --property=MemoryMax=1536M \
  --property=CPUQuota=150% \
  -- "$@"
EOF
chmod 0755 /usr/local/bin/3dvr-run-dev

cat >/usr/local/bin/3dvr-lane-status <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
for lane in 3dvr-recovery.slice 3dvr-production.slice 3dvr-workspaces.slice 3dvr-dev.slice; do
  echo "=== $lane ==="
  systemctl show "$lane" \
    -p ActiveState \
    -p CPUWeight \
    -p CPUQuotaPerSecUSec \
    -p IOWeight \
    -p MemoryCurrent \
    -p MemoryLow \
    -p MemoryHigh \
    -p MemoryMax \
    -p TasksCurrent \
    -p TasksMax
  echo
done
printf '%s\n' '=== host cgroup ==='
systemctl show -- -.slice -p TasksCurrent -p TasksMax -p MemoryCurrent -p MemoryMax 2>/dev/null || true
printf '%s\n' '=== host ==='
printf 'CPUs: '; nproc
free -h
printf '%s\n' '=== docker ==='
docker stats --no-stream 2>/dev/null || true
EOF
chmod 0755 /usr/local/bin/3dvr-lane-status

cat >/usr/local/sbin/3dvr-session-gc <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
min_age="${SESSION_GC_MIN_AGE_SECONDS:-7200}"
now_us="$(awk '{printf "%.0f\n", $1*1000000}' /proc/uptime)"
while read -r unit; do
  [ -n "$unit" ] || continue
  entered_us="$(systemctl show "$unit" -p ActiveEnterTimestampMonotonic --value)"
  [[ "$entered_us" =~ ^[0-9]+$ ]] || continue
  age="$(( (now_us - entered_us) / 1000000 ))"
  (( age >= min_age )) || continue
  cg="$(systemctl show "$unit" -p ControlGroup --value)"
  procs="/sys/fs/cgroup${cg}/cgroup.procs"
  [ -r "$procs" ] || continue
  safe=1
  count=0
  while read -r pid; do
    [ -r "/proc/$pid/cmdline" ] || continue
    cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline")"
    [ -n "$cmd" ] || continue
    count=$((count + 1))
    case "$cmd" in
      *"cloudflared tunnel --no-autoupdate --url http://127.0.0.1:4320"*) ;;
      *"agent-browser-linux-x64"*) ;;
      *) safe=0 ;;
    esac
  done < "$procs"
  if (( count > 0 && safe == 1 )); then
    logger -t 3dvr-session-gc "reaping $unit age=${age}s tasks=$count"
    systemctl stop "$unit"
  fi
done < <(systemctl list-units --type=scope --all --no-legend | awk '$4=="abandoned" && $1 ~ /^session-/ {print $1}')
EOF
chmod 0755 /usr/local/sbin/3dvr-session-gc

cat >/etc/systemd/system/3dvr-session-gc.service <<'EOF'
[Unit]
Description=Reap disposable abandoned 3DVR sessions

[Service]
Type=oneshot
Environment=SESSION_GC_MIN_AGE_SECONDS=7200
ExecStart=/usr/local/sbin/3dvr-session-gc
EOF

cat >/etc/systemd/system/3dvr-session-gc.timer <<'EOF'
[Unit]
Description=Periodic cleanup of disposable abandoned 3DVR sessions

[Timer]
OnBootSec=20min
OnUnitActiveSec=30min
RandomizedDelaySec=5min
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl start 3dvr-recovery.slice 3dvr-production.slice 3dvr-workspaces.slice 3dvr-dev.slice
systemctl enable --now 3dvr-session-gc.timer

for lane in 3dvr-recovery.slice 3dvr-production.slice 3dvr-workspaces.slice 3dvr-dev.slice; do
  systemctl is-active --quiet "$lane" || {
    echo "$lane failed to activate." >&2
    exit 1
  }
done

systemctl is-active --quiet 3dvr-session-gc.timer || {
  echo "3dvr-session-gc.timer failed to activate." >&2
  exit 1
}

echo "3DVR resource lanes installed."
/usr/local/bin/3dvr-lane-status
