# Retrieval Lab

The Retrieval Lab makes the Digital Organism's **discover, don't encode** principle executable without letting a tiny benchmark silently change production behavior.

Instead of assuming one hand-written ranking formula is correct forever, the lab runs multiple retrieval strategies against the same evidence, measures them, and can promote a challenger only after it clears explicit safety gates.

## Strategies

The first tournament includes:

- `baseline-jaccard` — lexical/Jaccard-style ranking with importance and confidence boosts.
- `query-coverage` — rewards covering more of the user's query and matching the memory subject.
- `recency-coverage` — adds a recency signal so current-state memories can beat stale but lexically similar records.

These are intentionally simple. The important part is the interface: more strategies can be added and compared without declaring any one of them permanent architecture.

## Synthetic tournament

From `apps/agent`:

```bash
npm run organism:discover -- tournament
npm run organism:discover -- tournament --json
```

The synthetic tournament reports mean reciprocal rank (MRR) and hit@1 for every strategy. It exists to test the mechanism and candidate strategies.

**Synthetic evidence cannot promote the live retrieval selection.** `tournament --promote` is deliberately blocked. Production promotion must use real Organism evidence.

## Real evidence

The real benchmark is derived from the append-only Organism event history. Current evidence sources include:

- corrections — high-quality evidence, weight 2;
- explicit owner-approved retrievals — high-quality evidence, weight 3;
- approved Context HQ / safe task handoffs — useful low-weight evidence, weight 0.5.

The portal's **This was right** control records an owner-signed retrieval approval bound to the exact query and memory ID. Unknown or forgotten memories cannot be approved, and ordinary recall authorization cannot be replayed as approval authorization.

Inspect aggregate evidence without printing private memory bodies:

```bash
npm run organism:discover -- evidence
npm run organism:discover -- real-tournament
```

## Safe production promotion

Production evaluation can request promotion with:

```bash
npm run organism:discover -- real-tournament --promote
```

A challenger is promoted only when all of these default gates pass:

1. at least **5 real benchmark cases** exist;
2. at least **2 high-quality signals** are corrections or explicit retrieval approvals;
3. the challenger beats the current incumbent by at least **0.02 MRR**;
4. the challenger does **not regress hit@1**.

A tie keeps the incumbent. Before any selection exists, `baseline-jaccard` is the incumbent. Thresholds can be raised for experiments with `--min-cases`, `--min-high-quality`, and `--min-mrr-gain`.

When a real challenger clears all gates, promotion writes the selected strategy and evaluation record to `retrieval-strategy.json`.

## Live adaptive recall

Private Digital Organism recall now reads the promoted selection. With no promotion record it uses `baseline-jaccard`; after a gated promotion, subsequent private recall automatically uses the promoted strategy.

```bash
npm run organism:discover -- recall "what server is the agent runtime using?"
npm run organism:discover -- selected
```

This creates the evolutionary loop:

```text
experience
   ↓
real corrections + explicit approvals + safe handoffs
   ↓
candidate strategies
   ↓
frozen evaluation suite
   ↓
compare against incumbent
   ↓
promote only on meaningful improvement / otherwise keep incumbent
   ↓
more experience
```

The architecture should keep making room for better strategies: semantic embeddings, temporal models, graph traversal, learned rerankers, model-assisted retrieval, and combinations we have not designed yet.
