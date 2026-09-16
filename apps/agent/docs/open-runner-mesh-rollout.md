# Open Runner Mesh Rollout

Updated: 2026-09-16

Goal: make 3DVR remote control portable across cloud servers, Termux, and laptops without depending on a proprietary remote-desktop quota.

## Topology

The private GitHub queue is an ingress transport, not the source of truth. Each enrolled node has a stable `device_id` and runs the same open runner. Commands target one device explicitly. Cloud nodes also remain connected by the 3DVR SSH mesh, so a healthy node can recover another without requiring every operation to pass through GitHub.

Current device ids:

- `hetzner` — default worker and already deployed
- `ovh` — control/recovery anchor
- `digitalocean` — lightweight fallback
- `termux-phone` — roaming Android/Termux edge node
- `laptop` — operator edge node

## Rollout rules

1. Prefer exact device targeting. Do not use `device: "any"` for mutating commands across a multi-runner fleet because more than one runner could claim it.
2. Keep `allowed_authors` narrow and the queue private.
3. Never place secrets in issue bodies or output. Use machine-local environment files, Bitwarden/Secrets Broker references, or existing authenticated sessions.
4. Cloud nodes may run the systemd installer in `apps/agent/tools/install-open-runner-node.sh` after `gh auth status` succeeds locally.
5. Laptop and Termux use `apps/agent/tools/install-open-runner-edge.sh`; they do not need root/systemd.
6. Termux should launch its runner from Termux:Boot only after its existing SSH mesh/sshd supervisor is healthy.
7. A laptop may run the runner only while desired; SSH/Git remain valid recovery paths when it is offline.

## Redundancy

The intended steady state is:

- direct runner on Hetzner, OVH, and DigitalOcean;
- direct runner on Termux/laptop when those devices are online and locally authenticated to GitHub;
- cloud SSH mesh as a separate control path;
- provider consoles as final recovery.

If a device does not have a safe GitHub credential, do not copy another machine's token to it. Keep that device reachable through SSH mesh until it can be authenticated independently.

## Verification

For each enrolled node, submit a harmless command such as `hostname; id -un; uptime` targeted to that exact `device_id`, confirm the issue is claimed by the expected node, confirm exit code 0, and confirm the issue closes automatically.
