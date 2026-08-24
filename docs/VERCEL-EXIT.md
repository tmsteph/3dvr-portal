# 3DVR Vercel Exit Plan

## Goal

Run Portal production, previews, API routes, scheduled jobs, and TLS/domain routing without Vercel.

## Standing operations rule

When the local ChatGPT/Codex runtime cannot SSH directly, do not treat that as a blocker. Use an active 3DVR server, GitHub Actions, or an ephemeral remote builder as the execution hop. Prefer the existing GitHub Actions deployment/recovery path when it can reach the target host.

## Current state

- Automatic Vercel Git deployments are already disabled in `vercel.json`.
- Portal has a self-hosted Node server and release deploy script.
- Operator already runs natively on the self-host server.
- This migration branch removes the legacy Vercel fallback for the remaining Portal API routes.
- The repo already has event-driven GitHub Actions that target the 3DVR DigitalOcean host on `main` pushes.
- The current operational blocker is the missing GitHub SSH credential for the already-authorized production host; restore that credential rather than replacing event-driven deployment with polling.

## Target architecture

### Production

- One small always-on production host, preferably 1 vCPU / 2 GB (`s-1vcpu-2gb`).
- `systemd` runs the Portal Node service.
- Cloudflare DNS/Tunnel terminates public HTTPS and keeps origin ports private.
- A push/merge to `main` triggers GitHub Actions, which deploys that exact commit to production.
- Production does **not** poll GitHub for changes.
- Secrets live only in the host runtime config and GitHub Actions secrets, never in Git.

### Remote execution

The existing 3DVR DigitalOcean host is `167.172.193.194`. The repo already contains GitHub Actions workflows that SSH to it on relevant `main` pushes. The documented host key currently authorized there is the Termux RSA key.

Use this path before concluding that remote work is blocked merely because a particular local runtime lacks an SSH client.

### Preview and test builds

- Preview builders are genuinely ephemeral.
- Create a 2 vCPU / 4 GB builder (`s-2vcpu-4gb`) only for a preview/test that needs a remote machine.
- Check out the requested branch, run tests, and serve the preview.
- Delete the builder when the preview/test completes or fails.
- Do not leave an idle builder waiting for another job.

### API routes

The self-host server executes Portal API handlers locally, including:

- Operator / Guide / Forge / Next Move
- Session and device APIs
- Stripe billing routes and Stripe webhook
- OAuth providers
- Calendar providers and reminder email
- Trial and GitHub publish endpoints
- Growth and money endpoints

No Portal API route should proxy to `3dvr-portal.vercel.app`.

### Scheduled jobs

Replace Vercel Cron with local `systemd` timers on production:

- Growth homepage: daily at 02:43 UTC.
- Money autopilot: Monday-Friday at 16:17 UTC.

These timers are intentional scheduled business jobs. They call the local Portal API over loopback using the existing cron secret. They are not used to detect code changes.

### DNS and TLS

- Keep public names such as `portal.3dvr.tech` unchanged.
- Point Cloudflare DNS/Tunnel at the self-host Portal.
- Because the public origin stays the same, browser bookmarks, cookies, OAuth return URLs, and Stripe links can remain stable.
- Verify Stripe webhook delivery and OAuth callbacks before removing Vercel.

## Migration gates

1. Self-host server passes unit and smoke tests with zero Vercel API fallback.
2. Restore/verify the GitHub Actions SSH credential for the authorized 3DVR host.
3. An ephemeral preview builder completes a real preview/test and is deleted afterward.
4. A `main` event deploys an exact approved commit to production without polling.
5. Stripe, OAuth, session, Operator, Guide, and scheduled jobs pass on self-host.
6. Switch `portal.3dvr.tech` to the self-host tunnel.
7. Observe production through a normal operating cycle.
8. Remove Vercel project/runtime secrets after rollback confidence is established.

## Cost target

Current DigitalOcean Basic pricing in the account:

- Production 1 vCPU / 2 GB: $12/month.
- Weekly backups: about $2.40/month.
- Ephemeral 2 vCPU / 4 GB builder: $0.03571/hour only while it exists.
- Cloudflare DNS/Tunnel: start on the free tier.

The Vercel replacement itself is therefore about **$14.40/month + actual builder minutes/hours**.

Examples:

- 5 builder-hours/month: about $14.58/month.
- 20 builder-hours/month: about $15.11/month.
- Optional DigitalOcean Spaces/CDN later: add about $5/month.

The existing 1 GB 3DVR agent host is a separate existing $6/month workload. If it remains separate, total DigitalOcean infrastructure is roughly **$20.40/month + ephemeral builder time** before optional Spaces/CDN.

## Rollback

Until the migration is proven, keep the existing Vercel deployment available with automatic Git deployment disabled. During cutover, DNS can point back if necessary. Once self-host operation is stable, remove Vercel entirely.
