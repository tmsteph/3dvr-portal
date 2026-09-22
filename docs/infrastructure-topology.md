# 3DVR Infrastructure Topology

Last reviewed: 2026-09-22

This document is the canonical human-readable inventory for the 3DVR compute mesh. Runtime secrets and private keys must never be stored here.

Persistent account/session behavior is governed by `docs/access-continuity.md`. Agents must recover existing access before asking Thomas to reconnect.

For ChatGPT sessions acting through connectors, the connector-visible mirror is the Google Drive document `ChatGPT/3DVR Agent Server Routing Policy`. A fresh ChatGPT session should retrieve that document before server, browser, deployment, or infrastructure work when this policy is not already in conversation context. Keep the Drive mirror synchronized with this file whenever node roles change.

## Cloud nodes

| Node | Address | Capacity | Primary role | Current implementation |
| --- | --- | --- | --- | --- |
| OVH | `40.160.137.41` | 4 vCPU, ~7.6 GiB RAM, 74 GiB root disk | Primary portal / control + recovery anchor | Stable self-hosted portal/control plane plus rendezvous for roaming devices and recovery |
| Hetzner | `167.233.174.20` | 2 vCPU, ~3.7 GiB RAM, 38 GiB root disk | Persistent agent / worker services | Dedicated `apps/agent` runtime, Forge worker, background jobs, standby portal, and Open Runner ingress |
| DigitalOcean | `167.172.193.194` | 1 vCPU, ~0.94 GiB RAM, 25 GiB root disk | Emergency fallback / lightweight control | Debian 13 `debian-web`; keep production and heavy workers off this node |

There is one DigitalOcean droplet in the current account inventory. Do not assume a second DigitalOcean node exists.

### Capacity snapshot — 2026-09-22 07:18 UTC

This is a point-in-time operating snapshot, not a permanent scheduling decision:

| Node | Available RAM | Swap | Root disk | Load average (1m / 5m / 15m) | Interpretation |
| --- | ---: | ---: | ---: | --- | --- |
| OVH | ~3.5 GiB of 7.6 GiB | 3.35 / 4.0 GiB used | 71% | 1.13 / 0.99 / 1.00 | Has the most current headroom, but production reserve must remain protected. |
| Hetzner | ~1.7 GiB of 3.7 GiB | 2.0 / 2.0 GiB used | 79% | 23.48 / 24.10 / 20.53 | Under severe memory/cgroup pressure; do not route new heavy work here until pressure clears. |
| DigitalOcean | ~179 MiB of 967 MiB | 333 / 1023 MiB used | 65% | 2.73 / 1.76 / 1.46 | Resource constrained; emergency/lightweight duties only. |

The Hetzner high load in this snapshot was dominated by stale processes blocked in memory-cgroup pressure rather than sustained CPU consumption. Capacity must therefore be measured live before placing substantial work.

Run `scripts/ops/cloud-capacity-report.sh` from a cloud node with the SSH mesh before assigning a build, browser batch, model job, large indexing run, or other resource-heavy task.

### OpenClaw production identity

The production messaging-backed OpenClaw runs on Hetzner under `openclaw-cloud.service` using the **`cloud` profile**. Its live configuration is `/root/.openclaw-cloud/openclaw.json`. The separate `/root/.openclaw/` tree is the default profile and must not be mistaken for the production bot.

As of 2026-09-17, Telegram `@tmstephOpenClawBot` is the connected working transport. Discord support is installed in the production profile but is not yet authenticated/configured, so Telegram must remain enabled until Discord passes an end-to-end probe and message test.

See [`docs/openclaw-runtime-map.md`](./openclaw-runtime-map.md) before any OpenClaw channel, plugin, profile, or gateway change.

## Agent routing contract

Agents must route work by **role and live capacity**, not by whichever host they happen to be running on and not by a static assumption that Hetzner is the "big worker."

Before substantial ad-hoc compute, run `scripts/ops/cloud-capacity-report.sh`. Static capacity is OVH > Hetzner > DigitalOcean. Persistent service placement remains role-based, while burst compute follows live headroom without violating production reserves.

- **OVH**: largest node and the control/recovery/production anchor. It may absorb bounded compute when live headroom is healthy, but keep at least ~2 GiB available for production/recovery and use `/usr/local/bin/3dvr-experiment` for ad-hoc work. The canonical host browser controller is `portal-live`; guards prevent a second controller from taking over the same state. Reuse the existing profiles rather than launching fresh Chromium state:
  - `/home/debian/.config/google-chrome-for-testing` — general authenticated workspace, CDP `9222`
  - `/home/debian/.config/3dvr/browser-profiles/encore` — Encore/UltiPro workspace, CDP `9333`
  - `/home/debian/.config/3dvr/browser-profiles/messaging` — WhatsApp + Google Messages, CDP `9444`
  - `/home/debian/.config/3dvr/browser-profiles/training` — Encore training workspace, CDP `9555` when enabled
  - `/home/debian/.config/3dvr/browser-profiles/identity` — Portal + Google/OAuth identity workspace, CDP `9666` when admitted
