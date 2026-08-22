# Canonical Vercel production

3DVR Portal uses one production lane to avoid duplicate deployments and Hobby-plan quota churn.

- Native Vercel Git deployment is the normal production path.
- `vercel.json` enables deployment for `main` and disables the `*` catch-all, so pull-request and feature branches do not create Vercel deployments.
- The canonical project that owns `portal.3dvr.tech` is team `team_xxJGO7S7h1ZP4BHidYV0CX9Z`, project `prj_rAhxzdSdrK9MwKjUMeAXGxk8z8Ch`.
- Pull-request previews remain opt-in through the dedicated preview workflow.
- `.github/workflows/vercel-production-prebuilt.yml` is manual fallback only and requires the `VERCEL_TOKEN` repository secret before it can run.
- Production verification should confirm the live portal contains the interactive spinner and inline Operator form.

This keeps the normal path simple: merge or push to `main`, Vercel builds production once, and non-main branches do not consume deployment quota.
