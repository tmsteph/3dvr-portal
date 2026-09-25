# Self-hosted Portal production and limited Vercel fallback

As of 2026-09-23, `portal.3dvr.tech` DNS is still hosted by Vercel and the public root can therefore be served by Vercel even while health/API routes reach the self-hosted 3DVR edge. Treat those as separate facts.

The intended steady state is self-host-first. Vercel is retained only for the serverless API routes that still need it and as a controlled emergency static fallback. Until DNS is migrated, a self-host deploy does **not** by itself prove that the public homepage changed.

## The split-brain failure we must not repeat

On 2026-09-23 a self-host deployment reported the new release SHA at `/__3dvr-health`, while `/` still served an older Vercel homepage. The deployment looked healthy because the health/API path reached self-host, but Thomas still saw the old UI.

**Rule:** health SHA is necessary, but it is not proof that the public homepage is current.

A production verification must check both:

1. `https://portal.3dvr.tech/__3dvr-health` reports the expected release SHA and native Operator API.
2. `https://portal.3dvr.tech/` serves the same homepage artifact as the deployed release.

`scripts/ops/deploy-self-host-portal.sh` now enforces this by hashing the public homepage and comparing it with the release's `index.html`. If those differ, the canonical route is not considered current.

## Definition of “live”

Do not say a Portal release is **live** because a deploy job succeeded, because the health endpoint reports a new SHA, or because one backend server has the new files.

For `portal.3dvr.tech`, “live” means the public URL a normal visitor opens is serving the intended homepage artifact **and** the runtime health path is healthy.

The release check therefore has two independent proofs:

- **Root proof:** fetch `https://portal.3dvr.tech/` without a cache-busting query and compare its SHA-256 with the checked-out release's `index.html`.
- **Runtime proof:** fetch `/__3dvr-health` and require `ok: true` plus `operatorApi: "native"`. When validating a self-host deploy, also require the expected release SHA.

If the runtime proof passes but the root proof fails, classify the release as **split-brain / stale-root**, not successful. The usual cause is that the health/API route reached self-host while Vercel still served an older static root.

Provider headers are diagnostic evidence, not release proof. Record them when debugging routing, but the body artifact is the source of truth for what Thomas actually sees.

The Vercel fallback workflow now performs the root artifact comparison itself and fails if the public homepage does not converge to the checked-out release. This prevents a weak marker-only check from declaring a stale homepage current.

## Current lanes

- Canonical Vercel API/fallback project: team `team_xxJGO7S7h1ZP4BHidYV0CX9Z`, project `prj_rAhxzdSdrK9MwKjUMeAXGxk8z8Ch`.
- The similarly named `3dvr`-team Portal project is not a production dependency and should not receive automatic Git deployments.
- Self-host release target: OVH first, with the 3DVR edge/fallback mesh in front of it.
- Self-host production is explicit: manually dispatch it or update `ops/self-host-production-trigger.txt`.
- Vercel Git deployments are disabled for every branch. Portal releases do not ride ordinary Git pushes.
- `.github/workflows/vercel-production-prebuilt.yml` is a manual/triggered fallback and requires `VERCEL_TOKEN` to perform a Vercel deployment.
- If that GitHub token is unavailable, an already-authenticated Vercel CLI may be used from a **clean snapshot of `main`**. Never deploy from a dirty service checkout.

## Public release checklist

1. Confirm the intended commit is on `main`.
2. Trigger the self-host production lane when the public release should change.
3. Verify the self-host deploy reports the intended SHA.
4. Fetch the public root and verify its artifact matches the deployed `index.html`; do not stop at `/__3dvr-health`.
5. If public DNS still points at Vercel and the root is stale, use the controlled Vercel fallback lane or a clean authenticated Vercel CLI snapshot.
6. Re-fetch the public root after the fallback deploy. For homepage changes, verify the actual changed markers/content, not merely HTTP 200.
7. Keep Vercel as fallback until DNS migration is intentionally completed and tested.

## Clean fallback deployment

When a direct CLI fallback is necessary, export a clean archive/snapshot of `origin/main` into a temporary directory and deploy that directory. Do not run `vercel --prod` from a dirty Hetzner/OVH working tree.

After deployment, verify both the public homepage and health endpoint again, then remove the temporary snapshot.
