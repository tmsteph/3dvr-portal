# 3DVR Digital Twin / Booking Agent

Updated: 2026-09-15

## Purpose

The 3DVR Digital Twin is a portable personal operating layer that helps a person find, win, schedule, and manage better-paying work while keeping the person in control.

Thomas is the first real deployment, not a special case. The system must be designed so the same architecture can serve another freelancer, technician, creative, tradesperson, organizer, or small-business owner without copying Thomas-specific assumptions into the core.

The immediate business goal is simple: increase reliable income by turning fragmented messages, job portals, calendars, workforce systems, contacts, and opportunities into one coherent booking workflow.

## Product principle

**The twin belongs to the person, not to a server, cloud vendor, model provider, or ChatGPT account.**

AI providers are replaceable execution engines. The durable identity, profile, policies, opportunity history, task queue, audit trail, connectors, and portable state belong to the user's 3DVR twin.

A person should be able to move from:

- a 3DVR-managed server,
- to their own VPS,
- to a laptop on a kitchen table,
- to another machine later,

without rebuilding their digital life from scratch.

## Current foundation

The portal already contains much of the skeleton required for this system.

### Scheduling and booking

The Freelancer Desk schedule coordinator already models outside freelance/IATSE work, Encore protection, UKG time-off actions, IATSE availability, rest-day protection, and double-booking detection.

The booking policy adds a source roster, rates, onboarding/login state, next actions, and the 14-day Encore rule for keeping lightly booked future weeks open for stronger freelance work.

### Durable execution

The agent runtime already uses a durable SQLite-backed queue with transactional claiming, claim renewal for long tasks, and recovery of expired claims after crashes. Workboard adds a shared work-item model and runtime/evidence metadata rather than creating a second queue.

### Resource control

OVH resource lanes already separate production, workspace/browser, and dev/AI workloads with CPU and memory boundaries. The digital twin should extend this pattern into scheduler-level admission control rather than introducing Kubernetes or another heavy orchestration layer.

### Persistent browser work

Freelancer workspaces already support persistent browser state for systems without useful APIs. The current workforce access stack has verified authenticated paths for IATSE Local 122, Encore UKG/UltiPro, Encore SharePoint, and Lighthouse using persistent OVH browser profiles and a broker-owned credential-fill path.

### Device mesh

Roaming device work already established the idea that laptops and Termux devices can join the system through an always-on rendezvous rather than being treated as isolated machines.

### Opportunity engine

The Portal already has Opportunity Inbox / Money Printer work that scores opportunities, protects positive-sum constraints, learns from outcomes, attributes revenue, and explores multiple offer/channel/pricing possibilities.

The booking agent should reuse these primitives for employment and freelance opportunities instead of creating a separate intelligence stack.

## Target architecture

### 1. Person profile

A portable profile describes the human the agent represents:

- name and contact identities
- resume / work history
- skills and roles
- credentials and certifications
- preferred work types
- minimum and target rates
- travel limits
- availability rules
- employers and labor relationships
- preferred clients and companies
- personal commitments that affect scheduling
- approval policy
- communication style

Thomas-specific data lives in Thomas's profile. The engine itself stays generic.

### 2. Connector layer

Connectors collect and act through systems such as:

- SMS / phone messaging
- WhatsApp
- Gmail / Outlook
- calendars
- IATSE portals
- UKG / UltiPro
- Lighthouse
- Webclock / TouchBase when time-clock work is explicitly needed
- freelance portals
- staffing portals
- job boards
- CRM / contacts
- future provider APIs

A connector can be native/API-based, browser-driven, or human-assisted. All connectors implement the same high-level contracts so the rest of the twin does not care which transport is used.

### 3. Opportunity normalization

Every incoming job, shift, lead, message, referral, or posting becomes a normalized opportunity with fields such as:

- source
- role
- company/client
- pay or estimated value
- dates/times
- location/travel cost
- required skills
- deadline
- confidence
- schedule conflicts
- relationship value
- next action
- status

The system should prioritize by expected value, fit, urgency, effort, reliability, and strategic learning rather than simply by newest-first ordering.

### 4. Booking agent

The booking agent can:

- search for work
- parse inbound opportunities
- prepare and submit applications within standing policy
- draft and send routine follow-ups when authorized
- maintain availability
- detect conflicts
- protect higher-value bookings
- schedule approved work
- prepare time-off actions
- maintain lead/client history
- surface decisions that genuinely require the person

The default autonomy rule is:

**Automatically pursue upside inside explicit standing policy; escalate actions that create meaningful downside, conflicts, unusual commitments, destructive changes, or money movement.**

### 5. Resource-aware task queue

All meaningful work becomes a durable task.

Workers should run concurrently while the host has safe capacity. Admission control observes CPU, memory, disk pressure, browser-lane availability, API quotas, and connector-specific limits. When pressure rises, lower-priority work remains queued rather than competing until the server becomes unstable.

Priority examples:

1. expiring shift / interview / booking response
2. authenticated session recovery required for an active opportunity
3. scheduled follow-up
4. application submission
5. inbox classification
6. market/job discovery
7. indexing and low-priority research

Browser actions are relatively expensive and should be lane-limited. Cheap parsing and local state work can run concurrently.

### 6. Activity ledger

Every agent action should emit a durable event containing:

- user/twin ID
- task ID
- initiating goal
- connector/provider
- action type
- start/end time
- result
- evidence
- human approval/checkpoint if any
- resource/worker identity
- next action

This becomes both the audit trail and the learning history.

### 7. Portal surfaces

The human-facing product should converge around a few simple views:

