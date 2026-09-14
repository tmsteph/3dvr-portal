# 3DVR Opportunity Kernel

The 3DVR kernel assumes there are always more possible businesses than we can currently see. Its job is not to generate random startup ideas; its job is to repeatedly discover evidence-backed gaps between demand and supply and turn the best gaps into cheap, measurable experiments.

## Kernel invariant

> If a reachable group wants an outcome badly enough to pay, and 3DVR can assemble a trustworthy supply path with acceptable economics and risk, the opportunity is eligible for testing.

No fixed industry list is required. No founder-skill match is required in Profit mode. The supply path may be software, agents, Thomas, contractors, vendors, local operators, partners, or a combination.

## Loop

1. **Sense** — ingest permitted demand signals from first-party data, public research, customer conversations, job/service markets, search behavior, and other approved sources.
2. **Cluster** — group repeated pain by buyer, urgency, budget, location, and desired outcome.
3. **Match supply** — find an existing capability or assemble a new fulfillment path.
4. **Model economics** — estimate price, variable cost, contribution margin, time to revenue, capital required, confidence, and downside.
5. **Choose mode** — Aligned, Profit, or Portfolio.
6. **Instantiate a Venture Capsule** — create the smallest offer and falsifiable test with a budget cap, success condition, kill condition, and expiration.
7. **Execute within policy** — automate only inside the capability's current trust boundary.
8. **Measure reality** — replies, qualified demand, checkout, revenue, delivery cost, margin, defects, repeat purchase, and referrals outrank output volume.
9. **Scale or kill** — winners earn more capital and automation; weak experiments die quickly.
10. **Learn** — persist outcomes so future scans improve demand, pricing, channel, and supply decisions.

## Search modes

### Aligned

Optimize for opportunities that both make money and move the owner toward desired skills, relationships, assets, reputation, community, or mission.

### Profit

Treat personal interest as optional. Optimize for risk-adjusted expected profit, speed, capital efficiency, repeatability, and fulfillment confidence. This mode still obeys legal, ethical, platform, consent, approval, and spending boundaries.

### Portfolio

Run both deliberately. Aligned work remains the compounding core; profit-first ventures can fund the core and reveal markets we would otherwise never notice.

## Separate scores

Never collapse motivation and economics into one unexplained number. Store at least:

- `demandScore`
- `profitScore`
- `alignmentScore`
- `fulfillmentScore`
- `confidenceScore`
- `riskScore`

A high-profit, low-alignment opportunity should remain visible as such. A high-alignment, weak-economics opportunity should also remain visible without being mistaken for a business.

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
  "successCondition": "measurable proof",
  "killCondition": "precommitted failure rule",
  "expiresAt": "ISO-8601"
}
```

Capsules are cheap to create and cheap to destroy. A capsule graduates into a durable product or company only after repeated paid demand, reliable fulfillment, and healthy measured economics.

## Ranking principle

The kernel should prefer opportunities that maximize expected learning or expected contribution margin per constrained resource while penalizing uncertainty, irreversible downside, founder attention, and policy risk.

The exact weights may change by mode; the underlying evidence fields should not.

## Meaning of “unlimited startups”

“Unlimited” means **unbounded discovery**, not infinite simultaneous execution. The system can continuously discover and remember possibilities while limiting active experiments by cash, compute, founder attention, delivery capacity, and risk budgets.

That separation is essential: broad imagination at the sensing layer, ruthless scarcity at the execution layer.
