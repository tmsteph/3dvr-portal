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
