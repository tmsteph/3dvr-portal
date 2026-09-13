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

`src/operator-runtime/task-queue-adapter.js` bridges canonical work items to the existing Agent Ops worker queue without changing the worker contract.

`src/operator-runtime/runtime-sidecar.js` stores canonical runtime metadata beside the queue task under the same task ID so worker normalization cannot erase workflow, checkpoint, verification, or evidence context.

## Persistence decision

Do **not** create a second task database yet.

The current transitional persistence boundary is the existing tenant-scoped Agent Ops queue:

- worker record: `agentOps/<owner>/taskQueue/tasks/<id>`
- worker summary: `agentOps/<owner>/taskQueue/latest/<id>`
- canonical runtime sidecar: `agentOps/<owner>/taskQueue/runtime/<id>`

The first managed owner is `3dvr-managed`. The sidecar is a compatibility bridge, not the final private store. Producers and UI code should depend on the runtime adapter rather than the Gun path directly wherever practical. When the final private durable store is ready, replace this adapter boundary instead of rewriting every workflow.

## Portal mapping

- **Operator** — founder intent and conversational control surface.
- **Workboard** — durable queue, running/waiting/done state, evidence, and human checkpoints.
- **Growth Desk** — revenue cockpit: current opportunities, CRM state, outreach, follow-ups, and the lead-to-sale loop.
- **CRM** — canonical customer/opportunity memory and touch history.
- **Money Printer / Revenue Manager** — opportunity selection, experiments, and measurable money path.
- **Worker hosts** — OVH/control-plane workers first; additional hosts join through the same registry and queue contracts.

## Execution plan

### Phase 1 — persist and see shared work

- [x] Define the canonical work-item and worker-registry contracts.
- [x] Define the lead-to-sale state machine and outbound policy.
- [x] Add an Agent Ops queue adapter instead of inventing another queue.
- [x] Add a canonical runtime sidecar keyed by the existing task ID.
- [x] Move Operator code-edit queueing onto the shared work-item contract as the first producer.
- [x] Teach Workboard to join Agent Ops `latest` records with runtime sidecars.
- [x] Show owner, workflow, worker/lane, human checkpoint, verification, and evidence count in Workboard.
- [ ] Keep this bridge covered by regression tests and merge only after CI is green.

### Phase 2 — route one real revenue opportunity

- [ ] Select one real CRM lead with a clear source and relationship classification.
- [ ] Create a `lead-to-sale` work item from the CRM record.
- [ ] Persist every stage transition from evidence, not manual narrative.
- [ ] Make the same item visible in Growth Desk and Workboard.
- [ ] Stop at the appropriate human checkpoint for known contacts or sensitive outbound.

### Phase 3 — real worker handoffs

- [ ] Connect Revenue Manager decisions to the worker registry.
- [ ] Let Research run in parallel on read lanes.
- [ ] Serialize identity-bound sends through the protected identity lane.
- [ ] Record worker/lane leases and completion evidence on the shared item.
- [ ] Make stale/failed workers recoverable without losing the work item.

### Phase 4 — event-driven revenue loop

- [ ] Ingest delivery failures and replies as evidence-driven transitions.
- [ ] Schedule follow-ups from the work item instead of chat history.
- [ ] Generate and track proposal state from the same opportunity.
- [ ] Verify payment before moving an opportunity to `won`.
- [ ] Feed lessons back into offer/message experiments and the next Business Manager decision.

### Phase 5 — graduate the persistence layer

- [ ] Choose the final private durable runtime store with scoped access and audit history.
- [ ] Migrate sidecar records behind the adapter boundary.
- [ ] Keep Agent Ops queue compatibility while workers migrate.
- [ ] Remove direct storage assumptions from product surfaces.

## Implementation status — 2026-09-12

The architecture, business roles, runtime contracts, lead-to-sale state machine, outbound policy, queue adapter, transitional sidecar, and Workboard runtime view are implemented on the current feature branch. Phase 1 is complete except for regression/CI verification and merge.

The next production milestone after Phase 1 is intentionally narrow: **route one real CRM lead through the same durable work item from research to a verified next step.**

Do not build separate Sales Bot, Marketing Bot, or Research Bot platforms. Build one Operator runtime with reusable role definitions, skills, work items, policies, workers, and handoffs.
