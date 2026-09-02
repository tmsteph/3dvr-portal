# 3DVR Infrastructure Topology

Last reviewed: 2026-09-02

This document is the canonical human-readable inventory for the 3DVR compute mesh. Runtime secrets and private keys must never be stored here.

## Cloud nodes

| Node | Address | Primary role | Current implementation |
| --- | --- | --- | --- |
| OVH | `40.160.137.41` | Rendezvous / recovery anchor | Always-on rendezvous for roaming devices and cloud-to-device reverse SSH paths |
| DigitalOcean | `167.172.193.194` | Default dev/control endpoint | Debian 13 `debian-web`; 1 vCPU, 1 GB RAM, 25 GB disk; default `do-dev` / `3dvr-do` endpoint |
| Hetzner | `167.233.174.20` | Agent / worker runtime | Separate `apps/agent` runtime and background worker host |

There is one DigitalOcean droplet in the current account inventory. Do not assume a second DigitalOcean node exists.

## Edge / operator nodes

- **LicheePi 4A** — RISC-V Debian/upstream test node and future AV-network edge/output node. Treat network recovery and fallback access as unfinished infrastructure work.
- **Termux phone** — roaming mobile mesh endpoint / thin client. It may expose a loopback-only reverse SSH tunnel through OVH when enrolled with `3dvr device mesh`.
- **Laptop** — thin-client/operator environment. Source, development services, agents, queues, and durable state should remain server-first whenever practical.

## SSH mesh

The repository already implements a full cloud SSH mesh in `.github/workflows/cloud-ssh-mesh.yml`.

The workflow:

1. Resolves bootstrap access to OVH, DigitalOcean, and Hetzner.
2. Creates a dedicated `id_ed25519_3dvr_mesh` key on each host.
3. Cross-authorizes each cloud node.
4. Writes stable aliases: `3dvr-ovh`, `3dvr-do`, and `3dvr-hetzner`.
5. Verifies all six directed cloud-to-cloud SSH paths.
6. Removes temporary bootstrap keys.

Roaming devices use OVH as the rendezvous. `3dvr device mesh` can authorize the device on DigitalOcean through OVH and establish a loopback-only reverse tunnel so cloud hosts can reach a phone/laptop behind NAT.

## Responsibility boundaries

### OVH — connectivity and recovery anchor

Keep OVH boring and dependable. Its first responsibility is keeping the mesh reachable. Avoid making a fragile experimental service a hard dependency of OVH connectivity.

Recommended durable services:

- SSH rendezvous / reverse tunnels
- cluster health checks
- recovery scripts and minimal operator tooling
- lightweight shared observability

### DigitalOcean — default development/control node

Use DigitalOcean as the normal interactive server endpoint and small control-plane host.

Current verified provider inventory on 2026-09-02:

- Name: `debian-web`
- Debian 13
- 1 vCPU
- 1 GB RAM
- 25 GB disk
- San Francisco region (`sfo2`)
- public IP `167.172.193.194`
- private networking enabled
- no snapshots present
- no backup IDs present

Do not overload this 1 GB node with heavy workers if Hetzner or OVH can carry them.

### Hetzner — agent/worker node

Keep the separately deployed `apps/agent` runtime here. Prefer Hetzner for background jobs, campaign workers, batch processing, scheduled agents, and other workloads that should not destabilize the control endpoint.

## Reliability rules

1. **No single undocumented host.** Every persistent service must have an owner node recorded here or in deployment configuration.
2. **Cloud nodes must be mutually reachable.** The expected steady state is all six directed SSH paths working.
3. **Recovery must not depend on the failed node.** OVH is the default rendezvous/recovery anchor; provider consoles remain the final fallback.
4. **Never use one shared private key everywhere.** Maintain per-host mesh keys and cross-authorize only the required public keys.
5. **Keep durable state backed up.** Repository state belongs in Git. Databases, queues, credentials, and non-reproducible user data require an explicit backup/restore path.
6. **Servers first; devices roam.** Phones and laptops may disappear from the network without breaking the company automation.
7. **Edge nodes are optional capacity.** LicheePi outages must not prevent cloud automation from operating.

## Immediate resilience backlog

- [ ] Verify the current cloud SSH mesh workflow succeeds end-to-end after the latest key changes.
- [ ] Add a lightweight recurring health probe for all three cloud nodes and all six SSH directions.
- [ ] Decide and document backup/restore policy for DigitalOcean; it currently has no provider snapshots/backups visible in the account inventory.
- [ ] Inventory persistent services and data directories on OVH, DigitalOcean, and Hetzner.
- [ ] Assign each service a primary node and recovery target.
- [ ] Add disk/RAM/load alerts before the 1 GB DigitalOcean node becomes saturated.
- [ ] Finish LicheePi network watchdog/fallback access without making it a cloud dependency.
- [ ] Document provider-console recovery steps separately from SSH recovery.

## Desired end state

The three cloud servers should feel like one small resilient computer:

- predictable names and roles,
- mutually authenticated connectivity,
- observable health,
- reproducible deployments,
- explicit state ownership,
- recoverable data,
- workloads that can move without mystery dependencies,
- phones, laptops, and RISC-V hardware joining as disposable edge/operator nodes rather than becoming single points of failure.
