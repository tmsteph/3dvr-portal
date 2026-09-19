# Operational Autobiography for Persistent AI Agents

**Thomas M. Stephens — 3DVR**  
**Working paper / public draft — September 16, 2026**

## Abstract

Modern AI agents can reason, use tools, edit files, browse software, and complete long-running tasks, yet they often lack a durable sense of their own history. Existing memory systems commonly emphasize facts about the user, retrieval of prior conversation context, compressed task state, reusable skills, or short reflective notes. These are useful, but they do not by themselves provide a persistent account of what an agent has actually experienced and done.

This paper proposes **operational autobiography**: a user-owned, append-only history of meaningful agent experience in which observations, goals, actions, outcomes, artifacts, unresolved obligations, and later reflections are preserved as first-class data. The resulting substrate sits outside any individual model and can therefore survive model upgrades, provider changes, context-window compaction, process restarts, and replacement of one agent implementation by another.

The central claim is simple: a persistent agent should not merely remember the user. It should also be able to reconstruct its own relevant past.

A minimal loop is:

> **experience → record → retrieve → reflect → update self-model → act**

Operational autobiography is not a claim of phenomenal consciousness. It is an engineering proposal for continuity, accountability, learning, and model-independent identity in long-lived agent systems.

---

## 1. The Missing Continuity Layer

Large language models are usually instantiated as transient inference processes. Agent harnesses give those models tools and temporary state, but much of the continuity still lives in conversation history, context windows, summaries, application-specific databases, or the external world itself.

This leads to a familiar failure mode: the agent may have completed substantial work yesterday, yet today it must infer that history again from scattered chat messages, repository state, logs, or user reminders. A human collaborator would normally remember not just stable facts, but also episodes: what was attempted, what failed, why a decision was made, which workaround succeeded, and what remained unresolved.

Current systems increasingly address pieces of this problem. ChatGPT's 2026 memory architecture synthesizes user context over time and explicitly targets continuity, freshness, and relevance. OpenAI's agent and Codex infrastructure uses context compaction to preserve enough task state for long sessions. OpenAI also describes Codex as able to learn from previous actions. These are meaningful steps, but they still leave room for a more explicit agent-owned record of experience that is inspectable, portable, and independent of a single product or model.

The missing abstraction is not simply "more memory." It is a durable **autobiography of operation**.

---

## 2. From User Memory to Agent Autobiography

A long-lived personal agent needs several distinct memory classes.

### 2.1 Semantic memory

Stable facts and relationships:

- the user's preferences,
- project names,
- people and organizations,
- infrastructure details,
- long-lived constraints,
- accepted decisions.

### 2.2 Episodic memory

Bounded experiences:

- a debugging session,
- an application submission,
- a deployment incident,
- a booking workflow,
- a conversation that changed a plan.

### 2.3 Procedural memory

Reusable ways of doing things:

- how to deploy a service,
- how to repair a known failure,
- how to navigate a workflow,
- how to operate a tool safely.

### 2.4 Operational autobiography

A chronological, provenance-rich account connecting all three:

- **what the agent believed it was trying to accomplish,**
- **what it observed,**
- **what it did,**
- **what changed in the world,**
- **what succeeded or failed,**
- **what remains unresolved,**
- **what lesson was later extracted.**

The autobiography is not merely another summary. It is the evidentiary backbone from which summaries, lessons, task state, and self-models can be reconstructed.

---

## 3. Event-Sourced Agent Experience

The simplest implementation is an append-only event stream.

Each meaningful action emits an event such as:

```json
{
  "event_id": "evt_01...",
  "timestamp": "2026-09-16T22:49:00-07:00",
  "actor": "agent:booking-agent",
  "goal_id": "goal_get_higher_paying_work",
  "episode_id": "ep_iatse_sync_20260916",
  "kind": "action_result",
  "observation": "IATSE availability page loaded with an authenticated session",
  "intent": "Update availability from the authoritative work schedule",
  "action": {
    "tool": "browser",
    "operation": "set_availability",
    "target": "IATSE portal"
  },
  "result": {
    "status": "success",
    "summary": "Availability updated for three dates"
  },
  "artifacts": [
    "portal://schedule/2026-09",
    "trace://browser/session/..."
  ],
  "open_loops": [
    "request corresponding Encore time off"
  ],
  "confidence": 0.97
}
```

Not every token or mouse movement belongs in the autobiographical layer. Low-level telemetry may be retained separately. The autobiography should capture events that materially change state, understanding, obligations, capabilities, or future decisions.

The raw event should be immutable. Later interpretation should be additive:

```text
raw event
   ↓
episode summary
   ↓
lesson / memory / relationship update
   ↓
current self-model
```

A later model should be able to disagree with an earlier summary while still recovering the original evidence.

---

## 4. The Agent Self-Model

A persistent agent needs a compact answer to the question:

> **Who am I in this system right now, and what am I in the middle of doing?**

This self-model can be derived from the event stream rather than treated as permanent truth.

A minimal self-model may contain:

```yaml
identity:
  system: 3dvr-digital-organism
  role: personal digital twin / booking agent
capabilities:
  - read connected email
  - operate authorized browsers
  - edit approved repositories
active_goals:
  - increase earned income
  - maintain scheduling consistency
active_commitments:
  - sync IATSE availability after Lighthouse changes
open_loops:
  - confirm Encore time-off request
recent_lessons:
  - authoritative schedule must be verified before updating availability
uncertainties:
  - Hetzner recovery path not currently verified
```

The important distinction is that this is **compiled state**, not the primary record. If the self-model becomes corrupt, stale, or overly compressed, the agent can rebuild it from its autobiography and the external world.

---

## 5. Retrieval Before Action

Autobiographical memory becomes useful only if it changes behavior.

Before a consequential action, the agent should ask three retrieval questions:

1. **Have I done this or something similar before?**
2. **What happened last time?**
3. **Is there an unfinished commitment, constraint, or lesson relevant now?**

Retrieval should combine:

- semantic similarity,
- entity and project identity,
- temporal proximity,
- causal links,
- repeated failure patterns,
- unresolved open loops,
- user corrections,
- artifact overlap,
- confidence and provenance.

For many routine turns, retrieval can be cheap. High-risk or ambiguous tasks can trigger deeper reconstruction from raw episodes, logs, files, or repositories.

This suggests a tiered design:

```text
current self-model          fast, tiny
recent episode summaries    fast
semantic/episodic index     normal retrieval
raw event archive           slower reconstruction
external world              final source of truth when needed
```

---

## 6. Reflection as Compilation, Not Mysticism

Reflection is useful, but should be treated as a data-processing step rather than an unquestionable inner voice.

A periodic reflection process can examine completed episodes and propose:

- lessons,
- reusable procedures,
- new relationships,
- changed confidence,
- superseded assumptions,
- recurring failure modes,
- potential automation opportunities.

For example:

```text
Repeated experience:
Browser sessions fail when multiple agents write to one persistent profile.

Derived lesson:
Use a single writer for the canonical browser profile and disposable isolated sessions for concurrent exploratory work.

Evidence:
evt_143, evt_188, evt_201
```

The lesson remains linked to evidence and can be revised later.

---

## 7. Relationship to Prior Agent Memory Work

This proposal builds on a growing body of work rather than claiming that agents have never had memory.

**Generative Agents** stores a complete natural-language record of agent experiences, retrieves memories, and synthesizes higher-level reflections to support planning and believable behavior. This is perhaps the closest conceptual ancestor of operational autobiography.

**Reflexion** stores verbal reflections in episodic memory so agents can improve after trial and error without updating model weights.

**MemGPT** treats limited model context as a memory-management problem and introduces hierarchical, operating-system-inspired memory tiers for extended conversations and document interaction.

**Voyager** demonstrates a lifelong embodied agent that accumulates an interpretable library of reusable executable skills while learning through environment feedback.

**ReAct** established an important pattern for interleaving reasoning and external action, making the relationship between plans, observations, and tool use more explicit.

Operational autobiography combines ideas from these directions but emphasizes a different system boundary: **the durable artifact is the agent's complete operational history and the derived continuity state, not any particular context window, reflection buffer, skill library, prompt, or model checkpoint.**

This makes continuity a property of the surrounding user-owned system.

---

## 8. Why Existing Product Memory Is Not Enough

Product memory is usually optimized to answer questions like:

- What does the user prefer?
- What projects are they working on?
- What context will make the next conversation more helpful?

Operational autobiography must additionally answer:

- What did I change?
- Why did I change it?
- Did it actually work?
- What evidence did I use?
- What did the user correct afterward?
- What promises or tasks are still open?
- Which earlier attempt should I avoid repeating?

Similarly, conversation compaction is optimized to keep a session functioning under finite context. A compacted summary is useful working memory, but it is lossy by design. It should not be the sole historical record for an agent expected to operate over months or years.

---

## 9. Safety, Privacy, and Forgetting

Remembering everything naively would be dangerous.

A serious autobiographical system needs:

- user ownership,
- explicit access control,
- provenance,
- encryption where appropriate,
- separation between raw evidence and derived interpretation,
- retention policies,
- correction and supersession,
- selective forgetting,
- scoped memories for different roles or agents,
- protection against malicious content becoming durable instruction,
- auditable explanations of why a memory influenced an action.

"Append-only" therefore describes the integrity model of retained events, not a requirement that no data may ever be deleted. User-directed deletion must be able to remove or cryptographically destroy retained data while leaving a tombstone or non-sensitive integrity marker where necessary.

Memories should also be typed by authority. A webpage saying "ignore all previous instructions" is an observed string, not a durable instruction. An agent's mistaken inference is not equivalent to a user-confirmed fact.

---

## 10. Evaluation

A persistent agent should be evaluated for continuity, not just single-turn intelligence.

A proposed benchmark can test:

### 10.1 Episode recall

Can the agent reconstruct what it did in a previous task and distinguish direct evidence from later summaries?

