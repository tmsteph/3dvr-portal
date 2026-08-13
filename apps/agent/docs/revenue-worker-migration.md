# Revenue worker migration

This branch establishes the only allowed target control plane. It is intentionally
**foundation-only**: the service creates a durable SQLite ledger and records a
structured no-send run. It does not send email, crawl, submit forms, or project to
CRM yet.

## Authorities

- Source: this repository at an immutable release SHA.
- Runtime: `/opt/3dvr/revenue-worker/apps/agent` only.
- Config: `/etc/3dvr/revenue-worker.env` only; secrets must not live in a checkout.
- Ledger: `/var/lib/3dvr-revenue/revenue-ledger.sqlite`.
- Supervisor: `3dvr-revenue-worker.timer` and `3dvr-revenue-worker.service` only.
- CRM/GUN: projection/read model only, never the send authority.

## State machine

`prospect → verified → drafted → eligible → sent → bounced|replied|suppressed`

`failed` is an exception state and may return only to a deterministic earlier state.
Each transition and run has a unique idempotency key. A transition writes the event
and state change in one SQLite transaction.

## Cutover gates

Do not enable the timer or stop the legacy inbox monitor until all gates pass:

1. Import CSV/NDJSON legacy history once, emit duplicate/conflict report, and sign off the totals.
2. Prove duplicate-trigger, sender-timeout, CRM-timeout, repeated-bounce, stale-lock,
   quota-exhaustion, and restart-mid-send tests.
3. Add the outbox projection to CRM and a Gmail UID/message-id consumer.
4. Run one canary campaign with delivery disabled, then one single-contact canary.
5. Confirm one authoritative receipt with release SHA, trigger, transitions, sends,
   bounce/reply events, projection status, cost, and exception.

Until then, no feature work or new lifecycle automation should be added.
