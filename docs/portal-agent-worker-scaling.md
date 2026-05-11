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

## Current DigitalOcean Role

The current DO server should be treated as:

```text
bootstrap shared worker
static hosting edge
operator/admin worker
```

It is enough to prove the model, but it should not be the final infinite-capacity agent.

Near-term limits:

- one Codex task at a time
- no arbitrary user secrets on shared worker
- no unsupervised external side effects
- use leases and handled records for dedupe
- log every message sent to a model or external service

