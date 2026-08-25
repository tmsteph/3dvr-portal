# 3DVR Hybrid Hosting Plan

## Goal

Keep Vercel for the normal production lane while also maintaining a complete self-hosted Portal runtime that can take over when Vercel build quotas, outages, or future platform limits get in the way.

This is redundancy, not a forced Vercel exit.

## Standing operations rule

When the local ChatGPT/Codex runtime cannot SSH directly, use an active 3DVR server, GitHub Actions, or an ephemeral remote builder as the execution hop. Prefer the existing GitHub Actions deployment/recovery path when it can reach the target host.

## Current state

- Vercel remains the canonical public production lane for `portal.3dvr.tech`.
- Vercel Git deployment is intentionally limited to `main`; non-main branches should not consume routine production builds.
- Portal has a self-hosted Node server and release deploy script.
- Operator can run natively on the self-host server.
- The self-host lane runs Portal API routes locally rather than depending on a Vercel API fallback.
- GitHub Actions can reach the 3DVR DigitalOcean host with the persistent `THREEDVR_SSH_PRIVATE_KEY` credential.
- The canonical Vercel production environment can be copied directly into the host runtime by the self-host bootstrap workflow without printing secret values.

## Target architecture

### Vercel lane

- Keep Vercel connected and available.
- Normal public production remains a `main` deployment only.
- Pull-request previews stay opt-in rather than automatic.
- Keep the manual prebuilt Vercel fallback workflow available.
- Do not intentionally spend Vercel builds on every branch or commit.

### Self-host lane

- One small always-on 3DVR host runs the Portal Node service and long-running workers.
- GitHub Actions deploys exact approved commits; production does **not** poll GitHub for changes.
- Cloudflare Tunnel can expose the self-host lane when needed while origin ports stay private.
- Secrets live in the host runtime config and are bootstrapped from the canonical Vercel environment or explicit GitHub Actions secrets, never Git.

### Remote execution

The existing 3DVR host is `167.172.193.194`. GitHub Actions can SSH to it using the persistent authorized key. Use this path before treating lack of SSH in a particular local runtime as a blocker.

### Preview and test builds

- Preview builders are genuinely ephemeral.
- Create a 2 vCPU / 4 GB builder only when a remote preview/test needs one.
- Check out the requested branch, run tests, serve the preview, and delete the builder when the run finishes or fails.
- Do not leave idle builders waiting for future work.

### API routes

The self-host server executes Portal API handlers locally, including Operator / Guide / Forge, sessions, Stripe, OAuth, calendar/reminders, publishing, growth, and money endpoints.

This independence is intentional: Vercel and self-host should each be able to carry the application rather than one being a fragile proxy for the other.

### Scheduled jobs

The self-host lane uses local `systemd` timers for the intentional scheduled business jobs:

- Growth homepage: daily at 02:43 UTC.
- Money autopilot: Monday-Friday at 16:17 UTC.

These timers are not Git polling.

## Secret migration

The bootstrap workflow uses the existing repository `VERCEL_TOKEN` plus the canonical Vercel project identifiers to pull the production environment. It filters Vercel platform-only variables, shell-escapes the remaining values, and merges them into `/root/.3dvr/config/portal-secrets.env` over SSH without printing values.

Future self-host deploys merge only non-empty explicit GitHub secret updates, so the bootstrapped host copy remains intact unless intentionally replaced.

## Readiness gates

1. Self-host unit and smoke tests pass with native API routing.
2. Persistent GitHub Actions SSH authentication works.
3. Canonical Vercel production environment is bootstrapped to the host.
4. A self-host deployment of an exact approved commit succeeds without polling.
5. Operator, Forge, Stripe, OAuth, session, Guide, and scheduled jobs pass on self-host.
6. The self-host lane is reachable through a controlled HTTPS endpoint.
7. Vercel remains healthy and main-only.
8. Only after sustained confidence should we consider changing which lane owns `portal.3dvr.tech`.

## Cost target

Current DigitalOcean target:

- 1 vCPU / 2 GB always-on host: about $12/month.
- Weekly backups: about $2.40/month.
- Ephemeral 2 vCPU / 4 GB builder: about $0.03571/hour only while it exists.
- Cloudflare DNS/Tunnel: start on the free tier.

This cost buys an independent runtime and fallback rather than replacing Vercel outright.

## Failure strategy

If Vercel hits a build quota or production problem, the self-host lane gives us somewhere to build, test, operate workers, and if necessary serve Portal. If the self-host lane has trouble, Vercel remains available. We should prefer graceful redundancy over tying 3DVR to a single provider.
