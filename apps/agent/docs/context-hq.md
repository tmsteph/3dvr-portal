# Context HQ

Context HQ adapts the useful parts of Alex Dobrenko's Claude Code workflow to the existing 3DVR Agent architecture without creating a second task system.

Inspiration:
- https://botharetrue.com/tech-notes/claude-code-chief-of-staff-workflow/
- https://codeforcreatives.com/workshop/

## What we borrowed

### Session Memory -> explicit session handoffs

Alex's workflow gets continuity by writing durable session context to files. 3DVR already has an owner-scoped GunJS coordination layer, so Context HQ stores compact handoffs there instead of creating another filesystem database.

A handoff can contain:
- project
- summary
- decisions
- open loops
- artifacts
- source

The important rule is that durable memory is **explicit**. External pages, emails, transcripts, and model output are inputs; they are not automatically promoted into trusted memory.

Example:

```sh
npm --prefix apps/agent run context -- session \
  --project portal \
  --decisions "Reuse the existing task queue." \
  --open-loops "Connect the sweep to a scheduler after manual use proves valuable." \
  "Added Context HQ session handoffs and agent messaging."
```

List recent handoffs:

```sh
npm --prefix apps/agent run context -- sessions
```

## Agent Bus -> owner-scoped messages

Context HQ adds a small message bus under the existing owner-scoped GunJS tree. Messages can target one device/agent or `all`, carry a topic and priority, and be acknowledged.

```sh
npm --prefix apps/agent run context -- send \
  --from sales-agent \
  --to do-worker \
  --topic customer \
  "A customer replied; review before the next outreach action."

npm --prefix apps/agent run context -- inbox --to do-worker
npm --prefix apps/agent run context -- ack --id MESSAGE_ID
```

This is coordination, not a chat product. Keep messages short and action-oriented.

## Morning Sweep -> one attention brief

The sweep combines three existing or new signals:
1. queued/running tasks and approval gates from the existing agent task queue
2. open Context HQ agent messages
3. recent session handoffs

Run it manually:

```sh
npm --prefix apps/agent run morning:sweep
```

The first version is intentionally manual. Scheduling should be added only after the brief proves useful enough to justify another always-on process.

## Mission Control -> keep the existing task queue

Do **not** create a second Kanban/task database just because Alex calls his UI Mission Control. 3DVR already has `agent-task-queue.js`, tenant ownership, worker capabilities, leases, risk classes, and approval gates. That is the canonical execution queue.

A future portal UI may visualize that queue, but the data model should stay shared.

## Air Traffic Control -> deferred

A separate router is not needed yet. The current task orchestrator, worker capability matching, and task queue already route work. Add a higher-level router only when there is a concrete routing failure the current system cannot express.

## GunJS layout

Context HQ is stored beneath the same owner-scoped coordination root as the rest of agent ops:

```text
OWNER/contextHQ/
  sessions/{id}
  sessionIndex/{id}
  latestSession
  messages/{id}
  messageIndex/{id}
  sweeps/{id}
  latestSweep
```

This keeps Context HQ portable across devices while preserving 3DVR's existing owner boundary.

## Design rules

- Keep handoffs small enough for another agent to scan quickly.
- Save decisions and open loops, not full transcripts.
- Never let untrusted external content silently become durable instructions or memory.
- Reuse the existing task queue instead of duplicating execution state.
- Prefer explicit acknowledgement and approval for consequential actions.
- Sell first. Build second. Keep it simple.
