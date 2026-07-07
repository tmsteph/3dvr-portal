# Money Printer Auto-Merge Loop

Money Printer can become a useful junior operator without becoming reckless.

The v1 loop is:

`observe -> improve -> self-review -> test -> PR -> auto-merge if GREEN -> notify Thomas`

This first version is intentionally local/manual. It does not install a cron, systemd timer, webhook, or deployment hook. It gives the DigitalOcean server a command surface that can later be scheduled after the guardrails have been proven.

## Commands

```bash
node scripts/money-printer-operator.mjs report
node scripts/money-printer-operator.mjs propose
node scripts/money-printer-self-review.mjs
```

`report` inspects the repo and writes a local email-ready report under `.money-printer/operator/`.

`propose` creates one documentation-only safe improvement, runs focused checks, generates `SELF_REVIEW.md`, and classifies the change.

PR creation and auto-merge are opt-in:

```bash
node scripts/money-printer-operator.mjs propose --create-pr
node scripts/money-printer-operator.mjs propose --create-pr --auto-merge
```

## GREEN

GREEN changes may auto-merge only when every safety check passes.

Examples:

- documentation updates
- tests
- small local/demo Money Printer UI changes
- non-production Money Printer report improvements
- small bug fixes with focused tests
- localStorage-only review queue behavior
- bounded internal refactors under the file/change limit

Hard requirements:

- tests passed
- no secret-like files touched
- no billing touched
- no real sending touched
- no deployment config touched
- no destructive changes
- changed file count within limit
- additions/deletions within limits

## YELLOW

YELLOW changes may open a PR but must not auto-merge.

Examples:

- public-facing copy changes
- larger UI changes
- schema changes
- new dependencies
- approval/risk logic changes
- automation scripts that can affect GitHub history
- unclear product impact

## RED

RED changes stop before a mergeable PR.

Examples:

- real email/SMS sending
- Gmail integration
- Stripe, billing, or payment changes
- secrets or env changes
- deployment config changes
- production domain or Vercel changes
- destructive cleanup/deletes
- cron/systemd/scheduler changes
- auth or security changes
- large refactors
- anything that could send messages, charge money, expose secrets, or break production

## Self Review

Every run can generate `SELF_REVIEW.md` with:

- summary
- files changed
- risk classification
- auto-merge decision
- safety checks
- verification commands
- rollback plan
- next suggested action

The PR body should include the self-review summary when the operator opens a PR.

## Notification

Real email sending is not implemented in v1. The operator writes an email-ready report for Thomas at:

`.money-printer/operator/thomas-email-latest.md`

That keeps the reporting path testable without adding Gmail, SMTP, SMS, or outreach risk.

## Current Status

This auto-merge automation itself is YELLOW. It adds repo-write and merge capability behind strict flags, so Thomas should review and merge it manually before any unattended run uses it.
