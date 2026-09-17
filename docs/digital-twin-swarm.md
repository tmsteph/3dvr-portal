# 3DVR Digital Twin Swarm

Updated: 2026-09-16

## Purpose

The 3DVR Digital Twin should be able to operate as a swarm of small AI workers acting on behalf of a person under explicit policy.

This is not a separate architecture from the Digital Twin / Booking Agent. It is the execution model for the existing system:

```text
Person / Portal
      ↓
Coordinator / Planner
      ↓
Durable task + event bus
      ↓
Specialist workers
      ↓
Connectors / browsers / shells / APIs / devices
      ↓
Evidence + results + activity ledger
      ↓
Portal / Workboard / person
```

The person remains the owner of the twin, its goals, policies, data, credentials, and final authority.

## Core idea

Instead of one giant autonomous agent doing everything, the twin should use many small, replaceable workers with narrow responsibilities and limited permissions.

Workers can run in parallel when resources allow. When CPU, RAM, browser lanes, API quotas, or other limits are reached, lower-priority work stays in the durable queue rather than destabilizing the host.

Routine work should use the cheapest adequate execution engine. Stronger or more expensive models should be invoked only when a task actually benefits from them.

## Initial worker roles

These are logical roles, not necessarily permanently running processes. One worker implementation may serve several roles, and roles can later be split as the system grows.

### Coordinator

Turns a human goal into tasks, assigns work, watches dependencies, avoids duplicate effort, and escalates decisions that require the person.

Example goal:

> Make me more money today.

The coordinator may fan that goal out into opportunity discovery, applications, follow-ups, booking maintenance, product experiments, and infrastructure work.

### Scout

Finds jobs, freelance gigs, clients, unmet demand, startup ideas, grants, partnerships, and other opportunities.

### Booking Agent

Maintains availability, watches work systems, resolves scheduling conflicts, protects higher-value bookings, and prepares or performs authorized booking actions.

For Thomas's current workforce workflow, this includes the existing Lighthouse → IATSE → Encore scheduling path.

### Sales Worker

Researches fresh leads, enriches contact context, prepares outreach, tracks replies, and advances qualified opportunities inside standing communication policy.

### Builder

Writes code, fixes bugs, creates tests, performs implementation tasks, and prepares deployable changes.

Multiple builder workers may specialize in frontend, backend, infrastructure, data, hardware, or documentation.

### Ops Worker

Watches the 3DVR runtime and infrastructure, handles routine recovery, validates connectivity, checks worker health, and keeps the control plane available.

### Research Worker

Investigates technical, market, product, operational, or domain questions needed by other workers.

### Archivist

Records decisions, evidence, provenance, outcomes, corrections, accomplishments, and reusable knowledge so work survives model, machine, and provider changes.

### Treasurer

Tracks revenue attribution, costs, recurring expenses, model/API spend, profitability, and which activities actually create economic value.

### Supervisor

Applies resource and policy controls across the swarm. It watches CPU, RAM, disk, browser capacity, rate limits, task duplication, stuck workers, and risky actions.

The supervisor is a control function, not a replacement for the person.

## Task and event model

Every meaningful swarm action should be represented as durable work rather than ephemeral chat state.

A task should include at least:

- `twin_id`
- parent goal / initiating intent
- task type and specialist role
- priority
- dependencies
- required capabilities
- policy / approval requirements
- resource class
- status and lease
- evidence/result references
- retry and recovery metadata

Workers claim tasks transactionally, renew claims while active, and release or fail them with evidence. Expired claims can be recovered without duplicating already completed external actions.

Every material action should also emit an event into the activity ledger.

## Capability-scoped workers

Workers should receive only the capabilities needed for the current task.

Examples:

- a Scout may search public sources but have no ability to send messages;
- a Builder may edit a repository but have no workforce credentials;
- a Booking Agent may access scheduling portals but not production infrastructure;
- an Archivist may write durable records without authority to commit money or contact people;
- an Ops Worker may restart a worker but not impersonate the person in an external conversation.

Capability scopes should be explicit, auditable, revocable, and short-lived where practical.

## Autonomy model

The swarm follows the existing Digital Twin autonomy principle:

**Automatically pursue upside inside explicit standing policy; escalate actions that create meaningful downside, conflicts, unusual commitments, destructive changes, or money movement.**

The coordinator should prefer asking the person one high-value decision instead of surfacing every low-level choice made by individual workers.

