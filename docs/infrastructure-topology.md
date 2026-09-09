# 3DVR Infrastructure Topology

Last reviewed: 2026-09-07

This document is the canonical human-readable inventory for the 3DVR compute mesh. Runtime secrets and private keys must never be stored here.

For ChatGPT sessions acting through connectors, the connector-visible mirror is the Google Drive document `ChatGPT/3DVR Agent Server Routing Policy`. A fresh ChatGPT session should retrieve that document before server, browser, deployment, or infrastructure work when this policy is not already in conversation context. Keep the Drive mirror synchronized with this file whenever node roles change.

## Cloud nodes

| Node | Address | Primary role | Current implementation |
| --- | --- | --- | --- |
| OVH | `40.160.137.41` | Primary portal / control + recovery anchor | Stable self-hosted portal/control plane plus rendezvous for roaming devices and recovery |
| DigitalOcean | `167.172.193.194` | Emergency fallback / lightweight control | Debian 13 `debian-web`; 1 vCPU, 1 GB RAM, 25 GB disk; keep production and heavy workers off this node |
| Hetzner | `167.233.174.20` | Agent / worker runtime | Dedicated `apps/agent` runtime, Forge worker, and background jobs |

There is one DigitalOcean droplet in the current account inventory. Do not assume a second DigitalOcean node exists.

## Agent routing contract

Agents must route work by role, not by whichever host they happen to be running on:

- **OVH**: control/recovery, portal/control-plane operations, and persistent authenticated browser state. The canonical host browser controller is `portal-live`; guards prevent a second controller from taking over the same state. Reuse the existing profiles rather than launching fresh Chromium state:
  - `/config/chromium-profile` — general authenticated workspace, CDP `9222`
  - `/config/encore-chromium` — Encore/UltiPro workspace, CDP `9333`
  - `/config/messaging-chromium` — WhatsApp + Google Messages, CDP `9444`
- **Hetzner**: default compute for agents. Run Forge/Operator, code/build/test, scheduled and batch jobs, context routing, organism sync, supervisors, and GitHub publishing here.
- **DigitalOcean / `debian-web`**: lightweight fallback only. Keep concurrency low. Its reduced agent runtime may host the lightweight worker, inbox, outreach, heartbeat, health, and emergency control, while context/organism helper work is offloaded. Do not add heavy builds, batch workloads, duplicate helpers, persistent experiments, or new browser/VNC workloads.

Use the SSH aliases `3dvr-ovh`, `3dvr-hetzner`, and `3dvr-do` to route work. If the correct node is unavailable, surface the blocker rather than silently duplicating a service elsewhere. Preserve browser/login state and never move credentials by printing or logging secrets.

## Edge / operator nodes

- **LicheePi 4A** — RISC-V Debian/upstream test node and future AV-network edge/output node. Treat network recovery and fallback access as unfinished infrastructure work.
- **Termux phone** — roaming mobile mesh endpoint / thin client. It may expose a loopback-only reverse SSH tunnel through OVH when enrolled with `3dvr device mesh`.
- **Laptop** — thin-client/operator environment. Source, development services, agents, queues, and durable state should remain server-first whenever practical.

## SSH mesh

The repository implements a full cloud SSH mesh in `.github/workflows/cloud-ssh-mesh.yml`.

The workflow:

1. Resolves bootstrap access to OVH, DigitalOcean, and Hetzner.
2. Creates a dedicated `id_ed25519_3dvr_mesh` key on each host.
3. Cross-authorizes each cloud node.
4. Writes stable aliases: `3dvr-ovh`, `3dvr-do`, and `3dvr-hetzner`.
5. Verifies all six directed cloud-to-cloud SSH paths.
6. Removes temporary bootstrap keys.

Roaming devices use OVH as the rendezvous. `3dvr device mesh` can authorize a device through the cloud mesh and establish a loopback-only reverse tunnel so cloud hosts can reach a phone/laptop behind NAT.

## Responsibility boundaries

### OVH — primary portal/control and recovery anchor

Keep OVH boring and dependable. It is the primary self-hosted portal/control node and the recovery anchor. Production releases are explicit rather than tied to every commit, and experimental workers stay off this host.

