# OpenClaw single-tenant Docker reference

Tracks #3253 / PR #3254. **Not production-ready.** This is a starting Compose manifest, not a functional hosted service.

## Requirements
- Docker Compose v2; a reviewed upstream OpenClaw image pinned by immutable digest.
- Confirm the image's UID, data path, gateway command, config, ports, auth, healthcheck and write requirements. The current manifest assumes UID 1000 and /home/node/.openclaw; verify against pinned image.
- Create ./data owned by UID 1000 with restrictive permissions; never commit it.
- The private Docker network deliberately has no egress and no published ports. This means model APIs and browser/network tools will **not work** until an explicitly scoped egress proxy and authenticated Portal gateway are designed. Do not simply remove isolation for convenience.

## Inspect only (no launch)
```sh
OPENCLAW_IMAGE='example.invalid/openclaw@sha256:REPLACE_WITH_VERIFIED_DIGEST' docker compose config
```

## Before first internal launch
1. Verify upstream image and license, gateway startup command, mounts and user.
2. Add an authenticated gateway proxy with least-privilege egress.
3. Test non-root read-only startup, memory/pid caps, persistence and restart behavior.
4. Prove two tenants cannot access each other's files, tokens, network or sessions.
5. Add a real healthcheck and operator-controlled lifecycle; never publish gateway ports directly.
6. Measure host headroom before admitting work; no public users or secrets until isolation tests pass.

## Free software + paid service
Community self-hosting remains free; 3DVR subscriptions pay for managed hosting, backups and support. See ../../docs/hosted-openclaw-pilot.md.

## Known limitation
Docker is not a strong boundary for arbitrary untrusted shell execution; use microVMs or dedicated VMs before exposing that capability.

## Upstream verification (2026-10-18)
Official Docker documentation: https://docs.openclaw.ai/docker and https://docs.openclaw.ai/install/docker-vm-runtime
- Official prebuilt image registry: `ghcr.io/openclaw/openclaw`; pin a reviewed immutable digest for real deployments.
- Documented container state directory: `/home/node/.openclaw`; image runs as node UID 1000 in the maintained Docker flow.
- Gateway liveness: `GET /healthz` on port 18789; default Docker setup uses `gateway.bind=lan` and token authentication.
- Use the upstream onboarding/bootstrap commands rather than guessing environment-only configuration. Persistent config may contain plaintext OAuth tokens; backups must be protected as credentials.
- A 6 GB RAM minimum is documented for **building** from source; official prebuilt images avoid that build requirement.
- Our reference is intentionally network-isolated and therefore **cannot complete model requests**. The official Compose installation is the baseline for a functioning local smoke test, while 3DVR's hardened tenant network/proxy requires separate implementation.
- Do not claim this manifest was runtime-tested; run `python3 validate.py` for static guardrails and perform real Docker tests on an authorized isolated worker only after capacity checks.
