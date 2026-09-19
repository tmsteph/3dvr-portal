# Architecture Seed

## Goal

Create a personal intelligence system that improves continuously without treating every new statement as a permanent neural-weight update.

The design separates three timescales:

- **Immediate:** raw events are archived.
- **Continuous:** durable memories are extracted, linked, ranked, corrected, and retrieved.
- **Periodic:** high-quality examples are turned into training data and evaluated before a new adapter/model is promoted.

## Discovery-First Architecture

The Digital Organism follows a design lesson from Rich Sutton's 2019 essay [*The Bitter Lesson*](https://www.incompleteideas.net/IncIdeas/BitterLesson.html): systems built around general methods that can exploit more computation, search, learning, and experience tend to keep improving after hand-crafted domain-specific approaches plateau.

Our shorthand is:

> **Discover, don't encode.**

This does **not** mean removing human judgment. Humans should strongly define the organism's purpose, permissions, safety boundaries, ownership model, interfaces, and evaluation criteria. What we should resist is continuously adding brittle rules that attempt to encode the contents of intelligence itself.

Architecture decisions should therefore favor components that can improve as resources grow:

- preserve raw experience instead of retaining only today's summary of it,
- make retrieval and search general-purpose capabilities,
- learn rankings, relationships, abstractions, and workflows from evidence where practical,
- keep learned structures revisable rather than treating an ontology as permanent truth,
- compare strategies through evaluation instead of assuming a designer's preferred method is best,
- make additional compute, models, data, and agents useful without requiring a redesign,
- keep model/provider boundaries small so stronger reasoning engines can be substituted over time.

A useful test for a new feature is: **does this help the organism discover better behavior, or are we manually encoding behavior that a sufficiently general search/learning/evaluation loop should eventually discover?**

Hand-designed structure remains justified when it improves safety, ownership, auditability, interoperability, or bootstrapping. It should be treated as scaffolding whenever possible, not as the final representation of intelligence.

## Data Flow

```text
conversation / email / task / code / calendar / device event
                         │
                         ▼
                  append-only archive
                         │
                         ▼
                  memory compiler
                         │
       ┌─────────────────┼──────────────────┐
       ▼                 ▼                  ▼
 semantic memory    episodic memory    relationship graph
       └─────────────────┼──────────────────┘
                         ▼
                   context builder
                         │
                         ▼
                  reasoning model
                         │
                         ▼
             response + feedback + trace
                         │
                         ├──> archive / memory updates
                         └──> evaluation / training pool
```

## Memory Record v0

A memory should be an inspectable object, not a hidden blob.

```json
{
  "id": "mem_...",
  "kind": "decision | fact | preference | person | project | task | relationship | lesson",
  "subject": "...",
  "content": "...",
  "source": {
    "type": "conversation",
    "source_id": "...",
    "timestamp": "..."
  },
  "valid_from": "...",
  "valid_until": null,
  "confidence": 0.95,
  "importance": 0.7,
  "supersedes": null,
  "tags": [],
  "embedding_ref": null
}
```

Important rule: **the original source stays available.** Summaries can be wrong; provenance lets the organism recover.

This is also a discovery requirement: future compilers and models should be able to reinterpret old experience rather than being permanently limited by the abstractions chosen when an event was first ingested.

## Retrieval

Retrieval should combine:

1. semantic similarity,
2. named entities/projects,
3. recency,
4. importance,
5. temporal validity,
6. relationship distance,
7. explicit pinned/canonical memories.

The context builder should return both the selected memories and a machine-readable explanation of why each was selected.

These inputs are a bootstrap, not a sacred final ranking formula. As evaluation data grows, the organism should be able to learn better retrieval strategies while preserving inspectability and owner control.

## Forgetting and Correction

Memory must support:

- explicit deletion,
- superseding an old fact,
- expiration of short-lived state,
- conflict detection,
- keeping historical truth without presenting it as current truth.

Deleting a memory should not require retraining the entire model. This is a major reason long-term facts live outside model weights.

## Training Loop

Training is downstream of memory, not a replacement for it.

Candidate examples can come from interactions where:

- the user explicitly approved/corrected an answer,
- a task was successfully completed,
- retrieved context clearly improved the response,
- a stable style/workflow pattern repeats many times.

A training job produces an adapter/checkpoint candidate. It is tested against a frozen evaluation suite before promotion.

```text
production interactions
       ↓
curated examples
       ↓
train candidate
       ↓
run eval suite
       ↓
compare to current model
       ↓
 promote / reject / rollback
```

Over time, the same evaluation discipline should be applied beyond model weights: retrieval algorithms, memory compilers, planning strategies, tool-selection policies, and multi-agent coordination should compete against measured outcomes rather than becoming permanent because they were hand-designed first.

## Evaluation Seed

The first evaluation suite should test:

- recall of stable facts,
- distinction between old and current facts,
- project continuity,
- resistance to invented memories,
- correct use of provenance,
- honoring a user's request to forget something,
- useful behavior when memories conflict,
- model/provider swaps without memory loss.

Longer term, evaluations should also measure whether increased compute or additional search actually improves results. A component that cannot benefit from better models, more search, more experience, or more compute should be treated cautiously unless it exists for a clear safety or ownership reason.

## v0.1 Implementation Shape

Keep it boring and portable initially:

- Python service
- SQLite as canonical structured store
- FTS/vector extension or separate vector index
- JSONL append-only raw event archive
- HTTP/CLI ingest and retrieval endpoints
- provider-neutral model adapter interface

A graph database can come later if relationship queries justify the operational cost. The schema should remain graph-friendly from day one.

This simplicity is deliberate: the seed should provide general mechanisms and strong evaluation hooks without prematurely freezing a complicated theory of how personal intelligence must be represented.

## Long-Term Direction

Eventually the Digital Organism can coordinate memory from conversations, code repositories, email, calendars, files, devices, and agents. Local/open-weight models can handle background compilation while stronger remote models can be invoked for difficult reasoning.

Multiple models or agents should eventually be able to explore alternative plans, retrieval strategies, and interpretations, with results selected through evidence and evaluation rather than a permanently hand-coded hierarchy.

The valuable artifact is not any one model checkpoint—or any one ontology, prompt, or workflow. It is the **continuously improving, user-owned intelligence substrate** that survives model changes and becomes more capable as computation and experience grow.
