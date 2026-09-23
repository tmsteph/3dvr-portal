# Life Event Stream

The Digital Organism now has two deliberately different forms of history:

1. **Life events** — immutable evidence about what happened.
2. **Memories** — compiled, revisable state used for retrieval and reasoning.

This distinction keeps the organism honest. A future model can reinterpret old experience without rewriting the original record.

## Local files

By default the owner-scoped local state lives under:

```text
~/.3dvr/state/organism/events.jsonl
~/.3dvr/state/organism/memories.jsonl
```

`events.jsonl` is append-only raw autobiography. `memories.jsonl` is the existing append-only memory history containing remembers, corrections, forgetting, and retrieval evidence.

## Event shape

A minimal event looks like:

```json
{
  "id": "evt_...",
  "kind": "decision",
  "actor": "owner",
  "content": "Framework is the practical reference laptop for Open Personal Computing.",
  "tags": ["hardware", "open-personal-computing"],
  "sourceType": "conversation",
  "sourceId": "chat-...",
  "occurredAt": "2026-09-22T21:30:00.000Z",
  "recordedAt": "2026-09-23T04:30:02.000Z"
}
```

The schema is intentionally small. Richer relationships should be discovered or compiled from preserved experience instead of being required at capture time.

## Commands

```bash
# Capture something that happened. This does not automatically become trusted memory.
npm --prefix apps/agent run organism -- event \
  --kind milestone \
  --tags organism,history \
  "Shipped the first life-event stream."

# Browse/search preserved experience locally.
npm --prefix apps/agent run organism -- timeline "organism history"

# Deliberately compile an event into active memory.
npm --prefix apps/agent run organism -- promote \
  --subject architecture \
  evt_123456789abc
```

Promotion preserves the event id as memory provenance using `sourceType=life-event`. The same event cannot be silently promoted twice.

## Branches of self

A future/past/builder/father/dreamer "self" should **not** own a forked copy of the life history.

Instead, a self is a **lens over the same event stream**:

```text
immutable life events
        ↓
  retrieval / compiler
        ↓
named self lens
        ↓
context + model
```

Examples:

- `future` — emphasizes trajectories, unresolved commitments, and long-range consequences.
- `builder` — emphasizes shipped artifacts, blockers, technical decisions, and next actions.
- `father` — emphasizes family stories, values, lessons, and memories intended for descendants.
- `dreamer` — emphasizes speculative ideas, symbolism, art, and questions that should not be prematurely discarded.

The lens may change. The evidence underneath it must not.

That makes "branches of self" closer to Git branches made from one immutable history than separate AI personalities with isolated memories.

## Next slice

The next useful layer is a memory compiler that can propose durable memories from events while keeping promotion inspectable and reversible. After that, named lenses can compete in evaluation just like retrieval strategies do today.