- **Hetzner**: default home for persistent agent/worker services such as Forge/Operator workers, scheduled agents, context routing, organism sync, supervisors, GitHub publishing, and Open Runner. It is only 2 vCPU / ~4 GiB RAM, so do not blindly send builds, browser farms, local-model work, or other heavy bursts here. Admit burst work only when the live capacity report is healthy.
- **DigitalOcean / `debian-web`**: lightweight fallback only. Keep concurrency low. Its reduced agent runtime may host the lightweight worker, inbox, outreach, heartbeat, health, and emergency control, while context/organism helper work is offloaded. Do not add heavy builds, batch workloads, duplicate helpers, persistent experiments, or new browser/VNC workloads.

Use the SSH aliases `3dvr-ovh`, `3dvr-hetzner`, and `3dvr-do` to route work. If the correct node is unavailable, surface the blocker rather than silently duplicating a service elsewhere. Preserve browser/login state and never move credentials by printing or logging secrets.

## Independent remote command control — 2026-09-16

The canonical general-purpose assistant-to-server escape hatch is the open-source **3DVR Open Runner**, documented in [`apps/agent/docs/open-remote-runner.md`](../apps/agent/docs/open-remote-runner.md).

Current verified path:

> ChatGPT GitHub connector / human GitHub client → private command issue → `3dvr-open-runner.service` on Hetzner → local shell and/or SSH mesh → result posted to the issue

A live smoke test on 2026-09-16 verified that a command submitted through the GitHub connector was executed on Hetzner and closed with its result. A second command through the same path verified SSH reachability from Hetzner to both OVH and DigitalOcean.

This path is deliberately independent of Remote Desktop Commander. Hosted remote-control products may remain optional convenience paths, but their subscription state, monthly tool-call quota, outage, or removal must not prevent routine server administration or recovery.

Control-path preference for server work is:

1. Open Runner + private GitHub queue for remote assistant/human command submission.
2. Direct SSH / 3DVR SSH mesh for low-level administration and recovery.
3. 3DVR MCP control gateway for safer allowlisted structured actions.
4. Portal / Operator as the user-facing control surface over those same capabilities.
5. Proprietary remote-desktop/command tools only as optional convenience.
6. Provider console as the final recovery path.

GitHub is the current queue transport, not the architecture itself. If GitHub is unavailable or undesirable, the runner/execution contract should be reusable behind another queue or peer transport. Do not create a new single point of failure by making GitHub the only possible recovery mechanism.

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

### Termux device lifecycle and recovery

The Termux phone is a disposable edge node, but its CLI must not drift behind the repository. The `3dvr device mesh` implementation lives in `apps/agent/thomas-agent/scripts/ask-device`; the Termux desktop installer lives separately under `3dvr-desktop`. A desktop reinstall therefore must also refresh or relink the general `3dvr` CLI from the same checkout.

For the enrolled `termux-phone` node, the expected reverse port is `22106` unless explicitly changed. Recovery order is:

1. Test `ssh -o BatchMode=yes 3dvr-ovh true` on the phone. If that succeeds, the phone key and OVH trust are already valid; do not repeat approval/bootstrap.
2. Verify the installed CLI exposes `3dvr device mesh`. If it only shows `bootstrap` and `approve`, treat that as stale CLI version drift and refresh the checkout/CLI rather than rebuilding SSH trust.
3. Start `3dvr device mesh --name termux-phone --reverse-port 22106`, or use the standalone `3dvr-desktop/scripts/repair-termux-mesh.sh` path when the CLI itself is damaged.
4. On OVH, verify a loopback listener on `127.0.0.1:22106` and the `3dvr-termux-phone` SSH alias before declaring the phone connected.
5. Termux mesh enrollment must immediately acquire a wake lock, supervise both local `sshd` and the reverse tunnel, and install a `~/.termux/boot/03-3dvr-mesh-*` recovery entry. Do not rely on the next Android reboot to make a newly enrolled tunnel persistent.

Do not diagnose a missing reverse listener as a key-approval problem when outbound `3dvr-ovh` access already works. A listener that remains present but stops delivering an SSH banner usually means the Android/Termux side has been suspended or its local `sshd` is unavailable; check the wake-lock/supervisor path before rebuilding trust.

## Responsibility boundaries

### OVH — primary portal/control and recovery anchor

Keep OVH boring and dependable. It is the primary self-hosted portal/control node, the recovery anchor, and the largest current VPS. Production releases are explicit rather than tied to every commit. Bounded non-production work may use spare OVH capacity only after a live headroom check and only through the existing resource-isolation controls; production/recovery reserve takes priority.

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

