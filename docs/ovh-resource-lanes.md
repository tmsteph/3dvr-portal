# OVH resource lanes

The OVH VPS is shared by public web hosting, remote control/recovery, freelancer browser workspaces, and development/AI experiments. These workloads use systemd/cgroup v2 slices so experiments cannot consume the entire host or remove the recovery path.

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
- `MemoryLow=2G` protects production memory under pressure
- `MemoryHigh=2560M`
- `MemoryMax=3G`

For a systemd service:

```ini
[Service]
Slice=3dvr-production.slice
```

For Docker:

```bash
docker run --cgroup-parent=3dvr-production.slice ...
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

Ad-hoc builds, test suites, and crawlers must not run directly in the Remote Desktop Commander/login shell. Run them through:

```bash
sudo 3dvr-run-dev node --test tests/example.test.js
sudo 3dvr-run-dev npm run build
```

`3dvr-run-dev` creates a transient service inside `3dvr-dev.slice` with an additional 384-task, 1.5 GB memory, and 150% CPU ceiling. This prevents a test runner or crawler from spending the recovery service's task budget or exhausting host thread/PID headroom.

## Why the recovery path stays responsive

CPU and memory caps alone are not enough: Node test runners and browsers can exhaust process/thread limits before reaching their CPU ceiling. Remote Desktop Commander children normally inherit its recovery cgroup, so heavy work must be explicitly moved into the dev lane. The recovery slice keeps the highest scheduler/I/O weight and protected memory while dev work receives lower aggregate task and resource ceilings.

Production remains separately protected with `MemoryLow=2G` and high scheduler/I/O weight.

## Build/deploy rule

Do not run application builds or substantial test suites in `3dvr-production.slice` or directly in the recovery shell. Build and test through `3dvr-run-dev`, then deploy the finished artifact into production.

## Inspection

Run:

```bash
sudo 3dvr-lane-status
```

The command prints active controls, lane memory/tasks, host cgroup task pressure, host capacity, and Docker usage.

## Installation

The host configuration is idempotent:

```bash
sudo bash ops/host/install-resource-lanes.sh
```

The Freelancer Workspace Host workflow installs or refreshes these lanes and pins Remote Desktop Commander to `3dvr-recovery.slice` whenever relevant host/runtime files land on `main`.
