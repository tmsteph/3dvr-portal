# 3DVR Portal self-host migration

Last reviewed: 2026-09-05

## Goal

Move the canonical 3DVR Portal from Vercel to infrastructure we control without turning the migration itself into an outage. The public DNS cutover is the final step, not the migration strategy.

The target topology is:

- **OVH (`40.160.137.41`)** — primary portal/control endpoint. Keep it boring, release-driven, and free of experimental workers.
- **Hetzner (`167.233.174.20`)** — background workers, scheduled jobs, Forge/agent workloads, and other jobs that should not compete with the portal.
- **DigitalOcean (`167.172.193.194`)** — small emergency/control fallback. Its 1 GB RAM footprint is intentionally not the normal production portal target.
- **Vercel** — temporary public origin and rollback lane during migration. It is not considered removed while self-hosted requests still proxy critical APIs back to it.

## Current state

The OVH host already runs the portal from immutable releases under `/opt/3dvr-portal-production` with a `current` symlink, systemd supervision, candidate health validation, Workboard validation, and automatic release rollback. This is the production foundation rather than a throwaway staging server.

The self-host runtime is being brought to native parity with the repository's current Vercel API surface. During the transition, `LEGACY_API_ORIGIN` may remain enabled as an explicit compatibility fallback. The `/__3dvr-readiness` endpoint exposes whether that fallback is enabled, whether it has actually been used, and whether the core runtime secret groups are present.

The canonical `portal.3dvr.tech` DNS record must remain on Vercel until the cutover gates below pass. A direct OVH port-80 probe from GitHub Actions currently times out even though Caddy is healthy locally, so public-edge reachability is an unresolved prerequisite rather than something to work around silently.

## Release safety model

`deploy-self-host-portal.sh` follows a release transaction:

1. Materialize an immutable release from a specific Git commit.
2. Install production dependencies inside that release.
3. Start the release on a candidate port.
4. Require the candidate health endpoint to report the expected commit.
5. Validate the Workboard shell.
6. Only then switch the `current` symlink.
7. Restart the supervised live service.
8. Re-run live health and Workboard validation.
9. Restore the previous release automatically if live validation fails.

The protected `portal-secrets.env` file is loaded separately from generated runtime configuration so new API dependencies do not require copying secrets into source code or expanding a hard-coded deployment allowlist.

## Cutover readiness contract

The self-host can be useful before it is safe to become canonical. A final cutover requires all of these conditions at the same time:

- the deployed SHA is the intended tested release;
- the static portal, Noteverse, and Workboard shells load locally;
- private repository files remain inaccessible;
- Vercel-compatible cache-reset and service-worker headers are preserved;
- host-based routes such as `crm.3dvr.tech` resolve correctly;
- current portal API handlers run natively on the self-host;
- Stripe webhook handling preserves the raw request body needed for signature verification;
- AI, Google OAuth, mail, and Stripe runtime secret groups are provisioned;
- `LEGACY_API_ORIGIN` is explicitly disabled;
- no legacy Vercel fallback request has been observed since the server started;
- the public edge is reachable from outside the OVH network;
- HTTPS works against the OVH edge before normal user traffic is trusted to it;
- rollback back to the Vercel DNS origin is available and tested.

`scripts/ops/check-self-host-readiness.mjs` implements the repeatable application-level checks. With `--require-no-legacy`, it deliberately fails while Vercel is still an API dependency.

## Migration phases

### 1. Shadow production

Keep canonical DNS on Vercel. Deploy explicit tested commits to OVH and exercise the portal through localhost or an isolated public staging route. Compare behavior rather than assuming static-page success means production parity.

Exit criteria: repeatable OVH deploys, health checks, rollback, and core browser flows are green.

### 2. Native API parity

Route every current `api/` and webhook entry point through the self-host runtime. Mark native responses with `X-3DVR-API-Backend: self-host`; mark any compatibility proxy with `legacy-vercel` and count it.

Exit criteria: the readiness endpoint reports no observed fallback traffic under representative portal testing.

### 3. Runtime configuration parity

Mirror required production configuration from the current Vercel project into the protected server secret file without logging values. Test capabilities by feature group rather than merely checking that environment-variable names exist.

Exit criteria: AI, Google OAuth, mail, Stripe, TURN/communications, and any other active production integrations have a self-host test with no secret material in logs or Git.

### 4. Scheduled work to Hetzner

Replace Vercel cron execution with supervised Hetzner jobs. The two current Vercel schedules are the homepage growth task and the Money Autopilot task. Each job needs idempotency, logs, an explicit environment file, and a manual test path before its Vercel schedule is disabled.

Exit criteria: scheduled jobs have completed successfully on Hetzner and duplicate execution is prevented.

### 5. Data, backup, and observability

Inventory every persistent directory/database and define owner, backup destination, retention, and restore command. Add disk, RAM, load, process-health, TLS, and external HTTP checks. Verify a restore rather than treating an untested backup as recovery.

Exit criteria: a documented restore drill succeeds and alerts fire before resource exhaustion.

### 6. Public-edge canary

Resolve the OVH public ingress issue or intentionally choose a stable tunnel/reverse-proxy design. Do not depend on ephemeral quick-tunnel URLs for the canonical portal. Exercise the exact production hostname against the OVH edge using an override before changing authoritative DNS.

Exit criteria: an external runner can reach the edge, TLS validates, key subdomains/routes behave correctly, and representative authenticated/API flows pass.

### 7. Canonical DNS cutover

Run the migration workflow manually in `cutover` mode. It must first re-run readiness, prove the public edge, verify the existing Vercel DNS target, require an explicit hostname confirmation, change DNS, verify authoritative DNS, enable/verify HTTPS, and roll DNS back if post-cutover verification fails.

Exit criteria: canonical HTTPS reports the expected self-host release and no fallback traffic appears.

### 8. Soak and retire dependencies

Keep Vercel available as a rollback origin during a soak period. Watch errors, latency, Stripe/webhook delivery, OAuth, scheduled work, and resource headroom. Remove Vercel-specific production dependencies only after the self-host path has demonstrated recovery from real restarts and a rollback drill.

## Subdomains

Do not move every hostname in one DNS change. Move the canonical portal first, then migrate host-routed subdomains one at a time with the same preflight/verify/rollback pattern. This limits the blast radius and exposes assumptions in host rewrites early.

## Rules

- Never couple production deployment to every `main` commit.
- Never change canonical DNS as an automatic side effect of a normal push.
- Never print secret values in CI or migration diagnostics.
- Never call a release independent while `LEGACY_API_ORIGIN` is enabled.
- Never use DigitalOcean's 1 GB node as the routine portal or worker host.
- Never put experimental agents on the OVH production portal host.
- Prefer reversible changes: immutable releases, explicit DNS state, small migrations, and tested rollback paths.
