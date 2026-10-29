# Portal Agent Worker Scaling

## Decision

Start with a shared 3DVR-managed worker pool, not one always-on agent per user.

Create per-user or per-tenant agents only when isolation is required for secrets, filesystem state, long-running browser sessions, paid capacity, or noisy workloads.

The target model is:

```text
portal request
  -> tenant-scoped task queue
  -> scheduler
  -> shared worker pool
  -> optional dedicated worker/session
  -> result stream back to portal
```

One agent process should not try to service infinite requests concurrently. It can service an unbounded queue over time, but each worker process should have explicit concurrency, memory, timeout, and cost limits.

## Why Not One Agent Per User By Default

One always-on agent per user is simple conceptually, but expensive operationally:

- idle users still consume memory and process supervision
- upgrades become harder
- every user's broken state can become a snowflake
- low-end servers run out of RAM quickly
- browser automation and Codex sessions are heavy

Per-user agents are still useful when a user needs:

- persistent local browser/session state
- private filesystem or repo checkout
- credentials that must never touch shared workers
- high-priority paid capacity
- long-running jobs
- dedicated region/device access

## Why Not One Infinite Agent

A single agent cannot safely service infinite requests.

It can run a loop forever, but the execution layer still needs:

- queue backpressure
- per-task lease
- per-owner rate limit
- concurrency limit
- memory limit
- timeout
- cancellation
- cost accounting
- audit log

Without those limits, one bad task can starve everyone else.

## Recommended Tiers

### Tier 0: Portal Queue Only

For users who only use the browser portal.

Portal writes tasks into a tenant queue:

```text
agentOps/<tenant>/taskQueue/tasks/<taskId>
agentOps/<tenant>/taskQueue/latest/<taskId>
```

Shared 3DVR workers claim tasks with leases and return results.

Good for:

- summaries
- simple research
- site deploys from known templates
- queueing outreach drafts
- small code or file tasks with safe scopes

### Tier 1: Shared Worker Pool

Multiple server workers run the same queue loop.

Each worker advertises capabilities:

```json
{
  "workerId": "do-nyc1-small-1",
  "capabilities": ["codex", "node", "static-hosting", "caddy"],
  "maxConcurrency": 1,
  "status": "available"
}
```

Scheduler chooses an available worker based on:

- task risk
- required tools
- owner quota
- current load
- expected duration
- model/backend

This is the default near-term production model.

### Tier 2: Ephemeral User Session

Spin up a temporary isolated workspace for a user or task.

Examples:

- temporary worktree
- temporary browser profile
- temporary container or systemd transient service
- TTL cleanup after completion

Good for:

- code edits
- untrusted file tasks
- preview builds
- browser automation
- multi-step research sessions

### Tier 3: Dedicated User Agent

Provision a long-lived worker for a user, team, or business.

Good for:

- paid users with persistent automation
- email/calendar/inbox background workers
- private repos and secrets
- high-volume customers
- users who want their own cloud agent instead of running Termux

## Tenant Identity

The queue key must not be just an email string forever.

Near-term:

```text
tenant = oauth provider + subject
fallback = verified email
guest = portal guest id
```

Record shape:

```json
{
  "tenantId": "google:1234567890",
  "alias": "user@example.com",
  "plan": "free|builder|pro|enterprise",
  "quota": {
    "monthlyTasks": 100,
    "concurrency": 1,
    "maxRuntimeMs": 600000
  }
}
```

Guest users can submit low-risk tasks, but tasks requiring credentials, spending, sending, publishing, or private state must require sign-in.

## Task Risk Classes

Tasks should be classified before execution.

```text
read_only       summarize, search, explain
draft           write proposed content, no external side effects
workspace_write edit files or generated site content
external_write  send email, publish, deploy, post, merge
money           charge, refund, buy, invoice, payroll
credential      read/write secrets or auth material
```

Default policy:

- `read_only`: shared worker allowed
- `draft`: shared worker allowed
- `workspace_write`: isolated workspace preferred
- `external_write`: approval required
- `money`: explicit approval and tenant policy required
- `credential`: dedicated or isolated worker required

## Worker Concurrency

The current DigitalOcean worker should stay at concurrency `1`.

Reasons:

- low memory droplet
- Codex can use significant memory
- browser automation can spike
- simpler logs and debugging

Scaling should add more workers before increasing concurrency on the small host.

Future defaults:

```text
small droplet: 1 concurrent task
medium VM: 2-4 concurrent tasks
browser worker: 1 concurrent browser task
code worker: 1-2 concurrent Codex tasks
research worker: 4+ cheap API tasks
```

## Scheduling Rules

The scheduler should choose:

1. Existing user-owned worker if online and capable.
2. Dedicated tenant worker if provisioned.
3. Shared worker pool if task is safe for shared execution.
4. Ephemeral isolated worker if task needs isolation.
5. Reject or ask for upgrade/approval if quota, risk, or capability is missing.

## Open Runtime Boundary

YC's open-source QM architecture independently validates most of this design: a headless identity/policy/scheduler core, durable scoped state, isolated agent computers, and swappable model/harness backends.

Use that as leverage, not as a reason to rewrite 3DVR around a new dependency.

3DVR owns the stable product contract:

```text
identity + tenant state
policy + approvals + risk
queue + task/result records
billing + audit
3DVR product workflows
```

