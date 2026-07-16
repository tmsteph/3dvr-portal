# Next Work Breakdown

This is a small-agent handoff plan for the next useful 3dvr work. Keep PRs narrow. Do not combine Portal fixes, Web copy work, Agent operations, and personal profile cleanup in one branch.

## Current Snapshot

- `3dvr-agent` is healthy on `main`; `npm test` passes with 61 tests.
- `3dvr-portal` is the immediate blocker; `npm test` currently has failures.
- `3dvr-web` is directionally useful, but the homepage carries too many ideas for a cold buyer.
- `tmsteph/tmsteph` is an older personal profile/static site and should be cleaned up or turned into a simple redirect.

## PR 1: Stabilize 3dvr Portal Tests

Repo: `/root/3dvr-portal`

Goal: make `npm test` pass without changing product behavior unnecessarily.

Start commands:

```sh
cd /root/3dvr-portal
git status -sb
npm test
```

Known failures to inspect:

- `tests/billing-auth-runtime.test.js`
- `tests/stripe-billing-api.test.js`
- `tests/stripe-dashboard-route.test.js`
- `tests/email-operator.test.js`
- `tests/issue-launcher.test.js`
- `tests/playwright-install-runtime.test.js`
- `tests/vercel-insights-tag.test.js`

Likely fixes:

- Ensure child-process billing tests can resolve the local `gun` dependency.
- Decide whether Email Operator should still render before Billing or update the assertion to match the intended app order.
- Add `/issue-launcher.js` to Portal HTML entry points, or explicitly opt pages out with the existing issue-launcher-off mechanism.
- Update Playwright runtime tests to match the current Chrome-on-ARM fallback behavior, if that behavior is intentional.
- Add the Vercel Insights tag to `earth-garden.html`.

Acceptance criteria:

- `npm test` passes in `/root/3dvr-portal`.
- No unrelated Portal UI rewrites.
- If a page opts out of the issue launcher, the reason is obvious from markup or test naming.

Stop if:

- The working tree has unrelated user changes that conflict with the test fixes.
- A failing test points to a real product decision rather than stale test expectations.

## PR 2: Reconcile Portal Branch State

Repo: `/root/3dvr-portal`

Goal: clean up local branch state after Portal tests are green.

Current local notes:

- The checkout was on `codex/add-garden-planet-page`.
- `AGENTS.md` was modified.
- `tests/social-command-center.e2e.test.js` was untracked.

Tasks:

- Compare local branch with `origin/main`.
- Preserve intentional `AGENTS.md` notes.
- Decide whether `tests/social-command-center.e2e.test.js` belongs in the repo.
- Move to a clean branch from `origin/main` before opening a PR.

Acceptance criteria:

- `git status -sb` is clean after merge.
- No useful local notes are lost.
- No stale feature branch remains as the active working branch.

Stop if:

- You cannot tell whether `tests/social-command-center.e2e.test.js` is user-authored or generated. Ask before deleting or overwriting it.

## PR 3: Simplify 3dvr Web Homepage Decision Path

Repo: clone or worktree for `tmsteph/3dvr-web`

Goal: make the public homepage push one primary action for cold buyers.

Recommended direction:

- Primary action: `Launch in 3 Days`.
- Secondary action: `Start Free in Portal`.
- Move deeper vision items, including OS/nomad/world direction, behind secondary pages.

Files to inspect first:

- `index.html`
- `launch-in-3-days.html`
- `subscribe/portal-links.js`
- `tests/customer-journey.test.js`
- `tests/homepage-growth.test.js`

Acceptance criteria:

- Homepage first viewport has one dominant buyer action.
- Existing billing/portal-origin rules remain intact.
- `npm run test:unit` passes after installing dependencies if needed.
- Do not break `Launch in 3 Days` or plan links.

Stop if:

- You are tempted to redesign the whole site. This PR is copy and funnel clarity only.

## PR 4: Run One Real Agent Outreach Batch

Repo: `/root/3dvr-agent`

Goal: use the now-stable Agent system on a real small batch and record operational issues.

Current note:

- `ask-form` now has a preview-only dry run and auto-discovers a local Chromium binary for submit mode when available.
- If submit mode still fails, record the exact browser/runtime error instead of treating it as a form-adapter bug.

Suggested dry run:

```sh
cd /root/3dvr-agent
ask-crawl --location "San Diego, CA" --category service --limit 10 --radius-km 8 --dry-run
```

Suggested real run only after review:

```sh
ask-crawl --location "San Diego, CA" --category service --limit 10 --radius-km 8
ask-enrich --refresh
3dvr status
3dvr next
```

Review:

- Count email-ready leads.
- Count form-ready leads.
- Try `ask-form --dry-run` on one form lead.
- If Chromium is available locally, try one submit-mode smoke against a safe local file:// form before touching any real lead.
- Do not submit real forms without explicit operator approval.

Acceptance criteria:

- A short report exists with route counts and the top 3 friction points.
- No accidental real form submissions.
- Any bugs become small issues or PRs.

Stop if:

- Email OAuth is not connected.
- Lead data looks spammy or outside the intended customer profile.

## PR 5: Clean Up tmsteph Profile Surface

Repo: `tmsteph/tmsteph`

Goal: make the personal surface point cleanly into the current 3dvr system.

Recommended changes:

- Update README to point to `https://3dvr.tech`, `https://portal.3dvr.tech`, and GitHub.
- Replace old personal site copy with a simple profile page or redirect-style page.
- Remove stale demo claims and old public contact details unless intentionally kept.
- Use one preferred contact channel.

Files to inspect:

- `README.md`
- `index.html`
- `css/style.css`

Acceptance criteria:

- Visitor understands who Thomas is and where to go next within 15 seconds.
- No outdated project promises.
- No accidental exposure of contact info that should not be public.

Stop if:

- You are unsure which contact info should remain public.

## Recommended Order

1. PR 1: Portal tests green.
2. PR 2: Portal branch cleanup.
3. PR 4: Run Agent batch and collect real feedback.
4. PR 3: Web homepage simplification based on real outreach feedback.
5. PR 5: tmsteph profile cleanup.

Reason: stabilize the hub first, then use the operator, then improve the public funnel using what the operator learns.
