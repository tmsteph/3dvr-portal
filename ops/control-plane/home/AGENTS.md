# Master Codex Guidelines

## Scope
- This file is the default Codex guide for `/data/data/com.termux/files/home`.
- If the current repo or a subdirectory has its own `AGENTS.md`, read both and let the deeper file win for repo-specific rules.
- Treat this file as shared workspace policy, not a replacement for per-repo guidance.

## Workspace Map
- `3dvr-portal`: main portal app, GunJS-first, Stripe billing, and the default place to check for `portal`, `billing`, or production issues.
- `3dvr-web`: main marketing site for `3dvr.tech`; keep it aligned with `3dvr-portal` for branch, billing-link, and environment behavior.
- `tmsteph-redesign-2025`: current `tmsteph`-named site repo in this workspace; if the user says `tmsteph`, check here unless they name a different path.
- `3dvr-web-billing-center`: local billing-related web project folder present in `home/`, but not currently a git repo; inspect carefully before treating it as canonical.
- `3dvr-rewriter`: supporting 3DVR repo for rewrite or content transformation work when explicitly requested.
- `openclaw`: separate upstream-style repo with a much stricter, very detailed `AGENTS.md`; always defer to it when working there.
- Other folders may be experiments, drafts, or non-repo workspaces. Confirm context before making broad changes.

## Workspace Owner
- Owner: Thomas Stephens.
- Primary environment is Termux on Android under `/data/data/com.termux/files/home`.
- This workspace is ongoing and production-adjacent; preserve continuity across turns instead of treating each task like a fresh sandbox.
- Current core working set: `3dvr-portal`, `3dvr-web`, and `tmsteph-redesign-2025`.
- The main active product family is `3dvr`; if the user says `the portal`, `billing`, or `production` without more context, check `3dvr-portal` first.
- If the user says `tmsteph`, assume they mean `tmsteph-redesign-2025` in this workspace unless they give a different repo or path.
- Prefer proactive execution over repeated permission checks for routine engineering work.
- Keep communication direct and concise, and prioritize concrete fixes, verification, and live checks when production is involved.
- For billing, deployment, and customer-facing issues, verify the real environment after changes instead of relying only on local code.

## Repo Priorities
- Default to `3dvr-portal` first for billing, subscriptions, portal UX, GunJS account flows, and production fixes.
- Treat `3dvr-web` as the paired marketing and pricing surface; changes that affect signup or billing routes may require checking both repos.
- Treat `tmsteph-redesign-2025` as active personal-site work, not a side archive.
- Do not assume `3dvr-web-billing-center` or other local-only folders are deployed or canonical unless the user says so.
- `openclaw` is important but separate from the core 3DVR stack; only switch context there when the task clearly points to it.


## Personal Control Plane
- Read these files before acting on ambiguous business or life-ops requests in this workspace:
  - `ME.md`
  - `BUSINESSES.md`
  - `PRIORITIES.md`
  - `TODAY.md`
  - `DECISIONS.md`
  - `RUNBOOKS/`
- Treat these markdown files as the human-readable operating system for Thomas Stephens in this workspace.
- When a standing assumption changes, update the relevant markdown file instead of relying on chat memory alone.
- For 30-90 day 3DVR platform build work, use `RUNBOOKS/3dvr-next-build-plan.md` as the agent task breakdown.
- Portable mirrors of this control plane should live in core repos so the context follows across devices:
  - `3dvr-portal/ops/control-plane/home/`
  - `3dvr-web/ops/control-plane/home/`
  - `tmsteph-redesign-2025/ops/control-plane/home/`
- Any core repo should be able to restore this control plane into `~/` on a new device via `ops/control-plane/restore-to-home.sh`.

## Default Working Style
- Prefer small, testable edits over wide refactors.
- Read existing code and local docs before proposing architecture changes.
- Keep copy direct and operational.
- Preserve current product language unless the task is explicitly a rewrite.
- When a task spans multiple repos, state the coupling clearly and avoid silent cross-repo drift.

## Git Safety
- Never discard user changes.
- Do not use destructive commands such as `git reset --hard`, `git checkout --`, or stash-based cleanup unless explicitly asked.
- Do not switch branches, create worktrees, or rewrite history unless explicitly asked.
- If you temporarily run `vercel link`, clean up `.vercel/` and any incidental `.gitignore` changes afterward unless the user wants them kept.

## Deployments And Secrets
- Never print secrets, tokens, API keys, or live credentials back to the user.
- If you need to inspect live env vars, minimize exposure and clean temporary files afterward.
- For Vercel projects, prefer changing the intended linked project only.
- After production config or deploy work, verify on the live domain, not just the preview URL.

## Stripe And Billing Guardrails
- Never mix live Stripe keys with test `price_...` IDs, or test Stripe keys with live prices.
- For the 3DVR billing stack, keep `3dvr-web` and `3dvr-portal` aligned by branch and environment.
- When a billing issue is reported, verify both:
  - deployment env config
  - Stripe Billing Portal configuration
- Use concrete diagnostics when available, for example `/api/stripe/checkout` on the live portal.

## GunJS And Data Sync
- Prefer shared Gun nodes over device-local only storage when the feature is collaborative or cross-device.
- Document node paths near the logic that reads or writes them.
- Keep fallback local storage behavior explicit when a feature needs offline or guest mode.

## Testing And Verification
- Run the smallest relevant test set that exercises the change.
- If touching HTML entry points, prefer existing repo tests that assert page structure and portal registration.
- If touching billing, auth, deployment, or environment-sensitive logic, verify with both code-level tests and a direct runtime check when feasible.
- If browser automation is needed on Termux, prefer the repo's wrapper scripts or proot guidance over ad-hoc local Playwright runs.

## Frontend Expectations
- Preserve existing visual language inside established products.
- New UI should feel intentional, not placeholder-like.
- Add loading states for screens that do real startup work.
- Keep interactions accessible: semantic HTML, visible status text, keyboard-safe controls, and clear failure states.

## File And Reply Hygiene
- Keep file edits scoped to the task.
- Avoid drive-by formatting churn in unrelated files.
- In replies, distinguish between:
  - code changed locally
  - config changed remotely
  - production verified live
- Mention tests run, and say plainly when something was not tested.

## Contact Email Rule
- The canonical 3DVR contact email is `3dvr.tech@gmail.com`.
- There is no separate public `@3dvr.tech` mailbox set up right now.
- Do not use `hello@3dvr.tech` in copy, CTAs, metadata, docs, or support instructions.
- If a page or document needs a public contact email and the user has not specified another one, use `3dvr.tech@gmail.com`.

## Repo-Specific Reminder
- Before editing inside any of these repos, check for a local `AGENTS.md` first:
  - `3dvr-portal`
  - `3dvr-web`
  - `3dvr-web-billing-center`
  - `tmsteph-redesign-2025`
  - `openclaw`
