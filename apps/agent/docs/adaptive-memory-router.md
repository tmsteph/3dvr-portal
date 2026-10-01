# Adaptive Memory Router Experiment

This experiment tests a Habitus-inspired idea inside the 3DVR agent without replacing the current orchestrator or giving memory authority to execute actions.

## Why this exists

The current 3DVR task orchestrator chooses an executor from task semantics and available capabilities. That is deterministic and safe, but it does not learn from verified outcomes over time.

The adaptive router adds a small learning substrate with four rules:

1. **Canonical evidence is append-only.** Corrections supersede old records rather than rewriting them.
2. **Recall has a factual safety rail.** Direct lexical recall is returned before associative expansion.
3. **Tool habits are relative, not absolute.** Tool preferences are normalized with softmax so total preference mass remains conserved.
4. **No receipt, no learning.** A model's claim that an action succeeded cannot reinforce a route. A verified external receipt is required.

The topology borrows the useful six-way causal split from Habitus-AI:

- input: `HEAR`, `SEE`, `NOTICE`
- output: `SPEAK`, `LOOK`, `DO`

This implementation is original 3DVR code and intentionally much smaller. It does not copy Habitus internals or attempt its full dual-graph architecture.

## What is implemented

`thomas-agent/node/adaptive-memory-router.js` provides:

- append-only in-memory canonical records and explicit supersession;
- direct + associative lexical recall;
- six-trunk stimulus/effect classification;
- manually registered tool nodes;
- semantic tool ranking plus recency and learned preference;
- conserved relative tool weights;
- receipt-gated positive and negative reinforcement;
- duplicate receipt protection;
- serializable snapshots.

The initial version deliberately uses deterministic lexical scoring rather than embeddings. This makes the experiment cheap, transparent, and easy to benchmark before adding a vector store.

## Safety boundary

The router **recommends** a tool. It never executes one.

Execution remains behind the existing 3DVR authority/risk gates. The eventual integration should run in `shadow` mode first: compare the current orchestrator's backend/tool choice with the adaptive router's recommendation, log both, and reinforce only after a real connector or executor returns a verified receipt.

## Suggested next experiment

Register the existing 3DVR execution surfaces as tool nodes:

- GitHub / Codex -> `DO` for repository mutations, `LOOK` for reads
- Gmail -> `LOOK` for inbox reads, `SPEAK` for outbound messages
- Calendar -> `LOOK` for schedule reads, `DO` for event changes
- browser -> `LOOK` by default, `DO` when forms or external state change
- shell / server -> `LOOK` for inspection, `DO` for mutations

Then run a shadow benchmark over real tasks:

1. route every task with the existing orchestrator;
2. ask the adaptive router for its ranked tool list;
3. record which tool actually succeeded;
4. attach a connector/executor receipt;
5. reinforce only the verified route;
6. measure top-1 accuracy, fallback rate, unnecessary LLM/tool-schema tokens, and unsafe-route attempts.

The experiment should graduate only if it improves tool selection without reducing the existing safety guarantees.

## Tests

`test/adaptive-memory-router.test.js` checks:

- all six trunks;
- immutable correction history;
- direct recall safety rail;
- refusal to learn without a receipt;
- preference learning with conserved total weight;
- semantic relevance overriding a learned habit when a task clearly calls for another tool.

Run from `apps/agent`:

```bash
node --test test/adaptive-memory-router.test.js
```

The full package test command already runs `test/*.test.js`, so this experiment is automatically included in the normal agent test suite.

## Upstream inspiration

Habitus-AI: `munch2u-a11y/Habitus-AI` (Apache-2.0).

The architectural ideas worth preserving are the separation of evidence from routing, direct recall as a factual safety rail, conserved edge preferences, and verified-outcome learning. 3DVR should keep those principles even if the eventual implementation uses a different graph/database/vector stack.
