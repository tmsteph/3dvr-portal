# 3DVR Operating System

This document is the canonical operating contract for how 3DVR captures reality, decides what matters, executes work, and records outcomes.

The goal is not another dashboard. The goal is one understandable loop that connects the Portal, CRM, Agent, Money Printer, Calendar, Projects, Billing, communications, and infrastructure.

## Core loop

> Capture → Decide → Execute → Record → Learn

Every useful item should move through this loop. Chat messages, inboxes, dashboards, and agent reports are interfaces into the loop, not sources of truth by themselves.

## Canonical entity graph

The minimum business graph is:

> Person → Organization → Opportunity → Project → Task → Outcome

Cross-cutting records attach to that graph:

- **Message** — communication evidence and drafts/sends tied to a person, organization, opportunity, project, or task.
- **CalendarEvent** — time commitment tied to a person, project, task, or follow-up.
- **Payment** — quote, checkout, invoice, payment, refund, or payout tied to an opportunity/project.
- **DemandSignal** — source-attributed evidence that a buyer need exists; feeds opportunities.
- **Artifact** — proposal, contract, page, file, deliverable, screenshot, or other output.
- **Decision** — durable record of a meaningful choice, why it was made, and what it changes.

IDs should be durable and references should be explicit. Do not silently duplicate the same real-world person or opportunity across subsystems.

## Source-of-truth rules

1. **CRM owns relationships.** People, organizations, relationship state, last contact, next action, and follow-up date live here.
2. **Opportunity Engine owns demand evidence.** DemandSignal and opportunity evidence retain source, provenance, permission/policy state, urgency, confidence, value, cost, and expiration.
3. **Projects own committed work.** Once an opportunity is won, fulfillment should move into a project with clear ownership and deliverables.
4. **Tasks own executable work.** Every active project and opportunity should expose a next executable action.
5. **Calendar owns time commitments.** A follow-up date or deadline that matters should be represented as time, not buried in prose.
6. **Billing owns money state.** Revenue is real when payment state says it is real; chat summaries do not override payment records.
7. **GitHub/docs own durable technical decisions.** Architecture and runbooks should not depend on remembering a chat thread.
8. **ChatGPT/Agent is the operator, not the database.** It reads the sources of truth, advances work, writes receipts, and escalates exceptions.

## Required fields for active work

Every active opportunity, customer, project, or internal product effort must have:

- owner
- state
- expected outcome
- next action
- next action owner
- due/follow-up date when applicable
- last material change
- linked evidence/artifacts

If an item has no next action, it is either complete, waiting, someday/labs, or malformed.

## Working states

Use a small operational vocabulary across products:

- **Now** — executable and worth doing now.
- **Next** — ready after current work or at a known time.
- **Waiting** — blocked on another person/system/event; must include what unlocks it.
- **Someday/Labs** — intentionally not active.
- **Done** — outcome reached and receipt recorded.
- **Dropped** — explicitly stopped, with reason when useful for learning.

Product-specific statuses may be richer, but they must map back to one of these operational states.

## Opportunity lifecycle

DemandSignal → Opportunity → Proposal/Offer → Won/Lost → Project → Delivery → Payment → Outcome → Reputation/Learning

An opportunity should link forward as it progresses instead of spawning unrelated copies of the same work.

Minimum opportunity links:

- `personId`
- `organizationId`
- `projectId` once won/committed
- `taskIds`
- `messageIds`
- `calendarEventIds`
- `paymentIds`
- `artifactIds`

These references may be empty while the opportunity is young, but the schema should support them from the beginning.

## Communication model

All channels should eventually feed one communication layer: Gmail, 3dvr.tech mail, SMS, WhatsApp, forms, and other approved channels.

The system should:

1. ingest permitted messages/events,
2. identify the person/organization,
3. attach the message to the right opportunity/project when possible,
4. extract promises, asks, dates, money, and next actions,
5. update CRM state,
6. draft or execute the next communication according to the configured approval boundary,
7. record the result.

Do not create a second CRM inside an email/SMS integration.

## Autonomy model

Use capability-specific trust, not one global autonomy switch:

1. Observe and organize.
2. Draft and prepare.
3. Execute one approved action.
4. Execute within an explicitly bounded policy/campaign/workflow.
5. Escalate exceptions or sensitive decisions.

Human approval remains required where configured for external communication, spending, pricing/contract changes, hiring/pay decisions, release of funds, sensitive identity/security actions, or ambiguous new data sources.

## Daily operator loop

The operator should prioritize material movement, not reporting activity:

1. Check urgent calendar/deadline/payment/customer exceptions.
2. Process new messages and demand signals into the canonical graph.
3. Advance the highest-value executable next action.
4. Follow up on waiting items that are due.
5. Close loops: record sent/replied/paid/shipped/won/lost outcomes.
6. Surface only decisions or exceptions that need Thomas.

A run that only restates unchanged status should stay quiet.

## Weekly founder loop

Once per week:

- review revenue and paid conversions
- review active opportunities and expected value
- review delivery health and customer satisfaction
- review waiting items with stale follow-ups
- review what shipped in the Portal
- move speculative work back to Labs when it is distracting from revenue/customer outcomes
- update the command brief with the few priorities that matter next

The weekly release cadence is a checkpoint, not a reason to freeze useful continuous integration while the product remains early.

## Infrastructure roles

- **Portal** — human-facing operating surface.
- **CRM** — relationship source of truth.
- **Money Printer / Opportunity Engine** — demand, offers, acquisition, and revenue loop.
- **Agent** — orchestration and operator actions.
- **GitHub** — code, technical history, issues, releases, and durable engineering documentation.
- **OVH** — primary persistent control-plane/worker lane unless a documented service-specific decision says otherwise.
- **DigitalOcean / Hetzner / other hosts** — specialized workers, development, redundancy, or recovery lanes as documented.
- **Bitwarden/secrets backends** — interchangeable secure secret/document backends behind scoped access, not the conceptual center of the system.

## First implementation priority

Do not redesign everything at once. The first implementation step is to make opportunity records capable of linking to the rest of the operating graph without breaking the current Opportunity Engine.

Then, in order:

1. add canonical relationship/link fields to Opportunity Engine records,
2. make CRM and Opportunity Engine cross-link instead of duplicating leads,
3. make every active CRM opportunity expose one next action and follow-up date,
4. attach messages/calendar/payment receipts to the same record graph,
5. create a compact operator view of Now / Next / Waiting,
6. automate bounded ingestion and follow-up around that model.

## Definition of success

The system is working when Thomas can ask one question — "What should we do next?" — and the answer is derived from current calendar, relationships, opportunities, commitments, money state, and waiting dependencies, with enough evidence to act immediately.
