# OVH resource lanes

The OVH VPS is shared by public web hosting, freelancer browser workspaces, and development/AI experiments. These workloads use systemd/cgroup v2 slices so experiments cannot consume the entire host.

## Lanes

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

For Compose:

```yaml
services:
  web:
    cgroup_parent: 3dvr-production.slice
```

### `3dvr-workspaces.slice`

For freelancer Firefox/Selkies/Pelorus containers.

- aggregate `CPUQuota=100%` (one vCPU total)
- `CPUWeight=400`
- `IOWeight=400`
- `MemoryHigh=2560M`
- `MemoryMax=3G`
- each workspace remains independently capped at 1 CPU / 1 GB by the runtime

The workspace CLI loads `/etc/3dvr/resource-lanes.env`, so newly provisioned containers automatically receive `--cgroup-parent=3dvr-workspaces.slice` on the OVH host.

### `3dvr-dev.slice`

For builds, crawlers, OpenClaw, Codex/Claude Code helpers, test databases, and other experiments.

- `CPUQuota=200%` (two vCPUs maximum)
- `CPUWeight=100`
- `IOWeight=100`
- `MemoryHigh=2G`
- `MemoryMax=3G`

A long-running systemd service should set:

```ini
[Service]
Slice=3dvr-dev.slice
```

A Docker experiment should use:

```bash
docker run --cgroup-parent=3dvr-dev.slice ...
```

## Why production stays responsive

On the four-vCPU OVH host, dev is hard-capped at two CPUs and workspaces are hard-capped at one CPU in aggregate. Production remains uncapped and has the highest scheduler and I/O weight, leaving CPU capacity available even while both other lanes are saturated. `MemoryLow=2G` also makes production memory much harder for the kernel to reclaim under pressure.

## Build/deploy rule

Do not run application builds in `3dvr-production.slice`. Build in the dev lane, then copy or deploy the finished artifact into production. This prevents `npm`, compilers, image builds, and test suites from creating public-site latency spikes.

## Inspection

Run:

```bash
sudo 3dvr-lane-status
```

The command prints the active resource controls, current memory/tasks, host capacity, and Docker usage.

## Installation

The host configuration is idempotent:

```bash
sudo bash ops/host/install-resource-lanes.sh
```

The Freelancer Workspace Host GitHub Actions workflow installs or refreshes these lanes whenever relevant host/runtime files land on `main`.
