# Selective Vercel deploys

3DVR keeps one canonical production lane while protecting the Vercel Hobby deployment quota:

- Native Vercel Git deployments are disabled for all branches.
- Relevant pushes to `main` deploy through the GitHub Actions production workflow.
- Agent, Companion, CI, docs, ops, tests, scripts, and Markdown-only changes do not trigger production.
- Routine pull requests rely on GitHub CI and do not create Vercel previews.
- Add the `vercel-preview` label when a live browser preview is materially useful, or run the preview workflow manually.
- Both workflows target the long-lived Vercel project that owns `portal.3dvr.tech`.
- Production verification checks the canonical domain for the interactive spinner and inline Operator form.

GitHub decides when a deployment is warranted; Vercel only builds and serves the selected release.