Keep the separately deployed `apps/agent` runtime here. Hetzner is the default **service home** for the Operator/Forge worker, campaign workers, scheduled agents, Open Runner, and similar background services. It is not the largest machine and must not be treated as the unconditional destination for heavy compute. Builds, browser batches, indexing, or model work require a live capacity check first; move, bound, queue, or postpone them when Hetzner is pressured.

## Release behavior

The self-hosted production workflow no longer runs on every push to `main`. It runs only when manually dispatched or when `ops/self-host-production-trigger.txt` is updated. Normal development and rapid commits therefore cannot repeatedly cancel or interrupt the production deployment.

## Health monitoring

`.github/workflows/cloud-health.yml` probes OVH, Hetzner, and DigitalOcean over SSH once per hour and can also be dispatched manually. A failed probe produces a failed workflow run instead of silently leaving a dead control path undiscovered.

Open Runner health should be checked independently of Desktop Commander. At minimum, verify `3dvr-open-runner.service`, GitHub queue access, and direct SSH reachability so failure of one convenience transport cannot masquerade as loss of server control.

## Resource isolation and degraded-mode resilience — 2026-09-18

The portal/control path must remain usable even when experimental workloads misbehave.

### OVH production protection

`ops/resilience/install-ovh-guardrails.sh` installs host-level systemd guardrails:

- `3dvr-production.slice` gives the portal, OpenBao, Secrets Broker, Caddy, and Human Handoff high CPU/IO weight plus protected memory.
- `3dvr-portal.service` is health-checked once per minute by `3dvr-production-watchdog.timer`; two consecutive local health failures trigger a bounded portal restart.
- Persistent browser lanes retain their per-lane memory ceilings and also receive lower CPU/IO priority, so browser automation can slow itself down without starving production.
- `/usr/local/bin/3dvr-experiment` runs ad-hoc experiments in a bounded transient user scope. New experimental compute on OVH should use this wrapper when it cannot be moved to Hetzner.
- OVH remains the stable portal/control/recovery anchor. Prefer Hetzner for background worker services when it has headroom, but route burst compute by live capacity. If OVH has safe spare capacity, run bounded work through `/usr/local/bin/3dvr-experiment`; otherwise queue or postpone it rather than overloading either host.

### DigitalOcean edge behavior

`ops/resilience/install-do-edge-guardrails.sh` keeps the 1 GiB DigitalOcean node lightweight:

- Caddy and open recovery services receive priority over background work.
- The OVH portal is reached through the existing reverse SSH tunnel at `127.0.0.1:14320`.
- Caddy performs active/passive upstream health checks. Ordinary APIs keep short connection/header timeouts, while `/api/openai-site` gets a 75-second response-header budget so legitimate AI/web-search latency is not mistaken for backend failure.
- Page requests fall back to a tiny static 3DVR Safe Mode page if the OVH tunnel/backend fails or returns selected 5xx responses.
- API requests return a bounded `503` JSON safe-mode response instead of hanging.
- `GET /__3dvr-edge-health` is served locally by DO and does not depend on OVH.
- The duplicate `3dvr-worker`/`3dvr-supervisor` tmux sessions are not part of DO's desired workload; Hetzner owns those roles.
- `desktop-commander-remote.service` is disabled on DO. SSH/Open Runner are the supported recovery paths.

### Hetzner worker protection

Hetzner remains the default home for agent/worker services, but its 2 vCPU / ~4 GiB footprint is smaller than OVH. `scripts/ops/hetzner-agent-guardrails.sh` continues to cap worker pane memory/CPU and keep Ollama from auto-starting into a host-global OOM condition. New burst workloads must pass a live capacity check instead of assuming the worker role implies spare capacity.

`scripts/ops/hetzner-disk-maintenance.sh`, scheduled every six hours by `.github/workflows/hetzner-disk-maintenance.yml`, performs disk cleanup only when root usage is at least 80%. It may remove reproducible caches, old temporary diagnostics, and clean+merged worktrees from designated scratch-worktree directories. It must never automatically delete dirty or unmerged work or named durable workspaces.

On 2026-09-18 the first resource-aware cloud-health run detected Hetzner at 100% root-disk usage. Bounded cleanup recovered about 5 GiB while preserving unmerged/dirty work, validating that disk pressure was a real reliability risk rather than a hypothetical one.

### Monitoring

`.github/workflows/cloud-health.yml` now checks each cloud node hourly for:

- SSH reachability,
- available-memory percentage,
- swap pressure,
- root-disk utilization,
- one-minute load relative to CPU count,
- canonical public portal health,
- DigitalOcean edge health.