Recommended durable services:

- self-hosted 3DVR portal/control plane
- SSH rendezvous / reverse tunnels
- cluster health checks
- recovery scripts and minimal operator tooling
- lightweight shared observability

The production workflow tries OVH first. DigitalOcean is used only when OVH is unreachable.

### DigitalOcean — emergency fallback node

Keep DigitalOcean available as a small emergency/control fallback. Do not make it the production portal host or the default agent worker.

Current verified provider inventory on 2026-09-04:

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

Avoid background workers and repeated production builds on this 1 GB node.

### Hetzner — agent/worker node

Keep the separately deployed `apps/agent` runtime here. Hetzner is the default home for the Operator/Forge worker, campaign workers, batch processing, scheduled agents, and other workloads that should not destabilize the portal/control endpoint.

## Release behavior

The self-hosted production workflow no longer runs on every push to `main`. It runs only when manually dispatched or when `ops/self-host-production-trigger.txt` is updated. Normal development and rapid commits therefore cannot repeatedly cancel or interrupt the production deployment.

## Health monitoring

`.github/workflows/cloud-health.yml` probes OVH, Hetzner, and DigitalOcean over SSH once per hour and can also be dispatched manually. A failed probe produces a failed workflow run instead of silently leaving a dead control path undiscovered.

## Reliability rules

1. **No single undocumented host.** Every persistent service must have an owner node recorded here or in deployment configuration.
2. **Cloud nodes must be mutually reachable.** The expected steady state is all six directed SSH paths working.
3. **Recovery must not depend on the failed node.** OVH is the primary control/recovery anchor; DigitalOcean remains an independent emergency fallback and provider consoles remain the final fallback.
4. **Never use one shared private key everywhere.** Maintain per-host mesh keys and cross-authorize only the required public keys.
5. **Keep durable state backed up.** Repository state belongs in Git. Databases, queues, credentials, and non-reproducible user data require an explicit backup/restore path.
6. **Servers first; devices roam.** Phones and laptops may disappear from the network without breaking company automation.
7. **Edge nodes are optional capacity.** LicheePi outages must not prevent cloud automation from operating.
8. **Production is release-driven.** A burst of commits must not become a burst of live server restarts.

## Immediate resilience backlog

- [ ] Verify the current cloud SSH mesh workflow succeeds end-to-end after the latest key changes.
- [x] Add a lightweight recurring health probe for all three cloud nodes.
- [ ] Extend health monitoring to explicitly record all six cloud-to-cloud SSH directions.
- [ ] Decide and document backup/restore policy for DigitalOcean; it currently has no provider snapshots/backups visible in the account inventory.
- [ ] Inventory persistent services and data directories on OVH, DigitalOcean, and Hetzner.
- [x] Assign the portal/control plane, workers, and fallback roles to explicit cloud nodes.
- [ ] Add disk/RAM/load alerts before any node becomes saturated.
- [ ] Finish LicheePi network watchdog/fallback access without making it a cloud dependency.
- [ ] Document provider-console recovery steps separately from SSH recovery.

## Desired end state

The three cloud servers should feel like one small resilient computer, with OVH serving the stable front door, Hetzner doing worker jobs, and DigitalOcean remaining a lightweight fallback:

- predictable names and roles,
- mutually authenticated connectivity,
- observable health,
- reproducible deployments,
- explicit state ownership,
- recoverable data,
- workloads that can move without mystery dependencies,
- phones, laptops, and RISC-V hardware joining as disposable edge/operator nodes rather than becoming single points of failure.

## Browser writer lease update — 2026-09-08

OVH currently exposes four persistent browser lanes: general `/config/chromium-profile` on CDP `9222`, Encore/UKG `/config/encore-chromium` on `9333`, messaging `/config/messaging-chromium` on `9444`, and Encore University `/config/encore-training-profile` on `9555`.

The CDP bridge exposes these as `19222`, `19333`, `19444`, and `19555`. Any agent changing page state must first acquire the matching cooperative writer lease through `/usr/local/bin/3dvr-browser-lease`. Only one writer may hold a lane at once; read-only inspection may be concurrent. Expiring leases allow recovery when an agent disappears without restarting or cloning authenticated browser state.
