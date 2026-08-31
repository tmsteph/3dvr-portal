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
TasksMax=4096
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
TasksMax=4096
EOF

cat >/etc/3dvr/resource-lanes.env <<'EOF'
FREELANCER_WORKSPACE_CGROUP_PARENT=3dvr-workspaces.slice
FREELANCER_WORKSPACE_MIN_HOST_RESERVE_MB=2048
FREELANCER_WORKSPACE_MEMORY_MB=1024
FREELANCER_WORKSPACE_CPUS=1.0
EOF
chmod 0644 /etc/3dvr/resource-lanes.env

cat >/usr/local/bin/3dvr-lane-status <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
for lane in 3dvr-production.slice 3dvr-workspaces.slice 3dvr-dev.slice; do
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
printf '%s\n' '=== host ==='
printf 'CPUs: '; nproc
free -h
printf '%s\n' '=== docker ==='
docker stats --no-stream 2>/dev/null || true
EOF
chmod 0755 /usr/local/bin/3dvr-lane-status

systemctl daemon-reload
systemctl start 3dvr-production.slice 3dvr-workspaces.slice 3dvr-dev.slice

for lane in 3dvr-production.slice 3dvr-workspaces.slice 3dvr-dev.slice; do
  systemctl is-active --quiet "$lane" || {
    echo "$lane failed to activate." >&2
    exit 1
  }
done

echo "3DVR resource lanes installed."
/usr/local/bin/3dvr-lane-status