Critical memory, disk, or load conditions fail the workflow; early pressure produces warnings.

## Reliability rules

1. **No single undocumented host.** Every persistent service must have an owner node recorded here or in deployment configuration.
2. **Cloud nodes must be mutually reachable.** The expected steady state is all six directed SSH paths working.
3. **Recovery must not depend on the failed node.** OVH is the primary control/recovery anchor; DigitalOcean remains an independent emergency fallback and provider consoles remain the final fallback.
4. **Never use one shared private key everywhere.** Maintain per-host mesh keys and cross-authorize only the required public keys.
5. **Keep durable state backed up.** Repository state belongs in Git. Databases, queues, credentials, and non-reproducible user data require an explicit backup/restore path.
6. **Servers first; devices roam.** Phones and laptops may disappear from the network without breaking company automation.
7. **Edge nodes are optional capacity.** LicheePi outages must not prevent cloud automation from operating.
8. **Production is release-driven.** A burst of commits must not become a burst of live server restarts.
9. **No proprietary control dependency.** Paid or hosted remote-control tools may improve convenience but must never be the only path to administer, repair, or migrate 3DVR infrastructure.
10. **Transports are replaceable.** GitHub currently transports Open Runner tasks, but direct SSH and provider-console recovery remain independent paths and the runner must be portable to another queue.

## Immediate resilience backlog

- [ ] Verify the current cloud SSH mesh workflow succeeds end-to-end after the latest key changes.
- [x] Add a lightweight recurring health probe for all three cloud nodes.
- [ ] Extend health monitoring to explicitly record all six cloud-to-cloud SSH directions.
- [x] Deploy and verify an open-source remote command path that does not depend on Remote Desktop Commander.
- [ ] Add a second Open Runner transport or documented non-GitHub queue option so GitHub is not the only assistant-facing command transport.
- [ ] Decide and document backup/restore policy for DigitalOcean; it currently has no provider snapshots/backups visible in the account inventory.
- [ ] Inventory persistent services and data directories on OVH, DigitalOcean, and Hetzner.
- [x] Assign the portal/control plane, workers, and fallback roles to explicit cloud nodes.
- [x] Add disk/RAM/load alerts before any node becomes saturated.
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
- open and replaceable control transports,
- workloads that can move without mystery dependencies,
- phones, laptops, and RISC-V hardware joining as disposable edge/operator nodes rather than becoming single points of failure.

## Persistent access contract — 2026-09-15

Authenticated services must follow [`docs/persistent-access-contract.md`](./persistent-access-contract.md). Workforce access details for IATSE, UKG, SharePoint, and Lighthouse are in [`docs/workforce-access-runbook.md`](./workforce-access-runbook.md). Agents verify configured → reachable → operational → authenticated before asking Thomas to reconnect. Persistent browser sessions belong on OVH; restart the same profile before considering re-pair/login, and treat missing profile storage as an infrastructure fault rather than a reason to create a new profile.

## Browser writer lease update — 2026-09-16

OVH currently exposes four persistent browser lanes: general `/home/debian/.config/google-chrome-for-testing` on CDP `9222`, Encore/UKG `/home/debian/.config/3dvr/browser-profiles/encore` on `9333`, messaging `/home/debian/.config/3dvr/browser-profiles/messaging` on `9444`, and Encore University `/home/debian/.config/3dvr/browser-profiles/training` on `9555` when enabled.

The authenticated Chromium lanes now run directly as host systemd services and browser tooling on OVH connects to their local CDP ports. The former Docker/network-namespace CDP bridge on `19222`–`19555` is retired and disabled; do not recreate it unless the browser lanes move back into an isolated network namespace. Any agent changing page state must still acquire the matching cooperative writer lease through `/usr/local/bin/3dvr-browser-lease`. Only one writer may hold a lane at once; read-only inspection may be concurrent. Expiring leases allow recovery when an agent disappears without restarting or cloning authenticated browser state.

These fixed ports are specific to Thomas's current single-user OVH installation. Multi-user hosting must allocate isolated identity workspaces and resolve logical browser lanes through a session broker with dynamic host/process/port assignment, on-demand Chromium, per-user quotas, and portable managed/self-hosted execution. See [`docs/digital-thomas-operator-runtime.md`](./digital-thomas-operator-runtime.md) for the canonical scale-out contract.


### Browser lane admission

Additional/on-demand browser lanes are admitted only when the host has enough headroom. `/usr/local/bin/3dvr-browser-admit` checks available memory, load per CPU, and the number of active browser services before allowing identity/training/Encore lanes to start. The default policy keeps 2 GiB of host memory in reserve, allows at most four active browser lanes, and blocks starts above 1.25 load per CPU. Persistent core lanes remain de-prioritized with cgroup CPU/IO controls so browser work cannot starve production or recovery.
