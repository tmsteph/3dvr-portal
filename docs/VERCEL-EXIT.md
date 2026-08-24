# 3DVR Vercel Exit Plan

## Goal

Run Portal production, previews, API routes, scheduled jobs, and TLS/domain routing without Vercel.

## Current state

- Automatic Vercel Git deployments are already disabled in `vercel.json`.
- Portal has a self-hosted Node server and release deploy script.
- Operator already runs natively on the self-host server.
- The remaining runtime dependency is the legacy fallback for non-Operator API routes.
- Vercel cron schedules still describe two jobs that must move to the self-host runtime.

## Target architecture

### Production

- One small always-on DigitalOcean Droplet.
- Recommended starting size: 1 vCPU / 2 GB (`s-1vcpu-2gb`).
- `systemd` runs the Portal Node service.
- Cloudflare DNS/Tunnel terminates public HTTPS and keeps origin ports private.
- The production host pulls `main` every minute and deploys only when the commit SHA changes.
- Secrets live only in the host runtime config, never in Git.

### Preview and test builds

- A separate ephemeral DigitalOcean builder boots only when needed.
- Recommended builder size: 2 vCPU / 4 GB (`s-2vcpu-4gb`).
- It checks out the requested branch, runs tests, and serves a preview.
- After the preview is accepted, production receives the approved commit through `main`.
- The builder is deleted after the job so it does not become another permanent server.

### API routes

The self-host server should execute all Portal API handlers locally:

- Operator / Guide / Forge / Next Move
- Session and device APIs
- Stripe billing routes and Stripe webhook
- OAuth providers
- Calendar providers and reminder email
- Trial and GitHub publish endpoints
- Growth and money endpoints

No API route should proxy to `3dvr-portal.vercel.app`.

### Scheduled jobs

Replace Vercel Cron with `systemd` timers on production:

- Growth homepage: daily at 02:43 UTC.
- Money autopilot: Monday-Friday at 16:17 UTC.

The timers call the local Portal API over loopback and use the existing cron secret.

### DNS and TLS

- Keep public names such as `portal.3dvr.tech` unchanged.
- Point Cloudflare DNS/Tunnel at the self-host Portal.
- Because the public origin stays the same, browser bookmarks, cookies, OAuth return URLs, and Stripe links can remain stable.
- Verify Stripe webhook delivery and OAuth callbacks before removing Vercel.

## Migration gates

1. Self-host server passes unit and smoke tests with zero Vercel API fallback.
2. Ephemeral preview builder publishes a usable Portal preview.
3. Production puller deploys an approved `main` commit automatically.
4. Stripe, OAuth, session, Operator, Guide, and cron flows pass on self-host.
5. Switch `portal.3dvr.tech` to the self-host tunnel.
6. Observe production for at least one normal operating cycle.
7. Remove Vercel project/runtime secrets only after rollback confidence is established.

## Cost target

DigitalOcean Basic Droplet pricing used by the current account:

- Production 1 vCPU / 2 GB: $12/month.
- Weekly backups: 20% of Droplet price, about $2.40/month.
- Ephemeral 2 vCPU / 4 GB builder: $0.03571/hour while it exists, capped at $24/month.
- Cloudflare DNS/Tunnel: use the free tier initially.

Recommended base: about **$14.40/month + ephemeral builder time**.

Examples:

- 20 builder-hours/month: about $15.11 total.
- 50 builder-hours/month: about $16.19 total.
- Optional DigitalOcean Spaces/CDN later: add about $5/month.

A comfortable working budget is **$15-17/month now**, or **about $20-22/month** with Spaces/CDN.

## Rollback

Until the migration is proven, keep the existing Vercel deployment available but with automatic Git deployment disabled. DNS can be pointed back during the cutover window if needed. Once self-host operation is stable, Vercel can be removed entirely.
