# Self-Hosted Supabase on DigitalOcean

Use this note when deciding whether to run Supabase ourselves instead of relying on a hosted Supabase project that may be paused or deactivated before we use it.

Last checked: June 4, 2026.

## Short Answer

We can self-host Supabase on DigitalOcean, but the current `3dvr-agent` droplet is too small for the full Supabase stack.

Best practical choices:

1. Run plain Postgres first if we only need a persistent database.
2. Use DigitalOcean Managed PostgreSQL if we want less maintenance.
3. Use a dedicated or resized droplet for full or near-full Supabase.

## Current 3DVR Agent Droplet

Read-only check on June 3, 2026:

```text
Host: debian-web
Public IPv4: 167.172.193.194
RAM: 464 MiB
Swap: 1.0 GiB
Disk: 9.7 GiB total, 3.3 GiB free
Docker: not installed
3dvr-agent.service: active
```

Do not install full Supabase on this machine as-is. It risks starving the agent, filling disk, or making both services unreliable.

## Why Supabase Wants More Resources

Supabase is not just Postgres. The self-hosted Docker stack can include:

- Postgres
- Auth
- PostgREST
- Realtime
- Storage
- Studio
- Kong/API gateway
- imgproxy
- Edge Runtime
- optional logs/analytics services

Official Supabase Docker requirements for running all components:

```text
Minimum:     4 GB RAM, 2 CPU cores, 40 GB SSD
Recommended: 8 GB+ RAM, 4 CPU cores+, 80 GB+ SSD
```

Supabase also notes that Realtime, Storage, imgproxy, and Edge Runtime can be removed from `docker-compose.yml` if we do not need them. Logs/Analytics are not part of the default configuration and increase resource use when enabled.

Reference: https://supabase.com/docs/guides/self-hosting/docker

## Current DigitalOcean Cost Shape

DigitalOcean Basic Droplet prices checked June 4, 2026:

| Plan | Monthly cost | Fit |
| --- | ---: | --- |
| 1 vCPU, 1 GB RAM, 25 GB SSD | $6 | Too small for Supabase; possible for tiny Postgres only |
| 1 vCPU, 2 GB RAM, 50 GB SSD | $12 | Plausible for plain Postgres; not full Supabase |
| 2 vCPU, 2 GB RAM, 60 GB SSD | $18 | Better for Postgres; still below Supabase minimum RAM |
| 2 vCPU, 4 GB RAM, 80 GB SSD | $24 | Supabase minimum-class droplet |
| 4 vCPU, 8 GB RAM, 160 GB SSD | $48 | More realistic for full Supabase |

Backups add cost. DigitalOcean lists percentage-based backups at 20% weekly or 30% daily of droplet cost, or usage-based backups starting at $0.01/GiB-month. Snapshots are listed at $0.06/GB-month.

Reference: https://www.digitalocean.com/pricing/droplets

## Options

### Option A: Plain Postgres on Current Droplet

Cost: $0 additional infrastructure.

What we get:

- A persistent PostgreSQL database.
- No Supabase hosted-project inactivity problem.
- Simple server-side connection from 3DVR services.

What we do not get:

- Supabase Auth.
- Supabase Studio.
- Supabase Storage.
- Realtime subscriptions.
- Browser-safe anon API by default.

Limits:

- The current droplet is very small.
- We should not expose Postgres publicly.
- Use server-side APIs or SSH tunnel access only.
- Keep the database small.
- Add off-box backups immediately.

This is the best first move if the real need is "a database that stays alive."

### Option B: Plain Postgres on a Small Dedicated Droplet

Cost: about $12 to $18/month before backups.

What we get:

- Isolation from the `3dvr-agent` host.
- More disk and RAM headroom.
- Easier backups and restores.

Good fit for:

- Portal experiments.
- CRM/state storage.
- App prototypes.
- Anything that does not need Supabase Auth/Storage/Realtime yet.

### Option C: DigitalOcean Managed PostgreSQL

Cost: separate managed database pricing, typically more than the smallest droplets.

What we get:

- Managed backups and maintenance.
- Less risk than self-managing Postgres.
- No Supabase inactivity problem.

What we do not get:

- Supabase Auth.
- Supabase Studio.
- Supabase Storage.
- Supabase Realtime.

Good fit if uptime and backups matter more than lowest cost.

### Option D: Slim Self-Hosted Supabase

Cost: about $24/month minimum-class droplet plus backups.

Run Supabase Docker Compose but remove components we do not need, likely:

- no Analytics/Logflare
- no Edge Runtime at first
- no imgproxy unless Storage needs image transforms
- possibly no Storage
- possibly no Realtime

What we keep:

- Postgres
- Auth, if needed
- REST API
- Studio
- maybe Realtime later

This is the closest low-cost version of "our own Supabase," but it still needs Docker, reverse proxy, secrets, upgrades, monitoring, and backups.

### Option E: Full Self-Hosted Supabase

Cost: $24/month minimum, $48/month preferred, plus backups.

Good fit if we actually need the Supabase product surface:

- Auth
- REST API
- Realtime
- Storage
- Studio
- Edge Functions

This should be a dedicated droplet, not the current agent host.

## What We Should Not Do

- Do not install full Supabase on the current 464 MiB droplet.
- Do not expose raw Postgres to the public internet.
- Do not run without automated off-box backups.
- Do not rely on same-disk backups only.
- Do not add Supabase Auth unless we are ready to reconcile it with the existing Gun SEA identity path.

## Recommended Path

Start with a staged approach:

1. Create a Postgres-only proof of life.
2. Use it from server-side 3DVR code only.
3. Add nightly `pg_dump` to off-box storage.
4. Decide whether we actually need Supabase Auth, Studio, Storage, or Realtime.
5. If yes, create a dedicated `$24` or `$48` droplet and deploy slim Supabase.

Default recommendation:

```text
For now: Postgres-only.
Later: slim Supabase on a dedicated droplet if the product actually needs Supabase features.
```

## Basic Implementation Checklist

For Postgres-only:

- Provision a small dedicated droplet or use current host only for a tiny internal test.
- Install Postgres.
- Create a `3dvr` database and least-privilege app user.
- Bind Postgres to localhost or private network only.
- Add `ufw` rules.
- Add nightly `pg_dump`.
- Copy backups off-box.
- Store connection secrets in the relevant runtime environment, not in git.

For slim Supabase:

- Provision 2 vCPU / 4 GB RAM / 80 GB SSD or larger.
- Install Docker Engine and Docker Compose.
- Use the official Supabase Docker setup.
- Remove unused services before launch.
- Put Caddy or Nginx in front with HTTPS.
- Keep raw database access private.
- Generate and store all Supabase secrets.
- Add off-box backups and restore testing.
- Document upgrade steps before accepting real production data.

## Open Questions

- Do we need browser-facing Supabase APIs, or only a server-side database?
- Do we need Supabase Auth, or should Gun SEA remain the identity layer?
- Do we need Realtime, or is Gun already covering realtime state?
- Do we need file storage, or can assets stay in object storage / Vercel / Git?
- What is the acceptable monthly budget: $0, $12, $24, or $48+?