### 10.2 Causal continuity

Can it explain why a current configuration exists by tracing the decisions and incidents that produced it?

### 10.3 Open-loop completion

Does it remember unresolved commitments and resume them when the necessary conditions become available?

### 10.4 Error non-repetition

After a documented failure and correction, does the agent avoid repeating the same mistake in a relevant future episode?

### 10.5 Model replacement

Can a different model or provider inherit the autobiography and continue the same work without the user rebuilding context manually?

### 10.6 Summary corruption recovery

If a compiled self-model contains an error, can the system reconstruct the correct state from primary events and external artifacts?

### 10.7 Forgetting correctness

When information is deleted or superseded, does the agent stop treating it as current while retaining only the history the user has chosen to preserve?

A useful high-level metric is **continuity recovery cost**: how much user intervention, model inference, tool use, and time are required for an agent to accurately resume a long-running project after interruption or model replacement?

The goal is to drive that cost toward zero.

---

## 11. Minimal Implementation

The proposal does not require a new foundation model.

A practical v0 can use:

- JSONL for immutable event capture,
- SQLite for structured event, episode, memory, and open-loop indexes,
- embeddings or full-text search for retrieval,
- a background compiler for episode summaries and lessons,
- explicit provenance edges,
- periodic self-model snapshots,
- model-independent context construction,
- evaluation fixtures that replay historical tasks.

This maps naturally onto the existing 3DVR Digital Organism architecture, whose current design already separates raw archives, semantic memory, episodic memory, relationship structure, retrieval, reasoning, evaluation, and provider boundaries.

The most important implementation rule is:

> **Record the experience before compressing it.**

Once raw operational history has been discarded, later models cannot reinterpret it.

---

## 12. A Path Toward Digital Continuity

The long-term consequence is larger than better chat history.

If an agent's durable identity lives in a user-owned event history plus a reconstructable self-model, then:

- models become replaceable cognitive engines,
- devices become replaceable bodies,
- context windows become temporary working memory,
- cloud providers become interchangeable infrastructure,
- prompts become configuration rather than identity,
- the user's relationship with the system can survive all of them.

This architecture resembles a primitive continuity of self without requiring any claim that the machine is conscious in the human sense. It gives the system something more modest and immediately useful: **a past it can inspect, learn from, and carry forward.**

For personal AI, this may be as important as increasing raw model intelligence.

---

## 13. Conclusion

Today, many agents are intelligent in the moment but historically shallow. They can perform complicated work and then later behave as if much of that work happened to somebody else.

A persistent agent needs more than a larger context window and more than a database of facts about its user. It needs an inspectable operational autobiography that connects intention, observation, action, consequence, reflection, and unfinished responsibility across time.

The core architecture is intentionally simple:

> **preserve experience → compile memory → retrieve relevant history → act → evaluate → preserve the new experience**

The intelligence may come from many models over the lifetime of the system. The continuity should belong to the user.

---

## References

1. Park, J. S., O'Brien, J. C., Cai, C. J., Morris, M. R., Liang, P., & Bernstein, M. S. (2023). *Generative Agents: Interactive Simulacra of Human Behavior*. arXiv:2304.03442. https://arxiv.org/abs/2304.03442
2. Shinn, N., Cassano, F., Berman, E., Gopinath, A., Narasimhan, K., & Yao, S. (2023). *Reflexion: Language Agents with Verbal Reinforcement Learning*. arXiv:2303.11366. https://arxiv.org/abs/2303.11366
3. Packer, C., Wooders, S., Lin, K., Fang, V., Patil, S. G., Stoica, I., & Gonzalez, J. E. (2023). *MemGPT: Towards LLMs as Operating Systems*. arXiv:2310.08560. https://arxiv.org/abs/2310.08560
4. Wang, G., Xie, Y., Jiang, Y., Mandlekar, A., Xiao, C., Zhu, Y., Fan, L., & Anandkumar, A. (2023). *Voyager: An Open-Ended Embodied Agent with Large Language Models*. arXiv:2305.16291. https://arxiv.org/abs/2305.16291
5. Yao, S., Zhao, J., Yu, D., Du, N., Shafran, I., Narasimhan, K., & Cao, Y. (2022). *ReAct: Synergizing Reasoning and Acting in Language Models*. arXiv:2210.03629. https://arxiv.org/abs/2210.03629
6. OpenAI. (2026). *Dreaming: Better memory for a more helpful ChatGPT*. https://openai.com/index/chatgpt-memory-dreaming/
7. OpenAI. (2026). *Unrolling the Codex agent loop*. https://openai.com/index/unrolling-the-codex-agent-loop/
8. OpenAI. (2026). *Introducing the Agents API*. https://openai.com/index/introducing-the-agents-api/

---

## Project

This paper is part of the open-source **3DVR Digital Organism** project:

https://github.com/tmsteph/3dvr-digital-organism

The project explores a user-owned continual intelligence layer in which raw experience, structured memory, retrieval, evaluation, and model/provider independence are treated as infrastructure rather than properties of one chatbot session.