Known-contact communication remains subject to the person's standing communication policy. Internal preparation, research, organization, drafting, scheduling analysis, and other non-destructive work can proceed more autonomously.

## Resource-aware execution

The swarm should optimize for useful work completed per unit of money and compute rather than maximizing agent count.

Default strategy:

1. Use deterministic code for deterministic work.
2. Use small/local/open models for routine classification, extraction, summarization, routing, and low-risk drafting where quality is adequate.
3. Use stronger hosted models for difficult planning, coding, ambiguous reasoning, or high-value synthesis.
4. Limit browser automation to controlled lanes because browser sessions are comparatively expensive in memory and failure surface.
5. Queue non-urgent work when the host approaches safe CPU/RAM limits.
6. Reuse results and durable memory instead of repeatedly rediscovering the same facts.

A healthy swarm may have many logical workers while only a small number are actively consuming compute at once.

## Portal experience

The Portal is the command center, not a screen full of agent internals.

The person should be able to express goals such as:

- "Make me more money today."
- "Find me two days of higher-paying AV work next week."
- "Keep the infrastructure healthy."
- "Turn this customer request into a finished product."

The Portal should show:

- current goals
- active and queued work
- worker role responsible for each task
- important evidence and outcomes
- money made / saved / spent
- blockers and decisions that need the person
- resource health
- recent swarm activity

Low-level agent chatter should stay hidden unless requested.

## Mapping to the existing 3DVR system

The swarm reuses systems that already exist or are already planned:

- **Portal / Operator** — human command surface.
- **Durable SQLite task queue** — shared work distribution and crash recovery.
- **Workboard** — human-readable work items, runtime state, and evidence.
- **Opportunity Inbox / Money Printer** — opportunity discovery, scoring, experiments, learning, and revenue attribution.
- **Freelancer Desk / booking policy** — booking and schedule logic.
- **Persistent browser workspaces** — authenticated browser capabilities for systems without good APIs.
- **OVH-first control plane and resource lanes** — primary always-on orchestration environment.
- **Device mesh** — laptops, phones, SBCs, and other nodes can contribute capabilities without becoming the source of truth.
- **Activity ledger / continual intelligence** — durable history, provenance, correction, and reusable memory.

The first implementation should therefore extend the existing queue with worker roles, capability requirements, resource classes, coordinator fan-out, and better activity visibility rather than introducing a new orchestration platform.

## Physical robots later

A physical robot can join the same architecture as another capability provider.

From the swarm's perspective, a robot is a worker or device exposing scoped abilities such as:

- camera / perception
- microphone / speaker
- navigation
- wheels or locomotion
- arm / gripper
- sensors
- local compute
- environmental control

Physical actions require stronger safety constraints and human-defined operating boundaries, but they do not require a fundamentally different task architecture.

This allows 3DVR to grow from software agents doing digital work into mixed swarms of software and physical machines operating from the same personal computing layer.

## Near-term implementation path

1. Add an explicit `worker_role` and `capability_requirements` model to durable tasks.
2. Add coordinator fan-out so one high-level goal can create multiple dependent tasks.
3. Add resource classes and admission limits for browser, model, shell, network, and device-heavy work.
4. Surface active/queued swarm work in Workboard / Agent Activity.
5. Start with a small role set: Coordinator, Scout, Booking Agent, Builder, Ops, Archivist.
6. Route Opportunity Inbox and booking work through those roles.
7. Add revenue/cost attribution so the Treasurer function can measure which autonomous loops are worth running.
8. Add reusable worker manifests so other 3DVR users can run the same swarm with their own policies and connectors.
9. Keep the whole system portable so the swarm can run on OVH, another VPS, or a user's own Linux machine.
10. Treat physical devices as optional capability nodes later rather than coupling the core swarm to robotics today.

## Design rule

**Many minds, one owner.**

The swarm may plan and execute in parallel, but the identity, goals, data, permissions, and durable memory remain anchored to the person's Digital Twin.

## Related documentation

- `docs/digital-twin-booking-agent.md` — parent Digital Twin / Booking Agent architecture.
- `docs/digital-twin-host-routing.md` — host and control-plane routing policy.
- `docs/workforce-access-runbook.md` — workforce systems and access recovery.
- `docs/freelancer-workspaces.md` — persistent browser/workspace architecture.
- `/digital-twin/` — public Portal overview.
