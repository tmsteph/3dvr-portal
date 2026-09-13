# 3DVR Operator Business System

This is the business operating layer on top of the canonical Digital Thomas / 3DVR Operator runtime. It is intentionally model- and vendor-independent: persistent cloud agents, browser workers, connected tools, and future models all plug into the same contracts.

## Goal

Turn one founder intent into durable, inspectable business work that keeps moving without requiring Thomas to babysit every step.

**Intent → Business Manager → bounded role → shared work item → tool/worker → verification → CRM/memory/audit → next action**

The first success criterion is not “many agents.” It is one revenue loop that closes reliably.

## Team

### Business Manager
Chooses the next highest-value bounded action, coordinates handoffs, and prevents duplicate or conflicting work.

### Research
Finds prospects, demand signals, pain, and evidence. Research workers should be cheap and parallel whenever possible.

### Sales
Owns qualification, outreach, replies, proposals, and paid asks. Sales never reports a send, reply, or payment without evidence.

### Marketing
Creates offers, useful public material, campaigns, and reusable demand-generation assets. Marketing feeds Sales; it does not become a separate content treadmill.

### Operations
Owns CRM hygiene, follow-up dates, schedules, queues, evidence, delivery status, and exceptions.

### Engineering
Builds or repairs the smallest product, integration, or workflow needed to move a real opportunity forward.

These are roles, not permanent model identities. Any capable worker can fill a role when the shared work-item contract and permissions allow it.

## First production loop: lead to sale

1. **Research** — find a real opportunity and collect evidence.
2. **Qualify** — confirm fit, route, need, and next best action.
3. **Outreach** — prepare and send a bounded direct message under policy.
4. **Wait / listen** — capture delivery, reply, and failure evidence.
5. **Follow up** — schedule and execute the next touch instead of losing the lead in chat history.
6. **Proposal** — turn interest into a concrete scope, price, and next step.
7. **Payment** — verify the paid result instead of inferring success.
8. **Learn** — update CRM, offer/message lessons, and the next experiment.

The executable stage machine lives in `src/operator-runtime/revenue-workflow.js`.

## Autonomy policy

The system should automate routine, low-risk work while keeping identity-sensitive actions explicit and auditable.

Current outbound rule:

- Fresh direct-email leads may send autonomously during the local 08:00–18:00 business window when campaign caps/policy allow it.
- Known contacts require a human send checkpoint.
- Unknown relationships are classified before autonomous outreach.
- Non-email outbound remains approval-gated until that channel has its own proven policy.
- Signatures, payments, account/security changes, and other sensitive identity actions remain human-checkpoint work.

A human checkpoint pauses that work item only. Other unrelated workers should continue.

## Runtime contracts

`src/operator-runtime/work-item.js` implements the common minimum work-item shape already defined by the canonical runtime document: identity, intent, domain, priority, state, risk, owner, dependencies, capabilities, leases/checkpoints, timestamps, evidence, result, and workflow metadata.

`src/operator-runtime/worker-registry.js` defines bounded workers by class (`read`, `action`, `identity`), capabilities, execution lanes, concurrency, status, and resource budget. Capability matching prevents a worker from taking work it cannot safely execute.

`src/operator-runtime/revenue-workflow.js` defines the business roles, revenue stages, valid transitions, and outbound policy decisions.

## Portal mapping

- **Operator** — founder intent and conversational control surface.
- **Workboard** — durable queue, running/waiting/done state, evidence, and human checkpoints.
- **Growth Desk** — revenue cockpit: current opportunities, CRM state, outreach, follow-ups, and the lead-to-sale loop.
- **CRM** — canonical customer/opportunity memory and touch history.
- **Money Printer / Revenue Manager** — opportunity selection, experiments, and measurable money path.
- **Worker hosts** — OVH/control-plane workers first; additional hosts join through the same registry and queue contracts.

## Implementation status — 2026-09-12

Implemented in this change:

- shared work-item schema and transitions
- worker registry schema and capability selection
- Business Manager + Research + Sales + Marketing + Operations + Engineering role model
- executable lead-to-sale revenue state machine
- fresh-vs-known outbound approval policy with business-hours deferral
- unit coverage for contracts, worker selection, policy, and the full research → payment path
- Growth Desk representation of the same operating loop

## Next implementation slice

1. Persist these work items in the existing private runtime store instead of app-local state.
2. Teach Workboard to render `owner`, `workflow`, worker/lane, checkpoint, verification, and evidence from the shared contract.
3. Route a real CRM lead through `lead-to-sale` end to end and record each transition from actual evidence.
4. Connect the Revenue Manager to worker selection so Research can run in parallel while identity-bound sends remain serialized.
5. Add reply ingestion and follow-up scheduling as evidence-driven transitions instead of manual status edits.
6. Add proposal/payment verification to close the loop.

Do not build separate Sales Bot, Marketing Bot, or Research Bot platforms. Build one Operator runtime with reusable role definitions, skills, work items, policies, workers, and handoffs.
