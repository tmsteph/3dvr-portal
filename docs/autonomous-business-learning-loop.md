# Autonomous Business Learning Loop

Money Printer now treats business-building as a measured learning loop rather than a stream of generated ideas.

## Loop

1. Wake.
2. Inspect measurable evidence.
3. Choose one experiment.
4. Execute only actions permitted by the existing operation and compliance guardrails.
5. Measure the funnel and operating cost.
6. Persist the observation, including cycles where nothing happened.
7. Adapt one variable after repeated stalls.

The daemon writes this memory to `docs/money-printer-learning-ledger.json`. When `MONEY_PRINTER_EVIDENCE_DIR` is configured, it imports the existing market/autopilot/outbound evidence bundle. Without that directory it still records a wake observation, so repeated no-signal cycles are visible instead of forgotten.

## Revenue provenance

Payments are intentionally separated into three buckets:

- **Founder dollar**: useful transaction test, not external validation.
- **Friend dollar**: stronger feedback, still not unrelated demand.
- **Stranger dollar**: first real independent demand milestone.

Ten unrelated paying customers moves the ledger to **repeatable demand**.

Unattributed Stripe revenue remains unattributed until evidence classifies it. The system must not quietly relabel existing revenue as stranger revenue.

## Economics

The ledger tracks `agent_cost_cents` against a default weekly budget of $150. Revenue and operating cost are evaluated separately from demand validation. `self_sustaining` becomes true only when both costs are actually measured and measured revenue exceeds them.

If the measured weekly budget is exhausted, the next experiment automatically becomes a cost-reduction experiment rather than increasing paid activity.

## Adaptation

Three consecutive wake cycles without meaningful downstream progress trigger adaptation. The diagnosis chooses exactly one change dimension:

- no reach -> distribution
- reach but no qualified demand -> audience/message
- qualified demand but no customers -> offer
- customers but no stranger customers -> distribution outside the founder/friend network
- stranger customers below ten -> repeat the winning acquisition channel
- repeatable demand but poor economics -> economics
- repeatable, self-sustaining demand -> gradual scale

Every decision includes the rule: **change one meaningful variable per experiment and hold the rest constant long enough to measure.**

## Autonomy ladder

The learning ledger exposes a conservative autonomy level:

- **0 — observe:** research, measurement, internal artifacts.
- **1 — draft-and-test:** low-risk artifacts; external and financial actions remain gated.
- **2 — preapproved-green-actions:** after a stranger pays, only explicitly pre-approved GREEN actions may execute within budget/compliance caps.
- **3 — scale-proven-green-actions:** after ten stranger customers and positive measured economics, scale previously successful GREEN actions within budget.

Sensitive operations such as prospect outreach, pricing, billing, credentials, deployment, and auth remain gated by the existing operation/approval system.

## Running it

`npm run money-printer:daemon` records a learning wake automatically.

To import the existing evidence bundle manually:

```sh
npm run money-printer:learning -- --evidence-dir <artifact-dir> --wake
```

The CLI output includes the current milestone, stranger-customer count, stalled-cycle count, economics, autonomy level, and the next single-variable experiment.
