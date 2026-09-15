# Boring Money Lane

The Boring Money lane is the cash-flow counterweight to visionary opportunity discovery.

Its job is simple: find painful, already-budgeted problems that can be solved quickly, sell the smallest useful version first, learn from real buyers, and compound what works.

## Principle

**Dream big. Earn small. Learn fast. Compound.**

The lane intentionally rewards:

- obvious pain,
- willingness to pay,
- fast/manual-first delivery,
- a reasonable competitive opening.

Novelty is a minor input. A dependable $250 service can outrank a fascinating platform that takes months to validate.

## Existing-loop integration

This is not a second daemon. `runMoneyLoop()` now produces a `boringMoneyLane` package from the same ranked opportunity set already used by Money Printer.

That package contains:

- the highest-scoring boring-money candidate,
- a tiny paid offer,
- a one-page landing-page brief,
- target-list criteria and channels,
- a 48-hour manual-first validation experiment,
- internal next actions.

The lane can later consume richer Opportunity Inbox evidence without changing its contract.

## Safety and authority

The lane may prepare work automatically. It does **not** automatically:

- publish a landing page,
- contact external people,
- spend money.

Those actions remain approval-gated. Automatic spend is fixed at `$0`.

This keeps opportunity discovery autonomous while preserving the kernel's positive-sum and operator-control boundaries.

## Readiness gate

A candidate is marked `ready-for-bounded-test` when:

- boring-money score is at least 65,
- pain score is at least 60,
- willingness to pay is at least 55,
- speed to build/deliver is at least 55.

Otherwise it remains in `research`.

## Next step

Wire approved demand sources into the lane's target-list builder, then let the existing scheduled Money Printer loop emit the best bounded experiment into the Opportunity Inbox for review and execution.
