# Revenue worker migration

This service is the only allowed target control plane. It remains **no-send** during
cutover: it consumes replay-safe inbox/bounce evidence and drains an idempotent CRM
projection outbox, but it cannot send email, crawl, or submit forms.

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
   quota-exhaustion, and restart-mid-send tests. Sender and CRM timeout coverage is
   now deterministic; sending remains unavailable until the remaining cases pass.
3. Add the outbox projection to CRM and a Gmail UID/message-id consumer. The CRM
   outbox and replay-safe inbox state consumer are now implemented.
4. Run one canary campaign with delivery disabled, then one single-contact canary.
5. Confirm one authoritative receipt with release SHA, trigger, transitions, sends,
   bounce/reply events, projection status, cost, and exception.

Until then, no feature work or new lifecycle automation should be added.

## Legacy-history reconciliation

First produce a report; it is read-only and does not initialize the ledger:

```bash
node thomas-agent/node/revenue-history-import.js /root/.3dvr/state/autonomous-outreach/leads.csv /root/.3dvr/state/autonomous-outreach/outreach-log.ndjson
```

The timestamped outreach event log is authoritative over the leads CSV projection.
Failed attempts before an acknowledged send resolve to `sent`; a later delivery
failure notice resolves to `bounced`. Every discrepancy and its source rows remain
in the reconciliation report. Resolve every remaining conflict and invalid NDJSON
line before `--apply`. The importer records
only current historical state plus source-row provenance as `legacy_import` events;
it never fabricates lifecycle steps, sends, or projects to CRM.
