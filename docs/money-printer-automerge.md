# Money Printer Auto-Merge Loop

Money Printer can become a useful junior operator without becoming reckless.

The v1 loop is:

`observe -> improve -> self-review -> test -> PR -> auto-merge if GREEN -> notify Thomas`

This first version is intentionally local/manual. It does not install a cron, systemd timer, webhook, or deployment hook. It gives the DigitalOcean server a command surface that can later be scheduled after the guardrails have been proven.

## Commands

```bash
node scripts/money-printer-operator.mjs report
node scripts/money-printer-operator.mjs report --email-report --email-dry-run
node scripts/money-printer-operator.mjs report --email
node scripts/money-printer-operator.mjs propose
node scripts/money-printer-self-review.mjs
```

`report` inspects the repo and writes a local email-ready report under `.money-printer/operator/`.

`propose` creates one documentation-only safe improvement, runs focused checks, generates an ignored self-review report under `.money-printer/operator/`, and classifies the change.

`--email-report` sends the internal Thomas operator report after the run. `--email-dry-run` verifies the report path and email configuration without sending.

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

The standalone self-review command can generate `SELF_REVIEW.md`. Operator proposal runs write the same report shape to `.money-printer/operator/self-review-latest.md` and use that file as the PR body, without committing the generated artifact.

Every self-review includes:

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

The operator writes an email-ready report for Thomas at:

`.money-printer/operator/thomas-email-latest.md`

Internal report email can use Gmail or SMTP when configured. This path is not outreach and does not load lead/contact sending.

Suggested configuration:

```bash
OPERATOR_EMAIL_TO=thomas@example.com
OPERATOR_EMAIL_FROM="3DVR Money Printer <3dvr.tech@gmail.com>"
GMAIL_USER=3dvr.tech@gmail.com
GMAIL_APP_PASSWORD=...
```

SMTP is also supported:

```bash
OPERATOR_EMAIL_TO=thomas@example.com
OPERATOR_EMAIL_FROM="3DVR Money Printer <operator@example.com>"
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=operator@example.com
SMTP_PASS=...
```

Dry run:

```bash
node scripts/money-printer-operator.mjs report --email-report --email-dry-run
```

Real internal report email:

```bash
node scripts/money-printer-operator.mjs report --email
```

Intentionally not allowed through this path:

- cold outreach
- lead/contact sending
- SMS
- Stripe or billing actions
- deployment changes
- scheduler changes

## Current Status

This auto-merge automation itself is YELLOW. It adds repo-write and merge capability behind strict flags, so Thomas should review and merge it manually before any unattended run uses it.
