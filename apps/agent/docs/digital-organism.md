# Digital Organism

The Digital Organism is the user-owned memory and reasoning boundary for the 3DVR agent.

## Canonical home

The working runtime lives in the `3dvr-portal` monorepo under `apps/agent`. This is intentional: the agent already owns local execution, model routing, Context HQ, worker processes, and device/server installation.

The standalone `tmsteph/3dvr-digital-organism` repository is an architectural reference and future extraction target. It should not grow into a second competing runtime while the design is still changing quickly.

## Non-negotiable rule

**Memory belongs to the user. Models are replaceable compute.**

The organism stores durable memory outside model weights and never chooses a remote model implicitly. A person can inspect the exact retrieved context before asking any model to reason over it.

## Design rule: discover, don't encode

The Digital Organism is also guided by Rich Sutton's 2019 essay [*The Bitter Lesson*](https://www.incompleteideas.net/IncIdeas/BitterLesson.html).

General mechanisms that can benefit from more computation, search, learning, and experience should be preferred over increasingly elaborate hand-authored intelligence. Human judgment remains essential for purpose, permissions, safety boundaries, ownership, interfaces, and evaluations; the organism should increasingly discover useful memories, relationships, strategies, abstractions, and workflows from evidence.

Practical consequences:

- preserve source experience so future models can reinterpret it,
- keep retrieval/search general and measurable,
- treat today's schemas and ranking rules as revisable scaffolding,
- evaluate competing memory, retrieval, planning, and learning strategies instead of permanently blessing the first hand-designed one,
- keep model boundaries small enough to benefit from stronger or cheaper compute over time,
- avoid complexity that prevents the system from scaling with additional data, models, agents, or computation.

A useful architecture test is: **are we building machinery that can discover better behavior, or manually encoding behavior that the machinery should eventually learn to discover?**

## Storage

The first integrated version uses an append-only JSONL event log at:

```text
~/.3dvr/state/organism/memories.jsonl
```

Events record remembers, corrections, and forgetting. Active memory is reconstructed from that history, so correction/deletion semantics remain auditable without rewriting prior events.

This is deliberately simple. Encryption, richer indexing, cross-node sync, and semantic retrieval can be added after the recall/evaluation loop proves useful.

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

### Continuous server sync

The persistent agent host runs `organism-sync.js` through `ask-organism-sync-daemon`. By default it checks Context HQ every 300 seconds and imports any new deliberate handoffs into the local Organism store.

```bash
apps/agent/thomas-agent/scripts/ask-organism-sync-daemon status
apps/agent/thomas-agent/scripts/ask-organism-sync-daemon run-now
```

The worker lifecycle starts and stops this daemon with the Context router, and the agent supervisor health-checks both services so a crashed memory bridge or routing process can be restarted automatically.

The sync heartbeat publishes only operational metadata such as imported/skipped counts and the state directory. Memory bodies are not copied into heartbeat telemetry.

Configure the interval with:

```bash
THREEDVR_ORGANISM_SYNC_INTERVAL_SECONDS=300
```

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

## Worker trust boundary

Queue records may declare extra requirements, but they cannot use that field to hide the executor they actually request. Concrete backends such as `shell`, `codex`, or `openai` must also be present in the worker's own capability allowlist before the task can be claimed.

Deployment verification uses the intrinsic `health` backend. A health task is read-only and completes inside the queue worker without invoking a shell, model, or external provider. This lets deployment prove that the persistent SQLite queue is actually being consumed without granting extra production authority just for CI.

## Existing memory surfaces

The portal already contains several useful memory-like surfaces. They should converge through adapters instead of being rewritten into one giant subsystem:

- **Context HQ** — deliberate organizational/session handoffs. Already imports continuously into the Organism on the persistent worker.
- **Memory Capture** — fast conversational notes plus CRM/proposal inference. Keep its capture workflow, but publish approved durable facts to the Organism with capture provenance.
- **Workspace project memory** — encrypted owner/project goals, constraints, decisions, links, and thread handoffs. Keep project scoping and encryption; expose selected project memories to the Organism through an owner-scoped bridge.
- **Executive constitution** — mission, strategic priorities, taste, anti-patterns, decision rubric, and authority boundaries. Treat this as policy/identity context rather than ordinary factual memory so recall cannot accidentally override governance.
- **Raw task/model/tool output** — execution evidence, not trusted memory. Promote only through deliberate handoffs or a future evaluated memory compiler.

The convergence rule is: **preserve the source workflow, normalize provenance at the boundary, and let the Organism become the retrieval layer.**

## Next integration

1. Feed conversation exports through a memory compiler instead of storing whole chats as durable facts.
2. Bridge approved Memory Capture and Workspace project-memory records into the Organism without weakening their existing owner/project boundaries.
3. Add encrypted owner-scoped sync between the DigitalOcean, Hetzner, OVH, phone, and laptop nodes.
4. Upgrade lexical retrieval with semantic and temporal ranking while retaining explainability, then evaluate learned ranking strategies against the bootstrap rules.
5. Keep evaluations provider-neutral so models can be promoted or replaced on measured quality, cost, latency, and privacy.
6. Extend the evaluation loop to compare memory compilers, retrieval strategies, planning methods, and agent coordination—not only model checkpoints.