- Opportunities
- Bookings / Calendar
- Messages
- Applications
- Contacts / Relationships
- Money / Revenue
- Agent Activity
- Needs Me
- Connector Health

The person should not need to understand the underlying queue, browser profiles, secrets broker, or infrastructure during normal operation.

## Portability contract

Portability is a core requirement, not a backup feature.

A complete twin must be expressible as:

1. **Portable state** — profile, policies, normalized opportunities, contacts, task/event history, configuration, connector metadata, and encrypted private data.
2. **Replaceable secrets** — credentials remain in an external or local secret store and are referenced by logical aliases, never embedded in exported state.
3. **Portable runtime** — a documented bootstrap can install the worker, queue, browser lanes, and portal-facing services on a normal Linux laptop or server.
4. **Portable browser identity** — where providers permit it, durable browser profiles can be backed up/restored or re-established through a documented human checkpoint flow. Provider security rules take precedence over blind cookie copying.
5. **Portable AI provider** — the planner/executor can be ChatGPT connectors today, a hosted API tomorrow, a local model where practical, or multiple providers at once.

### Disaster / affordability scenario

If a user can no longer afford their server:

- stop workers cleanly;
- export/sync the twin state and encrypted private data;
- preserve the repository and configuration;
- install the runtime on a laptop;
- restore the twin;
- reconnect any provider sessions that require fresh authentication;
- resume the durable queue without duplicating completed actions.

The target experience should become close to:

```text
git clone ...
./install.sh
3dvr twin restore <backup>
3dvr twin doctor
3dvr twin start
```

The exact commands are future implementation work, but this is the desired portability contract.

## Multi-user design

No core module should assume there is only one Thomas.

Every durable record should be scoped to a stable `twin_id` / owner identity. Browser workspaces, task queues, connector configs, policies, secrets aliases, audit events, and learning memory must be isolated by twin.

Thomas's current deployment can keep optimized single-user shortcuts while those shortcuts remain behind interfaces that can later be replaced with tenant-aware implementations.

## Distribution models

### Free / self-hosted

A technically capable person should be able to run a useful version on their own hardware for free.

3DVR should provide:

- open-source runtime
- setup documentation
- local SQLite/state store
- local browser worker
- connector instructions
- backup/restore tooling
- a basic Portal UI
- bring-your-own AI provider where possible

This keeps the project aligned with 3DVR's open-source mission and makes the system useful even when the user cannot pay 3DVR.

### 3DVR managed

For people who do not want to operate infrastructure, 3DVR can charge a small recurring amount to provision and maintain a personal worker environment.

The managed service can provide:

- one isolated twin/workspace per customer
- persistent encrypted storage
- browser sessions
- queue workers
- health checks and backups
- upgrades
- connector support
- optional AI/API usage pass-through
- human support for difficult onboarding/authentication

A small VPS does not necessarily need to be dedicated per person. The existing isolated workspace approach points toward safely hosting multiple logical users on one machine while imposing CPU/RAM limits and preserving data boundaries. Higher tiers could receive dedicated instances when needed.

## Commercial model

The product should preserve a free path while making convenience worth paying for.

A simple model:

- **Self-hosted:** free/open source; user supplies hardware and AI access.
- **3DVR Managed Basic:** small monthly fee for hosting, backups, updates, and limited worker/browser capacity.
- **Usage:** pass through or meter expensive model/API/browser-heavy work when necessary.
- **Pro:** more concurrency, more persistent browser lanes, faster opportunity monitoring, and premium support.

The important distinction is that customers pay 3DVR for convenience, reliability, orchestration, and service—not for being locked away from their own data or runtime.

## Migration path from today's Thomas system

1. Make the current Thomas state model explicit instead of scattered across product modules.
2. Introduce a stable `twin_id` and connector registry.
3. Route job/shift/message opportunities into one normalized Opportunity Inbox.
4. Add resource-aware queue admission on top of the existing durable SQLite queue.
5. Make activity events first-class and surface them in Workboard/Agent Activity.
6. Build `export`, `restore`, and `doctor` commands before adding many more integrations.
7. Package the worker stack so a clean Linux laptop can become a valid node.
8. Separate Thomas policy from engine defaults.
9. Create a reusable onboarding flow for a second real person.
10. Use that second deployment to prove multi-user assumptions before scaling the managed service.

## Definition of done

The Digital Twin / Booking Agent is not complete when it can merely open job websites.

It is complete enough for real use when:

- the person's schedule and work rules are represented explicitly;
- multiple opportunity sources feed one normalized inbox;
- the agent can pursue routine opportunities under standing rules;
- schedule conflicts are caught before commitments are made;
- actions are durable, auditable, and resumable;
- CPU/RAM pressure causes queuing instead of server failure;
- the same twin can move from server to laptop and resume;
- the engine works for a second person without forking Thomas-specific code;
- a self-hosted user can run it without paying 3DVR;
- a managed user can pay 3DVR for a much easier version of the same open system.

## Related existing work

- `docs/workforce-access-runbook.md` — verified IATSE / UKG / SharePoint / Lighthouse access and recovery.
- `docs/freelancer-workspaces.md` — isolated persistent browser/workspace architecture.
- `freelance/schedule.html` — schedule coordination surface.
- Freelancer booking policy/source roster — standing booking rules and work-source tracking.
- Agent task queue — durable SQLite execution and crash recovery.
- Workboard / Operator runtime — shared work-item and execution/evidence surface.
- Opportunity Inbox / Money Printer — opportunity scoring, experiments, learning, and revenue attribution.
- Device mesh — portable/roaming execution nodes.

This document should evolve with the implementation. New provider quirks, portability assumptions, multi-user boundaries, or managed-service constraints should be updated here in the same changes that introduce them.
