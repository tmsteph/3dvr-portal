# Canonical Vercel production

3DVR Portal uses Vercel as a controlled public release lane while self-host production tracks `main` continuously. This avoids duplicate builds and Hobby-plan quota churn.

- `vercel.json` disables automatic Vercel production builds from `main` by default.
- Pull-request previews remain opt-in through the dedicated `vercel-preview` bridge workflow.
- The canonical Vercel project that owns `portal.3dvr.tech` is team `team_xxJGO7S7h1ZP4BHidYV0CX9Z`, project `prj_rAhxzdSdrK9MwKjUMeAXGxk8z8Ch`.
- Self-host production remains the continuous deployment/canary path for every `main` merge.
- `.github/workflows/vercel-production-prebuilt.yml` remains a manual fallback when its Vercel token is configured.

## Controlled public release

1. Start from current `main` after self-host checks are green.
2. In a release branch, temporarily change `git.deploymentEnabled.main` to `true`.
3. Merge that single release-gate change to `main`. Vercel performs the production build.
4. Verify `portal.3dvr.tech` serves the expected commit/features.
5. Immediately restore `git.deploymentEnabled.main` to `false`; that guard commit itself should not trigger another Vercel deployment.

This deliberately spends Vercel quota only when we intend to change the public Vercel production site. Routine development stays on the self-host lane.
