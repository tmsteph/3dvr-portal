# Selective Vercel deploys

3DVR keeps production simple while protecting the Vercel Hobby deployment quota:

- `main` is the only branch that auto-deploys through native Vercel Git.
- Routine pull requests rely on GitHub CI and do not create Vercel previews.
- Add the `vercel-preview` label to a pull request when a live browser preview is materially useful.
- The preview workflow can also be run manually.
- The production fallback workflow is manual-only and deploys directly to Vercel; it is not a second normal deployment lane.
- The ignored-build command skips production builds when changes are limited to non-web Agent/Companion, CI, ops, docs, tests, scripts, or repository guidance files.

This avoids deployment-trigger PRs and prevents backend/automation churn from consuming the daily deployment budget.
