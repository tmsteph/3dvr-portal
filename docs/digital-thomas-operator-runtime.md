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

## Work item contract

Every actionable item should normalize to the same minimum shape: `id`, `title`, `intent`, `domain`, `priority`, `state`, `risk`, `owner`, `dependencies`, `requiredCapabilities`, `identityLease`, `humanCheckpoint`, `createdAt`, `updatedAt`, `evidence`, and `result`.

Initial states: `queued`, `ready`, `running`, `waiting_human`, `waiting_external`, `blocked`, `verifying`, `done`, `failed`, `cancelled`.

The queue should support jobs, client work, outreach, software changes, calendar/admin, household tasks, research, infrastructure, and future domains without changing the scheduler.
## Existing pieces to converge

- `/workboard/` — task queue and human-attention surface.
- `/operator/` — conversational operator and action surface.
- Money Printer Executive Operator — durable direction, founder feedback, decisions, and planning.
- `docs/ovh-resource-lanes.md` — host-level resource isolation.
- Browser-lane lease tooling and tests — foundation for session ownership.
- Work Agent — first domain-specific worker pattern with availability, outreach, approvals, and audit.
- Secrets broker / access system — evolve toward scoped backend-independent credentials and documents.

Do not replace these with a parallel platform. Refactor them toward the shared contracts above.

## Near-term implementation order

1. Define the work-item and worker-registry schemas in `src/operator-runtime/`.
2. Extend browser-lane leases to multiple named isolated lanes plus a protected identity lane.
3. Add resource telemetry and stale-worker cleanup so runaway browsers cannot monopolize OVH.
4. Teach Workboard to show worker/lane, human checkpoint, verification state, and evidence.
5. Route one real workflow end to end through the runtime; job applications are a useful stress test, not the architecture's purpose.
6. Add other workflows incrementally: email triage, CRM/client follow-up, calendar/admin, development/deployment, infrastructure, household/life operations.

## Success criterion

Thomas should be able to state an intention once, see it become durable work, let multiple workers progress safely in parallel, intervene only where judgment or identity is required, and later inspect exactly what happened. The system should feel like one digital Thomas—not a pile of bots.