Execution stays replaceable behind a narrow runtime boundary:

```text
3DVR task
  -> runtime adapter
  -> native worker | Codex | OpenCode | Pi | QM-backed worker | future runtime
  -> normalized result + audit receipt
```

Rules:

- Do not let a model vendor, harness, sandbox provider, or QM-specific data shape become the product source of truth.
- Keep user/product state portable and owned by 3DVR; runtime-specific session state may remain inside the runtime.
- Keep model selection and agent harness selection configurable per task or worker capability.
- Treat durable per-user sandboxes as an optional Tier 2/3 capability, not the default storage model for every user.
- Separate reusable core behavior from deployment-specific tools, skills, secrets, and infrastructure.
- Prefer open protocols and small capability interfaces at every boundary so a runtime can be removed without rewriting the portal.

If QM is trialed later, the first proof should be one read-only task executed behind the existing 3DVR queue and policy boundary. It must preserve current tenant identity, approval/risk semantics, audit records, and task/result shapes. Removing QM must require no portal data migration.

Do not delay the current Work Agent credential-store and Calendar path to perform this trial. Adopt the boundary now; substitute runtimes only when a live workload benefits.

## Portal UX

Portal should expose this as one simple surface:

```text
Ask 3DVR Agent
[task input]
[risk/cost indicator]
[run / request approval]
```

Behind the scenes:

- task appears as queued
- worker status shows "claimed by do-nyc1-small-1"
- output streams or polls into the portal
- user can cancel
- high-risk actions stop at approval

Portal users should not need to understand workers, DigitalOcean, tmux, or Codex unless they open advanced/admin settings.

## Required Next Builds

1. Add tenant fields to task records.
2. Add portal API endpoint to enqueue agent tasks.
3. Add portal task list/status UI.
4. Add worker capability heartbeat.
5. Add scheduler selection logic.
6. Add per-plan quotas.
7. Add cancellation.
8. Add approval gate for high-risk tasks.
9. Add isolated workspace support.
10. Add dedicated worker provisioning for paid users.

## Current DigitalOcean Role — edge and fallback

**Do not diagnose the absence of a DigitalOcean queue worker as an outage by itself.**
The deployed edge-guardrail design in `ops/resilience/install-do-edge-guardrails.sh`
explicitly removes the `3dvr-worker` and `3dvr-supervisor` tmux sessions
from DigitalOcean to avoid duplicating Hetzner's worker role on a small edge node.

A read-only check on 2026-10-28 confirmed that `3dvr-agent.service` is a
`Type=oneshot`, `RemainAfterExit=yes` launcher for `3dvr agent start`.
Its `active/exited` status **does not prove a running task worker**.
No queue-worker process or tmux session was found on DigitalOcean; its
managed SQLite queue contained 42 queued, 153 completed, and 5 failed tasks.
This is a queue census, **not** proof that any of those tasks can safely run.

Current roles:

```text
OVH: primary portal/control plane
Hetzner: designated worker and queue-execution lane (verify live health)
DigitalOcean: lightweight edge, portal fallback, and recovery lane
```

Before changing any worker placement, verify Hetzner's actual queue-polling
process, latest successful claim/receipt, capabilities, queue ownership, and
which host holds the authoritative queue. A tmux session or an active oneshot
service alone is not execution evidence. Do not restart a worker, broaden
capabilities, replay stale work, or promote DO to a worker without a reviewed
capacity and release plan.

If DigitalOcean is deliberately re-enabled as a shared worker later, keep
concurrency at one, isolate user secrets, enforce per-task approvals and
idempotency, and record authenticated worker receipts. It is not an
infinite-capacity agent.


## Supervised signed-canary gate (draft; not deployed)

A concurrency-1 Codex worker on the managed SQLite queue can still select an
**existing** signed `operator-http-*` backlog task before a new test task.
The supervised canary mode added in PR #3314 therefore binds **both** worker
selection and the atomic SQLite claim to one exact signed task ID. It does not
cancel, delete, or replay any other queued record.

- Before starting a worker, derive the exact `operator-http-<owner-hash>-<requestId>`
  ID from the authenticated Operator request. Use a fresh, approved, no-send
  request; never select an existing queued ID as a convenient test.
- Supply `--only-task-id <exact-id>` to the existing SQLite `run-once` worker,
  or set `THREEDVR_AGENT_WORKER_ONLY_TASK_ID=<exact-id>` for its supervised
  process. An invalid ID fails closed. This is a task selection boundary,
  **not** authorization to start a worker or execute a paid model call.
- The worker heartbeat records `only_task_id` on the **same** private SQLite
  queue. New signed admissions must match this ID; the claim path independently
  rejects every other ID even if an older task is first in the queue.
- Before any supervised live test, independently verify the deployed commit,
  actual queue owner and path, existing worker processes/heartbeats, one-writer
  supervision, capabilities, cost limits, and the exact signed request. Stop
  if any other poller could consume the canary or if a broader heartbeat is
  still eligible. Do not clear historical tasks to make the test pass.
- Inspect the durable claim, completion status, worker ID, result and timestamps
  after execution. An HTTP 200, queue ACK, heartbeat, or CI pass alone is **not**
  evidence of a completed task. Keep uncertain deliveries held for review.

This is an **opt-in draft safety gate**. It does not authorize production
worker activation, deployment, credentials, spending, or outbound messages.
