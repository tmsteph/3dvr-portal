# Retrieval Lab

The Retrieval Lab makes the Digital Organism's **discover, don't encode** principle executable without destabilizing the production memory path.

Instead of assuming one hand-written ranking formula is correct forever, the lab runs multiple retrieval strategies against the same labeled benchmark and lets evaluation choose the winner.

## Strategies

The first tournament includes:

- `baseline-jaccard` — the current lexical/Jaccard-style ranking with importance and confidence boosts.
- `query-coverage` — rewards covering more of the user's query and matching the memory subject.
- `recency-coverage` — adds a recency signal so current-state memories can beat stale but lexically similar records.

These are intentionally simple. The important part is the interface: more strategies can be added and compared without declaring any one of them permanent architecture.

## Run a tournament

From `apps/agent`:

```bash
npm run organism:discover -- tournament
```

For machine-readable results:

```bash
npm run organism:discover -- tournament --json
```

The tournament reports mean reciprocal rank (MRR) and hit@1 for every strategy.

## Promote the winner

```bash
npm run organism:discover -- tournament --promote
```

Promotion writes the evaluated winner and its scores to the organism state directory as `retrieval-strategy.json`.

This does not silently change the existing production `organism recall` path yet. It changes **adaptive lab recall**, giving us a safe promotion boundary while the benchmark grows beyond synthetic cases.

## Use the promoted strategy

```bash
npm run organism:discover -- recall "what server is the agent runtime using?"
npm run organism:discover -- selected
```

Adaptive recall loads the promoted strategy and applies it to the owner's active organism memories. With no promotion record, it falls back to `baseline-jaccard`.

## Why the separation matters

A tiny synthetic benchmark is enough to prove the mechanism, not enough to justify automatically replacing production retrieval. The next step is to collect labeled retrieval examples from real successful and corrected interactions, then make production promotion conditional on beating the current strategy across that frozen evaluation set.

That gives the organism a real evolutionary loop:

```text
experience
   ↓
candidate strategies
   ↓
frozen evaluation suite
   ↓
measure
   ↓
promote winner / keep incumbent
   ↓
more experience
```

The architecture should keep making room for better strategies: semantic embeddings, temporal models, graph traversal, learned rerankers, model-assisted retrieval, and combinations we have not designed yet.
