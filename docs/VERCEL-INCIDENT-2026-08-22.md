# Vercel production incident — 2026-08-22

Production lagged behind GitHub `main` because the canonical Vercel project rejected new deployments during `vercel.json` schema validation. The branch filter used a non-functional wildcard assumption and the added `ignoreCommand` exceeded Vercel's 256-character schema limit.

Repair:

- Disable native Vercel Git deployments entirely.
- Let GitHub Actions decide when relevant `main` changes should deploy.
- Keep previews opt-in.
- Target the canonical Vercel project that owns `portal.3dvr.tech`.
- Verify the live portal contains the interactive spinner and inline Operator form after production deployment.
