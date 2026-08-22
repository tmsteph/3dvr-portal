# Vercel production incident — 2026-08-22

Production lagged behind GitHub `main` because the canonical Vercel project rejected new deployments during `vercel.json` schema validation. The earlier branch filter also assumed a wildcard covered slash-containing branch names, and an `ignoreCommand` attempt exceeded Vercel's 256-character schema limit.

Final repair:

- Use native Vercel Git as the normal production path.
- Enable `main` explicitly and disable the `*` branch pattern in `git.deploymentEnabled`.
- Use a short `ignoreCommand` (`[ "$VERCEL_GIT_COMMIT_REF" != "main" ]`) as the safety net for all remaining non-main branch names, including names containing `/`.
- Keep previews opt-in.
- Keep the GitHub Actions prebuilt production workflow as manual fallback only; it requires a configured `VERCEL_TOKEN` secret.
- Target the canonical Vercel project that owns `portal.3dvr.tech`.
- Verify the live portal contains the interactive spinner and inline Operator form after production deployment.

The restored spinner reached canonical production through native Vercel Git on August 22, 2026.
