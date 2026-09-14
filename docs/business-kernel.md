# 3DVR Business Kernel

3DVR is an open kernel for organizations. Businesses are the first organism we are booting on it, not the boundary of the system.

The kernel should stay small. It owns durable coordination primitives and policy boundaries; CRM, Calendar, Operator, Money Printer, Community, Assembly, and future products remain replaceable userspace built on those contracts.

## Kernel map

| Computing concept | 3DVR concept |
| --- | --- |
| Kernel | shared identity, capabilities, state, events, jobs, policy, audit |
| Process | agent, worker, workflow, scheduled job |
| Userspace app | CRM, Calendar, Projects, Operator, Assembly, Money Printer |
| Driver | Gmail, Stripe, GitHub, browser, server, phone, filesystem integration |
| Device tree | `/abilities/abilities.json` capability registry |
| Permission boundary | `/access/` plus scoped approval/policy state |
| Shell / desktop | Portal |

This analogy is architectural, not cosmetic: apps should ask the kernel what is possible rather than carry private knowledge of every integration.

## Kernel responsibilities

The minimum kernel owns:

- **Identity** — people, agents, organizations, devices, and service identities.
- **Capabilities** — named operations with inputs, outputs, risk, side effects, health, preferred route, fallback route, and version.
- **State** — durable records and links between them, with an explicit source of truth.
- **Events** — facts that happened: message received, payment posted, task finished, deployment failed, decision made.
- **Jobs** — executable work with owner, state, dependencies, retries, evidence, and result.
- **Policy** — who or what may observe, prepare, execute, spend, publish, or change sensitive state.
- **Audit** — enough receipts to explain what acted, why, with which capability, and what changed.
- **Learning** — measured outcomes that can safely improve future routing, ranking, and defaults.

Opportunity discovery is also a kernel-level behavior because it converts observed demand into candidate work. Its detailed contract lives in `docs/opportunity-kernel.md`.

## What does not belong in the kernel

The kernel should not own a specific CRM UI, social feed, email provider, payment processor, project methodology, governance system, token, blockchain, hosting vendor, or model provider.

Those are packages, drivers, or policies. They may be excellent defaults without becoming permanent dependencies.

## Capability contract

Agents should be able to ask one question:

> What can I do here, right now?

The answer should come from the live capability registry rather than prompt memory. Every executable capability should expose at least:

- stable capability ID and version
- human-readable purpose
- current health and availability
- required permissions and approvals
- input/output schema
- side effects and reversibility
- cost or spend boundary when relevant
- preferred execution path and fallback
- timeout/retry/idempotency behavior
- audit destination

An agent may reason about an action, but it should not invent an access path that the kernel does not advertise.

## Execution loop

The general runtime loop is:

> Intent → discover capability → authorize → execute → emit event → update state → evaluate outcome → continue or escalate

This makes an agent a process running against kernel contracts rather than a giant prompt that tries to remember infrastructure.

## Self-improvement loop

3DVR should improve itself, but improvement is another governed workload:

> Observe → diagnose → propose patch → test → measure → retain or revert

Autonomy is capability-specific. Low-risk reversible changes may eventually be auto-applied after tests. External communication, money movement, identity/security changes, destructive operations, and other sensitive actions keep stronger approval boundaries.

Every self-improvement should leave evidence: trigger, hypothesis, patch, tests, observed result, and rollback path.

## Relationship to the Portal

The Portal is the human-facing shell over the kernel. It should expose understandable state without becoming the source of truth itself.

- `/abilities/` is the public/machine-readable capability surface.
- `/access/` is the owner-facing permissions and approval surface.
- Operator is a process interface into the kernel.
- Workboard is a view of executable jobs and outcomes.
- CRM, Calendar, Projects, Finance, Assembly, and other apps are userspace views over specific records and workflows.

## Design rules

1. Keep the kernel small and boring.
2. Prefer durable contracts over app-to-app special cases.
3. One real-world fact should have one authoritative home and explicit links elsewhere.
4. Capabilities are discovered, not memorized in prompts.
5. Autonomy is scoped per capability and risk, never one global switch.
6. Every meaningful action emits an auditable event.
7. Apps can be replaced without breaking the organizational record.
8. Self-improvement must be measurable and reversible.
9. Open interfaces matter more than a single blessed implementation.
10. Humans remain first-class participants, not exceptions to an agent system.

## Near-term implementation order

1. Make `/abilities/abilities.json` the runtime-readable capability contract for Operator and workers.
2. Add health, route/fallback, approval, risk, and audit metadata where missing.
3. Normalize job/event receipts between Operator runtime, Workboard, and major integrations.
4. Keep CRM, Calendar, Projects, Finance, and communications linked through durable IDs instead of duplicated state.
5. Treat self-improvement work as normal jobs with tests, evidence, and rollback.
6. Add new coordination products, including Assembly, as userspace clients of these contracts.

## Definition of success

The architecture is working when a new agent or app can join 3DVR, discover what it may do, perform useful work through stable contracts, leave trustworthy receipts, and disappear again without taking organizational knowledge with it.
