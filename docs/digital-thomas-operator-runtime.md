# Digital Thomas / 3DVR Operator Runtime

This document is the canonical architecture for Thomas's personal operating system. The goal is not a single autonomous bot. It is a durable control plane that lets many bounded workers act as one coherent digital extension of Thomas across work, business, software, communications, scheduling, research, and life administration.

## Product principle

**Thomas → intent → queue → planner → workers → tools/accounts/devices → verification → memory + audit**

The portal is the cockpit. OVH is the first control-plane node. Other machines can join as workers. Individual apps such as Jobs, CRM, Calendar, Money Printer, Operator, and Work Agent are workloads on top of the runtime, not separate agent architectures.

## Phase 1: the nervous system

Build only the infrastructure that removes current operational pain:

1. Shared task queue with priority, state, dependencies, owner, deadlines, and evidence.
2. Worker registry with isolated execution lanes and resource budgets.
3. Browser/session broker that protects authenticated browser state while permitting parallel work.
4. Human-checkpoint queue for captcha, signatures, sensitive sends, ambiguity, and approvals.
5. Audit log recording what ran, why, what changed, and whether it was verified.
6. Operator UI centered on Now, Waiting on Thomas, Running, Done, and Problems.

Everything else plugs into these primitives.

## Business operating layer

The business system is a workload on this runtime, not a second agent platform. `docs/operator-business-system.md` defines the Business Manager and bounded Research, Sales, Marketing, Operations, and Engineering roles plus the first executable lead-to-sale loop.

The reusable contracts now begin in `src/operator-runtime/`:

- `work-item.js` — canonical work-item shape and state transitions.
- `worker-registry.js` — worker classes, capabilities, concurrency, and eligibility.
- `revenue-workflow.js` — business roles, revenue stages, handoffs, and outbound policy.

The important pattern is **role → shared work item → capable worker → evidence → next transition**. Models and vendors may change without changing the operating system.

## Execution classes

### 1. Read workers
Research, inspect, summarize, monitor, score, and prepare. These are cheap, parallel, and should rarely need a logged-in browser.

### 2. Action workers
Edit files, fill forms, deploy code, update calendars, stage applications, create drafts, and operate bounded workflows. These run in isolated lanes with their own task ownership.

### 3. Identity workers
Use scarce authenticated identity surfaces: canonical browser sessions, outbound messaging, payments, signatures, account changes, or other sensitive actions. These are brokered, serialized where required, and heavily audited.

## Browser model

The canonical authenticated browser remains **single-writer**. Parallel work should use isolated profiles or disposable sessions whenever authentication is not required.

Workers request an identity lease only when needed. A lease identifies the account/session, worker, purpose, risk class, start time, expiry, and current owner. Captcha or other human-only gates pause only that task; unrelated workers continue.

Start with two concurrent action-browser lanes plus one reserved interactive/VNC lane on OVH. Increase only after resource telemetry shows safe headroom.

### Multi-user browser/session architecture

Thomas's current fixed OVH CDP lanes are a single-user implementation and proving ground, not the long-term hosted product boundary. Multi-user onboarding must preserve the same behavior behind a brokered identity/session layer.

- Each user gets an isolated identity workspace: browser profiles/cookies, scoped secrets, permissions, audit history, task state, and durable data must never be shared across users.
- Workers request a logical lane such as `user/jobs` or `user/employer`; a browser session broker chooses the actual host, process, container/VM boundary, profile, and ephemeral port. Product code must not depend on hard-coded CDP ports.
- Durable browser profiles persist while browser processes are on-demand. Idle customers should not consume a permanently running Chromium instance; sessions start for work, preserve state, and may suspend after an idle timeout.
- Concurrency, CPU, memory, storage, automation rate, and browser lifetime are quota-controlled per user/plan. Recovery/control capacity remains reserved so one customer cannot starve the host.
- Human checkpoints such as MFA, CAPTCHA, consent, signatures, and device pairing pause only the affected task/session. They must not block unrelated work for that user or other users.
- The control plane is shared, but execution is location-independent. A user's workers may run on 3DVR-managed infrastructure, a dedicated customer node, or the user's own computer while keeping the same queue, permissions, audit, and session contracts.
- The open/self-hosted and managed-hosted products should use the same workspace format and runtime contracts. Moving between them should be an operational migration, not a product rewrite or data lock-in event.

The intended request path is `Portal/Operator -> task queue -> user identity workspace -> browser/session broker -> isolated execution lane -> provider`. Fixed mappings such as Thomas's `9222/9333/9444` remain host-local implementation details only.

