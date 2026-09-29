# AV Booking Agent Simulation — 2026-09-29

Tested against `main` commit `fcb29fb4` in an isolated temporary worktree on the laptop.

## Baseline health

Targeted existing tests:

- Opportunity Engine: 8/8 passing.
- Work Schedule Coordinator: 7/7 passing.
- Work Agent AI extraction: 3/3 passing after a clean `npm ci`.
- AV / freelance / opportunity-focused suite: 58 passing, 2 failing, 1 cancelled.
  - one failure is a stale Opportunity Engine schema assertion (expects v4, implementation is v5);
  - one failure is an unrelated Freelance Portfolio Validation Sprint link expectation;
  - the cancelled Opportunity Inbox browser test needs the Playwright browser runtime installed.
- Full root suite: 1455 passing, 109 failing, 7 cancelled, 21 skipped.

The core AV pieces are individually useful, but the repository as a whole is not currently a clean all-green integration baseline.

## Scenario simulations

### P0 — outside-vs-outside double booking is silently lost

Scenario:

- A1 freelance call booked on 2026-10-07.
- IATSE / second outside call also booked on 2026-10-07.
- No Encore shift that day.

Observed:

- `conflicts.length === 0`
- the schedule map keeps only one outside gig for the date.

Cause:

`src/work-schedule-coordinator.js` stores outside work in a `Map<date, gig>`. A second outside gig overwrites the first. Conflict detection only compares outside work against Encore.

Risk:

The system can miss the exact double-booking problem the product is supposed to prevent.

### P0 — timestamp normalization can move a local booking to the wrong day

Scenario:

`2026-10-07T23:30:00-07:00`

Observed:

`normalizeDateKey()` returns `2026-10-08`.

Cause:

The timestamp is converted to UTC and then sliced to the UTC calendar date.

Risk:

Calendar/email connectors that supply timestamps instead of bare dates can shift late-night local work to tomorrow.

### P1 — Opportunity Engine and Freelancer pipeline disagree about availability

Scenario:

- Opportunity A: fit 95, higher value, but calendar conflict.
- Opportunity B: fit 82, lower value, calendar clear.

Observed:

Freelancer pipeline order:

1. clear-good
2. conflict-high

Opportunity Engine order:

1. conflict-high (priority 95)
2. clear-good (priority 87)

Cause:

`src/freelance-opportunity-pipeline.js` includes an availability boost/conflict penalty. `src/money-printer/opportunityEngine.js` does not consume booking availability.

Risk:

A unified Opportunity Inbox can recommend work the booking layer already knows is unavailable.

### P1 — same source record can duplicate across acquisition paths

Scenario:

The same external record `CALL-4242` enters once through an API and once through a manual forward.

Observed:

Second record is created; opportunity count becomes 2.

Cause:

Explicit-ID fingerprints include `acquisitionMode`, so `api:CALL-4242` and `manual-forward:CALL-4242` are treated as different.

Risk:

Duplicate notifications, duplicate application attempts, duplicate follow-ups.

### P1 — syndicated listings do not cluster across sources

Scenario:

The same videographer job appears on Indeed and on the production company's site with equivalent role/date/location text.

Observed:

Both become separate opportunities.

Cause:

Without a shared external ID, fingerprinting includes source label and exact evidence text.

Risk:

The worker sees duplicates and may apply twice to the same real-world call.

### P1 — expired `new` work can outrank live response-ready work

Scenario:

- expired opportunity keeps status `new`;
- live opportunity is `response-ready`.

Observed:

The expired record sorts first even with priority 0.

Cause:

`sortOpportunityClusters()` sorts status before priority, and expiration does not automatically normalize status to `expired`.

Risk:

Time-sensitive calls can be buried under stale records.

### P1 — unscoped opportunities default to Thomas

Scenario:

Create an opportunity without an owner.

Observed:

`owner === "Thomas"`.

Cause:

The Opportunity Engine has a legacy Thomas default instead of requiring `twin_id` / owner scope.

Risk:

This is a blocker for a Mark Wells pilot or any multi-user managed service. Missing scope can become cross-user contamination.

### P2 — protected commitments count as rest unless explicitly opted out

Scenario:

A busy personal appointment is passed as a protected commitment without `countsAsRestDay: false`.

Observed:

The appointment satisfies part of the weekly rest-day quota.

Cause:

The coordinator counts every protected commitment as rest unless explicitly disabled.

Risk:

The scheduler can claim the worker has enough recovery time when the “rest” day is actually occupied.

This behavior is currently tested, so this is a policy/design weakness rather than an accidental regression.

## Architecture weakness: three opportunity state models

At least three distinct models currently exist:

1. Opportunity Engine:
   `new → response-ready → experimenting/reviewing/contacted → won/passed/expired`
2. Freelancer pipeline:
   `Found → Ready → Applied → Interview → Offered → Booked/Passed/Rejected`
3. Work Agent outreach:
   `lead → drafted → awaiting_approval → sent → replied → negotiating → awaiting_booking_approval → booked/declined/closed`

The logic is individually sensible, but there is no single canonical adapter between them.

## Architecture weakness: multiple stores

Current work is spread across browser/local Work Agent state, Gun-backed Freelancer opportunities, Opportunity Engine storage/shared storage, CRM, and server-side agent/runtime state.

The product needs one canonical opportunity identity and explicit projections into each surface, not independent copies that drift.

## Recommended fix order

1. Make schedule conflict representation multi-record and time-aware.
2. Establish timezone-safe interval normalization.
3. Define a canonical `Opportunity` identity + `twin_id`.
4. Route all ingestion through one dedupe/cluster layer.
5. Make availability/conflict a first-class input to canonical ranking.
6. Add explicit state adapters for Opportunity Engine, Freelancer pipeline, and Work Agent.
7. Fix expired-item ordering and schema-version test drift.
8. Make “counts as rest” explicit by commitment type rather than defaulting true.

## Product-level invariant

A strong end-to-end acceptance test should be:

> One real AV opportunity enters from any source, is deduplicated into one canonical record, belongs to exactly one twin, is evaluated against time-aware availability, receives one explainable priority, exposes one next action, moves through one mapped lifecycle, and remains traceable to its source, communication, calendar state, and outcome.
