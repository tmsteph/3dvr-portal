# Digital Organism

The Digital Organism is the user-owned memory and reasoning boundary for the 3DVR agent.

## Canonical home

The working runtime lives in the `3dvr-portal` monorepo under `apps/agent`. This is intentional: the agent already owns local execution, model routing, Context HQ, worker processes, and device/server installation.

The standalone `tmsteph/3dvr-digital-organism` repository is an architectural reference and future extraction target. It should not grow into a second competing runtime while the design is still changing quickly.

## Non-negotiable rule

**Memory belongs to the user. Models are replaceable compute.**

The organism stores durable memory outside model weights and never chooses a remote model implicitly. A person can inspect the exact retrieved context before asking any model to reason over it.

## Storage

The first integrated version uses an append-only JSONL event log at:

```text
~/.3dvr/state/organism/memories.jsonl
```

Events record remembers, corrections, and forgetting. Active memory is reconstructed from that history, so correction/deletion semantics remain auditable without rewriting prior events.

This is deliberately simple. Encryption, richer indexing, Context HQ ingestion, sync, and semantic retrieval can be added after the recall/evaluation loop proves useful.

## Commands

From the monorepo root:

```bash
npm --prefix apps/agent run organism -- remember --subject infrastructure "The primary worker is the DigitalOcean node."
npm --prefix apps/agent run organism -- recall "Which worker do we use?"
npm --prefix apps/agent run organism -- context "Which worker do we use?"
npm --prefix apps/agent run organism -- eval
```

`recall` and `context` are local-only.

Reasoning requires an explicit provider:

```bash
# Existing local llama.cpp server used by the agent
npm --prefix apps/agent run organism -- ask --provider llama "Which worker do we use?"

# Any explicitly configured OpenAI-compatible endpoint, including a local one
npm --prefix apps/agent run organism -- ask \
  --provider compatible \
  --url http://127.0.0.1:11434 \
  --model YOUR_LOCAL_MODEL \
  "Which worker do we use?"
```

If no provider is selected, `ask` fails rather than transmitting personal context anywhere.

## Next integration

1. Import approved Context HQ session handoffs as provenance-bearing memories.
2. Feed conversation exports through a memory compiler instead of storing whole chats as durable facts.
3. Add encrypted owner-scoped sync between the DigitalOcean, Hetzner, OVH, phone, and laptop nodes.
4. Route agent tasks through the organism context builder before any hosted or local model call.
5. Keep evaluations provider-neutral so models can be promoted or replaced on measured quality, cost, latency, and privacy.
