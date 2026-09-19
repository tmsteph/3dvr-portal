# Runx as a governed execution boundary for 3DVR agents

3DVR already has orchestration: task routing, worker capability checks, risk classes, approval gates, leases, and a growing event/memory trail. The missing layer is a portable way to bind **what an agent is allowed to do** to **verifiable evidence of what it actually did**.

[Runx](https://runx.ai) is interesting here because it is deliberately *not* another agent framework. Its project describes a governed runtime beneath whatever agent/orchestrator is already in use: a portable `SKILL.md` carries operating judgment, an optional `X.yaml` carries machine-checkable execution/authority/evidence contracts, and execution ends in a sealed receipt. See the [Runx repository](https://github.com/runxhq/runx).

## Why that maps cleanly to 3DVR

3DVR should keep owning the human-facing intent and orchestration layer:

- decide which project or operator goal matters;
- route work to Codex, OpenClaw, local models, shell, browser, or another worker;
- apply our own autonomy/risk policy before consequential work;
- preserve user-owned context and long-term memory.

A Runx-style boundary can sit *under* that layer for acts that need stronger proof:

- narrow authority for one concrete operation instead of passing ambient trust through the whole agent chain;
- resolve credentials at the execution boundary rather than copying secrets into prompts or logs;
- run a typed skill or graph;
- seal authority, acts, artifacts, exit state, and lineage into a receipt that can be checked later.

That division matches Runx's stated invariant: `admit -> resolve grant -> deliver credentials -> execute -> seal`.

## A concrete 3DVR example

Imagine the 3DVR operator receives: “update the customer site, but stop before publishing.”

1. **3DVR orchestration** interprets the goal, loads project context, chooses a worker, and classifies the task as workspace write.
2. A portable **skill** explains the domain procedure and evidence expectations in `SKILL.md`.
3. Its **`X.yaml`** narrows the permitted filesystem/repository actions and declares the artifacts that must come back.
4. The runtime performs only admitted acts. A publish/deploy act is outside the granted scope, so it must stop or request a new approval rather than inheriting authority from the earlier edit.
5. The result is a **receipt** that can feed 3DVR's event archive and digital-organism memory as provenance, instead of recording only “agent says it succeeded.”

The same pattern could apply to GitHub merges, customer-email sends, paid API calls, infrastructure changes, or browser actions where “what was authorized?” matters as much as “what did the model say?”

## What we should not duplicate

If we experiment with Runx, 3DVR should avoid building parallel versions of things the runtime already owns:

- credential injection and secret redaction;
- authority/grant propagation;
- receipt hashing/signing/verification;
- generic process/HTTP execution plumbing;
- portable skill package parsing.

3DVR's value is higher up the stack: purpose, intent, user context, orchestration, human handoff, project state, and a friendly control plane.

## Small experiment worth trying

A good first integration is intentionally boring: wrap one existing 3DVR read-only or workspace-write task as a portable Runx skill, execute it locally, then store the sealed receipt reference beside the normal 3DVR task/event record. Compare that receipt to our current audit trail before deciding whether deeper integration earns its complexity.

That would test the part that matters: whether governed execution and receipts make our agents more portable and trustworthy **without replacing the orchestration system we already have**.
