# Open Runner Mesh Rollout

Updated: 2026-09-16

Goal: make 3DVR remote control portable across cloud servers, Termux, and laptops without depending on a proprietary remote-desktop quota.

## Current verified state

The Hetzner Open Runner is mesh-aware. It accepts an exact ingress `device` and supports two actions:

- `shell` — execute on the ingress machine itself.
- `mesh-shell` — relay the command over the allowlisted 3DVR SSH mesh to a named target.

Verified on 2026-09-16:

- ChatGPT GitHub connector → private queue → Hetzner → local shell works.
- ChatGPT GitHub connector → Hetzner → `mesh-shell` → OVH works.
- ChatGPT GitHub connector → Hetzner → `mesh-shell` → DigitalOcean works.
- ChatGPT GitHub connector → Hetzner → `mesh-shell` → `termux-phone` works through OVH port `22106`.
- Termux now has a persistent `03-3dvr-mesh-termux-phone` Termux:Boot entry and the current `ask-device` mesh implementation installed.
- Hetzner's mesh key is authorized on Termux and its `3dvr-termux-phone` alias uses OVH as the jump host.
- OVH and DigitalOcean do not need independent GitHub credentials for normal control; we deliberately did **not** copy the Hetzner GitHub credential to them.
- `laptop` remains un-enrolled. Its old accidental alias/tunnel was removed from Termux, OVH, and DigitalOcean.

This makes Hetzner, OVH, DigitalOcean, and Termux controllable without Remote Desktop Commander. The laptop joins the same path once it is enrolled from the laptop itself.

## Topology

Current path:

> ChatGPT / human GitHub client → private command issue → Hetzner Open Runner → local shell **or** SSH mesh → target machine → result back to issue

The GitHub queue is an ingress transport, not the architecture itself. Cloud SSH remains a separate recovery path, and provider consoles remain the final fallback.

Stable target names:

- `hetzner` — default worker / Open Runner ingress
- `ovh` — control and recovery anchor
- `digitalocean` — lightweight fallback
- `termux-phone` — roaming Android/Termux edge node
- `laptop` — operator edge node

## Submit commands safely

Do not hand-escape JSON when a CLI is available. Use:

```bash
python3 apps/agent/tools/open-runner-submit.py ovh -- hostname
python3 apps/agent/tools/open-runner-submit.py digitalocean -- 'uptime; free -h'
python3 apps/agent/tools/open-runner-submit.py termux-phone -- 'hostname; pwd'
```

The submitter serializes the task with `json.dumps`, avoiding malformed queue issues caused by shell/JSON quoting.

## Edge enrollment

The one-command edge helper is:

```bash
apps/agent/tools/join-open-runner-edge.sh DEVICE_NAME [REVERSE_PORT]
```

It enrolls or repairs the existing SSH mesh first. If the edge also has its own authenticated GitHub CLI, it prints the optional direct-runner install command; direct GitHub polling is not required for normal edge control.

Known ports:

- `termux-phone`: `22106`
- `laptop`: deterministic default `22934` when enrolled as `laptop`

Termux recovery/enrollment:

```bash
apps/agent/tools/join-open-runner-edge.sh termux-phone 22106
```

Laptop enrollment, run **on the laptop itself**:

```bash
apps/agent/tools/join-open-runner-edge.sh laptop 22934
```

Do not paste the laptop enrollment command into Termux. On 2026-09-16 that accidentally created a second phone tunnel on port `22934`; it was removed after verification. Comment labels such as `# Termux` and `# Laptop` are documentation only and should not be pasted into shells that do not treat them as comments.

The mesh script creates the reverse tunnel through OVH and writes the corresponding remote SSH aliases. Once the reverse listener is healthy, Hetzner's existing `mesh-shell` routing can use that target without giving the edge a GitHub token.

## Rollout rules

1. Target one ingress runner exactly. Broadcast execution is intentionally unsupported for mutating commands.
2. Keep `allowed_authors` narrow and the queue private.
3. Never place secrets in issue bodies or command output. Use machine-local environment files, Bitwarden/Secrets Broker references, or existing authenticated sessions.
4. Do not copy a broad GitHub token between machines merely to make every node poll the queue.
5. Cloud nodes may run `install-open-runner-node.sh` only after they have independent, appropriately scoped GitHub authentication.
6. Laptop and Termux may use `install-open-runner-edge.sh` when independently authenticated, but SSH-mesh routing is the default.
7. Termux should restore its wake lock, local `sshd`, supervisor, and Termux:Boot tunnel before being considered online.
8. A laptop may disappear from the network without breaking cloud automation.

## Redundancy path

Today:

1. GitHub queue → Hetzner Open Runner.
2. Hetzner → OVH / DigitalOcean / Termux / enrolled edges over SSH mesh.
3. Direct human SSH to the cloud mesh.
4. Provider console as final recovery.

Next redundancy improvement: give OVH and/or DigitalOcean an independently scoped queue credential or replace GitHub ingress with an additional self-hosted queue transport. Do not make that improvement by copying Hetzner's credential.

## Verification

For a cloud target, submit a harmless command such as `hostname; id -un; uptime` and confirm the issue reports the expected `Target`, exit code 0, and closes automatically.

For an edge target, first verify the OVH reverse listener and SSH alias. Then submit the same harmless `mesh-shell` command through the Open Runner.
