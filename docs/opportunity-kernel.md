# 3DVR Opportunity Kernel

The 3DVR kernel assumes there are always more possible businesses than we can currently see. Its job is not to generate random startup ideas; its job is to repeatedly discover evidence-backed gaps between demand and supply and turn the best gaps into cheap, measurable experiments.

## Kernel invariant

> If a reachable group wants an outcome badly enough to pay, and 3DVR can assemble a trustworthy supply path with acceptable economics, risk, and positive-sum policy, the opportunity is eligible for testing.

No fixed industry list is required. No founder-skill match is required in Profit mode. The supply path may be software, agents, Thomas, contractors, vendors, local operators, partners, or a combination.

Profit is a valid objective. It is not a bypass around consent, agency, harm, or lock-in boundaries.

## Loop

1. **Sense** — ingest permitted demand signals from first-party data, public research, customer conversations, job/service markets, search behavior, and other approved sources.
2. **Cluster** — group repeated pain by buyer, urgency, budget, location, and desired outcome.
3. **Match supply** — find an existing capability or assemble a new fulfillment path.
4. **Model economics** — estimate price, variable cost, contribution margin, time to revenue, capital required, confidence, and downside.
5. **Evaluate positive-sum policy** — estimate agency, shared value, openness, harm risk, and lock-in risk. Explicit high-risk failures may remain visible for audit but are not executable-ranked work.
6. **Choose mode** — Aligned, Profit, or Portfolio.
7. **Instantiate a Venture Capsule** — create the smallest offer and falsifiable test with a budget cap, success condition, kill condition, and expiration.
8. **Execute within policy** — automate only inside the capability's current trust boundary.
9. **Measure reality** — replies, qualified demand, checkout, revenue, delivery cost, margin, defects, repeat purchase, referrals, and participant outcomes outrank output volume.
10. **Scale or kill** — winners earn more capital and automation; weak experiments die quickly.
11. **Learn and share** — persist outcomes so future scans improve demand, pricing, channel, supply, and positive-sum judgment; return reusable knowledge to the commons when practical.

## Search modes

### Aligned

Optimize for opportunities that both make money and move the owner toward desired skills, relationships, assets, reputation, community, or mission.

### Profit

Treat personal interest as optional. Optimize for risk-adjusted expected profit, speed, capital efficiency, repeatability, and fulfillment confidence. This mode still obeys legal, ethical, platform, consent, approval, spending, and positive-sum boundaries.

### Portfolio

Run both deliberately. Aligned work remains the compounding core; profit-first ventures can fund the core and reveal markets we would otherwise never notice.

## Separate scores

Never collapse motivation, economics, and social policy into one unexplained number. Store at least:

- `demandScore`
- `profitScore`
- `alignmentScore`
- `fulfillmentScore`
- `confidenceScore`
- `riskScore`
- `agencyScore`
- `sharedValueScore`
- `opennessScore`
- `harmRiskScore`
- `lockInRiskScore`
- `positiveSumScore`
- `positiveSumEligible`

A high-profit, low-alignment opportunity should remain visible as such. A high-alignment, weak-economics opportunity should also remain visible without being mistaken for a business. Likewise, a high-profit opportunity that fails an explicit positive-sum boundary should remain visible for learning while receiving no executable ranking.

The shared executable evaluator lives in `src/kernel/positiveSum.js`. Money Printer scoring consumes that evaluator rather than inventing a separate morality layer.

## Positive-sum gate

The gate is intentionally narrow. It is not a requirement that every venture be charitable, community-owned, or immediately open source.

The current hard blockers are deliberately legible:

- severe explicit harm risk
- severe loss of participant agency
- extreme lock-in risk

Everything else remains a scored judgment that can improve with evidence. Economic scoring is retained separately as `economicScore`, so policy does not erase information about a market.

## Venture Capsule

A Venture Capsule is the kernel's disposable startup unit:

```json
{
  "mode": "aligned | profit | portfolio",
  "buyer": "who has the need",
  "demandEvidenceIds": [],
  "offer": "smallest credible paid outcome",
  "priceCents": 0,
  "estimatedVariableCostCents": 0,
  "supplyPath": [],
  "channel": "reachable acquisition path",
  "budgetCapCents": 0,
  "agencyScore": 50,
  "sharedValueScore": 50,
  "opennessScore": 50,
  "harmRiskScore": 0,
  "lockInRiskScore": 0,
  "successCondition": "measurable proof",
  "killCondition": "precommitted failure rule",
  "expiresAt": "ISO-8601"
}
```

Capsules are cheap to create and cheap to destroy. A capsule graduates into a durable product or company only after repeated paid demand, reliable fulfillment, healthy measured economics, and acceptable policy outcomes.

## Ranking principle

The kernel should prefer opportunities that maximize expected learning or expected contribution margin per constrained resource while penalizing uncertainty, irreversible downside, founder attention, policy risk, and negative participant outcomes.

The exact weights may change by mode; the underlying evidence fields should not. Positive-sum hard blockers apply before executable ranking regardless of mode.

## Meaning of “unlimited startups”

“Unlimited” means **unbounded discovery**, not infinite simultaneous execution. The system can continuously discover and remember possibilities while limiting active experiments by cash, compute, founder attention, delivery capacity, and risk budgets.

That separation is essential: broad imagination at the sensing layer, ruthless scarcity at the execution layer.

## Scheduled exploration

The existing Market Pulse scheduler is the discovery heartbeat. It runs every eight hours and defaults to **Portfolio** mode. When no market is explicitly pinned, each scheduled slot rotates through a seed portfolio of demand arenas, including service businesses, event/AV operations, freelancers/creators, manual administrative workflows, and a broad unmet-paid-demand exploration lane.

The seed portfolio is not an industry whitelist. It exists to keep the radar moving instead of repeatedly scanning one niche. Explicit market configuration can override a run, and future learning may add, remove, split, or reprioritize exploration lanes as evidence accumulates.

The scheduler should remain single-source: improve the existing Market Pulse loop rather than creating competing cron jobs that discover the same demand independently.
