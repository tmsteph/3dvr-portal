# Canonical Vercel production

3DVR Portal uses one production lane to avoid duplicate deployments and Hobby-plan quota churn.

- Vercel automatic Git deployments are disabled in `vercel.json`.
- Production deploys run from `.github/workflows/vercel-production-prebuilt.yml` on relevant pushes to `main` or by manual dispatch.
- Non-web-only changes under Agent, Companion, CI, docs, ops, tests, scripts, or Markdown do not trigger production.
- Pull-request previews remain opt-in through the `vercel-preview` label or manual preview workflow.
- Both production and preview workflows target the canonical project that owns `portal.3dvr.tech`: team `team_xxJGO7S7h1ZP4BHidYV0CX9Z`, project `prj_rAhxzdSdrK9MwKjUMeAXGxk8z8Ch`.
- Production verification requires the live canonical portal to contain the interactive spinner and inline Operator form.

This keeps GitHub responsible for deciding when to deploy and Vercel responsible only for building and serving the selected release.
