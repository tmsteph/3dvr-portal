# 3DVR Executive Operator

The Money Printer Executive Agent is the model-independent CEO/COO layer for 3DVR. Its job is not to answer every prompt or maximize activity. It keeps a durable direction, applies founder taste, remembers decisions, and chooses the next bounded action.

## Durable state

`npm run money-printer -- init` creates private runtime state under `.money-printer/executive/`:

- `profile.json` — mission, north star, current direction, strategic priorities, taste, anti-patterns, decision rubric, and authority boundaries.
- `feedback.jsonl` — founder approvals, rejections, preferences, and avoid rules. Recent feedback is injected into future model calls.
- `decisions.jsonl` — durable executive precedent: decision, rationale, next action, confidence, and what not to do.

The state stays outside Git so the operator can learn without publishing private operating history.

## Steering the executive

```bash
npm run money-printer -- executive
npm run money-printer -- executive direction "Run one coherent workflow end to end"
npm run money-printer -- executive feedback prefer "One obvious action per screen"
npm run money-printer -- executive feedback avoid "Do not add concept pages without a working loop"
npm run money-printer -- executive decisions --limit 10
```

The next Executive Agent, Founder Brief, opportunity, connector-plan, and Codex prompt receives the constitution plus recent feedback and decisions as context.

## Model routing

Routine model work uses `MONEY_PRINTER_MODEL`. High-level executive decisions automatically use `MONEY_PRINTER_REASONING_MODEL` when configured. This keeps the operating layer model-independent while reserving stronger models for direction, portfolio, kill-or-scale, and system-improvement decisions.

## Safety

The executive constitution does not bypass connector guardrails. GREEN work may be bounded and reversible. YELLOW work is prepared for review. RED actions stay blocked unattended, including money movement, user-data deletion, DNS changes, irreversible production changes, legal commitments, and mass outreach.

## Server loop

```bash
npm run money-printer:supervisor -- --ai
```

Every Executive Agent daemon cycle records an executive decision before planning connector operations. If no model credentials are present, the deterministic fallback still follows the persistent direction and taste profile rather than reverting to generic startup advice.
