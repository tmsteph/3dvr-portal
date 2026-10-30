# Hosted Operator product

Decision: 2026-10-11. Thomas wants a product for people who need things done, alongside the open project for builders. Hosting is the default. Hide implementation complexity from the customer. Keep one public page with a secondary builder section.

## Customer experience
Promise: We host your agent. You get things done.
Phone/browser → tell us the outcome → see progress → receive the result → answer only decisions that need you. Setup, model selection and server management are our responsibility. Ask for account connections only when the requested task needs them. Keep normal workflows in Operator.

Available now: public workspace and private hosted-pilot interest signup with a receipt. Signup is not an agent activation or subscription. Personal hosted service, automation reliability and tenant isolation still require validation before paid activation. Confirm supported tasks, usage limits and price before starting each pilot.

## Shared infrastructure, private work
An agent is a logical account/workspace/job context, not a dedicated physical server. Start with a small admitted cohort on existing OVH control/production and Hetzner worker infrastructure. Queue work, cap concurrent jobs and preserve production memory reserves; add capacity from measured demand rather than promising unlimited usage.

Before enabling hosted customer actions, enforce tenant ownership at every API/data boundary; namespace files and memory per account; use separate scoped credentials; isolate executable jobs from other tenants and the host; prohibit shared authenticated browser profiles for unrelated customers. Separate process/resource limits alone do not establish data privacy. Use sandbox/container boundaries with no host secrets or Docker socket. No per-tenant server is required, but filesystem path segregation alone is insufficient isolation.

Scheduler requirements: fair admission, bounded concurrency and output, time/token/spend caps, idempotent tasks, explicit authorization, recoverable leases, cancel/retry states and auditable receipts. Cross-tenant access tests must pass for files, memory, history, secrets and jobs. Destructive/external actions use their configured review rules.

## Commercial path
Free workspace/limited evaluation; hosted pilot with a clear included usage allowance; additional work bounded by an agreed budget. Price from measured model/tool costs, support and capacity. No invented price or unlimited claims at launch. Managed hosting pays for convenience and accountable operation; open-source core stays usable. Contributors and self-hosters remain welcome.

## Next delivery gate
Choose a real task with an admitted pilot user, prove the end-to-end result on our shared worker infrastructure, verify tenant isolation and cost enforcement, then expand the cohort. User-facing screens should say task, progress, result and permission—not queues, model routers or deployment lanes.

## Owner task delivery repair — October 24, 2026

New general tasks in Operator use signed owner POST requests to `/api/operator-task`,
with a server-derived task identity and a durable acknowledgement from the existing
managed SQLite queue. A missing response triggers status lookup with the same identity,
not a second enqueue. Old relay tasks are preserved and are not replayed.

The existing lightweight queue worker dispatches these private tasks over the SSH mesh
to Hetzner's working Codex login. Credentials stay on Hetzner. This lane completes
research (with web search) and drafting tasks and returns their saved results in chat.
Shell, file changes, MCP integrations, external messaging, payments and deployments
are unavailable in this lane. Forge code edits and server controls retain their existing
paths; this repair does not establish their reliability.

Rollout order: install the reviewed queue privacy/dispatch code and native bridge on
the managed queue host, then deploy Portal through the normal immutable release workflow.
New HTTP task prompts/results never mirror to public Gun or the shared organism feed.
The queue's old capability and approval settings stay unchanged. Verify a harmless task
through signed HTTP -> SQLite -> worker -> Hetzner -> saved result; an accepted write
or a health-only result is insufficient.

## Private worker supervision

`3dvr-operator-private-worker.service` supervises the lightweight private SQLite
consumer on the existing queue host. It runs one queued `operator-http-` Codex task
at a time through the existing claim and result code, retaining configured approval
and capability checks. It does not consume legacy tasks, recover uncertain running
tasks, sync private work to Gun, or move Codex credentials off Hetzner.

The Control Bus actions `operator_runtime_status` and `operator_runtime_recover`
inspect aggregate queue metadata and restore this service respectively. Recovery
installs the worker from its exact workflow commit and checks a synthetic read-only
Codex task through SQLite, the worker, Hetzner, and saved output.
