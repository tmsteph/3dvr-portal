# Vercel production incident — 2026-08-22

Production lagged behind GitHub `main` because the canonical Vercel project rejected new deployments during `vercel.json` schema validation. The branch filter used a non-functional wildcard assumption and the added `ignoreCommand` exceeded Vercel's 256-character schema limit.

Final repair:

- Use native Vercel Git as the normal production path.
- Enable `main` explicitly and disable the `*` catch-all in `git.deploymentEnabled`, preventing feature and pull-request branches from consuming deployment quota.
- Remove the fragile `ignoreCommand` branch filter.
- Keep previews opt-in.
- Keep the GitHub Actions prebuilt production workflow as manual fallback only; it requires a configured `VERCEL_TOKEN` secret.
- Target the canonical Vercel project that owns `portal.3dvr.tech`.
- Verify the live portal contains the interactive spinner and inline Operator form after production deployment.

The restored spinner reached canonical production through native Vercel Git on August 22, 2026.