## Resource scheduler

Reuse the existing systemd resource lanes. Recovery/control-plane capacity is always protected. Workers must run in bounded dev/workspace slices rather than inheriting the Remote Desktop Commander shell's recovery privileges.

## Shared state

The runtime needs one coherent model of Thomas rather than app-specific copies:

- identity facts and reusable profile data
- permissions and approval boundaries
- communication rules and relationship context
- projects, goals, deadlines, and active commitments
- accounts, devices, connectors, and capability health
- durable decisions, feedback, and lessons learned
- secrets/document references through a backend-agnostic secure layer

Private personal state stays out of Git. Git stores schemas, architecture, policy, and code. Runtime state belongs in private durable storage with scoped access and an audit trail.

## Capability bootstrap and health contract

`/abilities/abilities.json` is the public machine-readable capability and recovery map. `/access/` is the owner-facing private control/approval surface. Workers must consult the capability map before concluding that an account, device, connector, browser session, or credential path is unavailable.

For each required capability, the worker should follow this order:

1. Identify the documented primary access path and permission boundary.
2. Run the least-invasive real health check appropriate to that capability.
3. Use the documented fallback/recovery path when the primary path fails.
4. Surface only the smallest human checkpoint required to restore operation.
5. Record dynamic health privately; do not put secrets, private identifiers, or transient personal state in the public registry.

Health is layered, not boolean:

- **configured** — a known access path exists.
- **reachable** — the underlying connector/device/service answers a lightweight probe.
- **operational** — a harmless real operation succeeds.
- **session** — the authenticated application/session required by the workflow is actually usable.

A ping does not prove command execution. A running browser process does not prove WhatsApp or Google Messages is still paired. A saved credential does not prove the downstream service accepts it. Workers must not promote a weaker health level into a stronger one.

The control plane should progressively automate these checks and reconcile private runtime health with the public runbook without requiring Thomas or the agent to rediscover integration setup from conversation history.

## Work item contract

Every actionable item should normalize to the same minimum shape: `id`, `title`, `intent`, `domain`, `priority`, `state`, `risk`, `owner`, `dependencies`, `requiredCapabilities`, `identityLease`, `humanCheckpoint`, `createdAt`, `updatedAt`, `evidence`, and `result`.

Initial states: `queued`, `ready`, `running`, `waiting_human`, `waiting_external`, `blocked`, `verifying`, `done`, `failed`, `cancelled`.

The queue should support jobs, client work, outreach, software changes, calendar/admin, household tasks, research, infrastructure, and future domains without changing the scheduler.

## Existing pieces to converge

- `/workboard/` — task queue and human-attention surface.
- `/operator/` — conversational operator and action surface.
- `/abilities/` — capability, access-path, health-check, and recovery runbooks.
- `/access/` — owner approvals, scoped machine access, and private control-plane state.
- Money Printer Executive Operator — durable direction, founder feedback, decisions, and planning.
- `docs/ovh-resource-lanes.md` — host-level resource isolation.
- Browser-lane lease tooling and tests — foundation for session ownership.
- Work Agent — first domain-specific worker pattern with availability, outreach, approvals, and audit.
- Secrets broker / access system — evolve toward scoped backend-independent credentials and documents.

Do not replace these with a parallel platform. Refactor them toward the shared contracts above.

## Near-term implementation order

1. Persist and adopt the shared `src/operator-runtime/` work-item, worker-registry, and revenue-workflow contracts across existing apps.
2. Add a browser/session broker that maps per-user logical lanes to isolated identity workspaces and dynamic execution slots; preserve the existing writer-lease contract inside each workspace.
3. Add resource telemetry and stale-worker cleanup so runaway browsers cannot monopolize OVH.
4. Teach Workboard to show worker/lane, human checkpoint, verification state, and evidence.
5. Route one real workflow end to end through the runtime; the lead-to-sale revenue loop and job applications are useful stress tests, not separate architectures.
6. Expand automatic capability verification from existing server/device probes to connector and authenticated-session checks.
7. Add other workflows incrementally: email triage, CRM/client follow-up, calendar/admin, development/deployment, infrastructure, household/life operations.

## Success criterion

Thomas should be able to state an intention once, see it become durable work, let multiple workers progress safely in parallel, intervene only where judgment or identity is required, and later inspect exactly what happened. The system should feel like one digital Thomas—not a pile of bots.
