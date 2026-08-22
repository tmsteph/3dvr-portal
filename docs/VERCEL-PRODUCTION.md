# Canonical Vercel production

3DVR Portal uses one production lane to avoid duplicate builds and Hobby-plan quota churn.

- Native Vercel Git deployment is the normal production path.
- `vercel.json` explicitly enables `main` and disables the `*` branch pattern.
- A short `ignoreCommand` is the safety net for branch names containing `/`: non-main refs exit successfully and skip the build, while `main` continues.
- The canonical project that owns `portal.3dvr.tech` is team `team_xxJGO7S7h1ZP4BHidYV0CX9Z`, project `prj_rAhxzdSdrK9MwKjUMeAXGxk8z8Ch`.
- Pull-request previews remain opt-in through the dedicated preview workflow.
- `.github/workflows/vercel-production-prebuilt.yml` is manual fallback only and requires the `VERCEL_TOKEN` repository secret before it can run.
- Production verification should confirm the live portal contains the interactive spinner and inline Operator form.

Normal path: merge or push to `main`, Vercel builds production once. Non-main branches are disabled where the branch rule matches and otherwise stopped by the ignored-build check before a real build runs.
