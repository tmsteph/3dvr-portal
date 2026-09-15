# Opportunity Inbox kernel score

The Opportunity Inbox is the demand-sensing layer of the 3DVR business kernel. It turns credible signals such as customer pain, job leads, product gaps, partnerships, and market demand into comparable opportunities without discarding provenance, consent, or positive-sum policy checks.

## Four kernel dimensions

Every opportunity can carry four 0–100 scores:

- **Fit** — alignment with the person, mission, skills, and current direction.
- **Demand** — strength of buyer evidence, urgency, confidence, and demonstrated need.
- **Effort** — execution efficiency. A higher number means the opportunity is easier or more feasible to fulfill with available capabilities.
- **Revenue** — economic upside, including likely margin and value.

The kernel-level `opportunityScore` is the geometric mean of these four dimensions. This intentionally prevents one spectacular dimension from completely hiding a severe weakness in another.

When an explicit dimension is unavailable, the engine derives a conservative fallback from the Opportunity Engine's existing alignment, fulfillment, profit, urgency, confidence, and evidence data.

## Priority and experiments

The existing search-mode economic score remains intact. Final `priorityScore` blends:

- 65% existing mode-aware economic priority
- 35% four-factor kernel opportunity score

Positive-sum policy remains a hard gate: an ineligible opportunity receives priority zero regardless of economic attractiveness.

The engine sets `experimentRecommended` when an opportunity is positive-sum, unexpired, has `priorityScore >= 60`, and has `demandScore >= 55`. This is a machine-readable handoff for the existing experiment system. It is a recommendation to create a bounded experiment, not permission to contact people, spend money, or take an irreversible action.

## Intended loop

`signal → opportunity → score → review → experiment → evidence → update score`

The goal is a self-steering but inspectable system: AI can continuously surface and rank useful opportunities while humans retain control over permissions and consequential actions.
