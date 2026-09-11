# OVH resource lanes

The OVH VPS is shared by public web hosting, remote-control/recovery, freelancer browser workspaces, and development/AI experiments. These workloads use systemd/cgroup v2 slices so experiments cannot consume the entire host or remove the recovery path.

## Lanes

### `3dvr-recovery.slice`

For Remote Desktop Commander, rescue tunnels, watchdogs, and other control-plane processes that must remain usable while another lane is saturated.

- `CPUWeight=10000`
- `IOWeight=10000`
- `MemoryLow=256M`
- `MemoryHigh=512M`
- `MemoryMax=700M`
- `TasksMax=768`

Recovery services should explicitly set `Slice=3dvr-recovery.slice`. This lane is not for builds, browsers, crawlers, or ordinary application work.

### `3dvr-production.slice`

For public websites, reverse proxy, production APIs, and production databases.

- no hard CPU quota; production can burst when capacity is idle
- `CPUWeight=1000`
- `IOWeight=1000`
- `MemoryLow=2G`
- `MemoryHigh=2560M`
- `MemoryMax=3G`

For a systemd service:

```ini
[Service]
Slice=3dvr-production.slice
```

### `3dvr-workspaces.slice`

For freelancer Firefox/Selkies/Pelorus containers.

- aggregate `CPUQuota=100%`
- `CPUWeight=400`
- `IOWeight=400`
- `MemoryHigh=2560M`
- `MemoryMax=3G`
- `TasksMax=2048`
- each workspace remains independently capped at 1 CPU / 1 GB by the runtime

The workspace CLI loads `/etc/3dvr/resource-lanes.env`, so newly provisioned containers automatically receive `--cgroup-parent=3dvr-workspaces.slice` on the OVH host.

### `3dvr-dev.slice`

For builds, crawlers, OpenClaw, Codex/Claude Code helpers, test databases, and other experiments.

- `CPUQuota=200%`
- `CPUWeight=100`
- `IOWeight=100`
- `MemoryHigh=2G`
- `MemoryMax=3G`
- `TasksMax=768`

Long-running services should set `Slice=3dvr-dev.slice`. Docker experiments should use `--cgroup-parent=3dvr-dev.slice`.

Ad-hoc builds, test suites, and crawlers must not run directly in the login/control shell. Run them through:

```bash
sudo 3dvr-run-dev node --test tests/example.test.js
sudo 3dvr-run-dev npm run build
```

`3dvr-run-dev` creates a transient dev-lane service with an additional 384-task, 1.5 GB memory, and 150% CPU ceiling. This prevents a test runner or crawler from exhausting host-global thread/PID headroom.

## Why the control path stays responsive

CPU and memory caps alone are not enough: Node test runners and browsers can exhaust process/thread limits before reaching their CPU ceiling. The recovery lane reserves scheduler priority and protected memory, while the dev lane now has a much lower aggregate task ceiling. Ad-hoc work is also explicitly routed into the dev lane instead of inheriting the recovery shell's cgroup.

Production remains separately protected with `MemoryLow=2G` and high scheduler/I/O weight.

## Build/deploy rule

Do not run application builds or test suites in `3dvr-production.slice` or from an unclassified control/login shell. Build and test in `3dvr-dev.slice`, then copy or deploy the finished artifact into production.

## Inspection

Run:

```bash
sudo 3dvr-lane-status
```

The command prints the active controls, lane memory/tasks, cgroup-root PID usage, host capacity, and Docker usage.

## Installation

The host configuration is idempotent:

```bash
sudo bash ops/host/install-resource-lanes.sh
```

The deployment workflow pins Remote Desktop Commander to `3dvr-recovery.slice`; host reliability drop-ins may add tighter per-service caps.
