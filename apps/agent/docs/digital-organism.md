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

This is deliberately simple. Encryption, richer indexing, sync, and semantic retrieval can be added after the recall/evaluation loop proves useful.

## Commands

From the monorepo root:

```bash
npm --prefix apps/agent run organism -- remember --subject infrastructure "The primary worker is the DigitalOcean node."
npm --prefix apps/agent run organism -- recall "Which worker do we use?"
npm --prefix apps/agent run organism -- context "Which worker do we use?"
npm --prefix apps/agent run organism -- import-context
npm --prefix apps/agent run organism -- eval
```

`recall`, `context`, and `import-context` are local memory operations.

### Context HQ bridge

`import-context` reads approved Context HQ session handoffs and turns them into provenance-bearing organism memories. The session id becomes the source id, and the project, summary, decisions, open loops, artifacts, and original timestamp remain attached to the durable memory.

Imports are idempotent by provenance. Re-running the command does not duplicate a session. A previously imported memory that the owner explicitly forgot is also not resurrected on a later import; its historical provenance remains in the append-only log so that choice can be honored.

### Agent task bridge

The task orchestrator can retrieve Organism context before dispatching work:

```bash
# Local retrieval and prompt preview only; nothing is executed.
3dvr agent task --backend openclaw --memory "Continue the portal architecture"

# Memory-bearing execution must name the executor explicitly.
3dvr agent task --backend codex --memory --execute "Continue the portal architecture"
```

`--memory` performs retrieval locally. If execution is requested while the backend is still `auto`, the task is refused. This prevents personal memory from being silently attached to a prompt and sent to whichever hosted or CLI provider happened to win automatic routing.

Memory is also marked as subordinate reference material in the generated prompt: retrieved records cannot override the current user task, safety rules, or execution policy.

Reasoning through the Organism itself also requires an explicit provider:

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

## Existing memory surfaces

The portal already contains several useful memory-like surfaces. They should converge through adapters instead of being rewritten into one giant subsystem:

- **Context HQ** — deliberate organizational/session handoffs. Already imports into the Organism.
- **Memory Capture** — fast conversational notes plus CRM/proposal inference. Keep its capture workflow, but publish approved durable facts to the Organism with capture provenance.
- **Workspace project memory** — encrypted owner/project goals, constraints, decisions, links, and thread handoffs. Keep project scoping and encryption; expose selected project memories to the Organism through an owner-scoped bridge.
- **Executive constitution** — mission, strategic priorities, taste, anti-patterns, decision rubric, and authority boundaries. Treat this as policy/identity context rather than ordinary factual memory so recall cannot accidentally override governance.
- **Raw task/model/tool output** — execution evidence, not trusted memory. Promote only through deliberate handoffs or a future evaluated memory compiler.

The convergence rule is: **preserve the source workflow, normalize provenance at the boundary, and let the Organism become the retrieval layer.**

## Next integration

1. Feed conversation exports through a memory compiler instead of storing whole chats as durable facts.
2. Bridge approved Memory Capture and Workspace project-memory records into the Organism without weakening their existing owner/project boundaries.
3. Add encrypted owner-scoped sync between the DigitalOcean, Hetzner, OVH, phone, and laptop nodes.
4. Upgrade lexical retrieval with semantic and temporal ranking while retaining explainability.
5. Keep evaluations provider-neutral so models can be promoted or replaced on measured quality, cost, latency, and privacy.
