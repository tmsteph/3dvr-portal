# Embedded AI Integration Principles

3DVR should treat AI as an intelligence layer woven through the Portal, not as a chatbot bolted onto the side.

This note complements `agentic-business-os-roadmap.md` and `OPERATING_SYSTEM.md`. It focuses on how AI should appear inside the product and how the Portal should expose its capabilities to agents.

## Core Principle

> Put intelligence where the work already happens.

A user working with a lead, project, calendar event, message, invoice, server, document, or task should not need to leave that workflow and open a separate AI destination.

AI should be able to understand the current object, relevant history, available tools, permissions, and desired outcome directly from that context.

## Architecture Model

Think of 3DVR as a small open business kernel:

- **Portal state and domain primitives** are the kernel objects.
- **Tools and APIs** are the system calls.
- **Operator** is the natural-language control surface.
- **Agents** are long-running processes or daemons that pursue bounded goals.
- **AI models** are replaceable intelligence engines, not the product boundary.
- **Humans** retain root authority.

The UI, automations, and agents should use the same underlying primitives whenever possible. An agent should not need secret back doors that the rest of the system cannot observe or audit.

## Shared Intelligence Layer

Avoid building isolated AI features for every application. Build one shared layer that can reason across Portal objects and expose context-sensitive capabilities to each surface.

For example:

- CRM: summarize a relationship, identify the next action, draft or schedule a follow-up.
- Projects: detect blockers, propose tasks, update status from evidence.
- Calendar: understand commitments, conflicts, deadlines, and preparation work.
- Communications: summarize threads, draft replies, route approvals, and follow up.
- Revenue: connect leads, proposals, invoices, payments, and delivery state.
- Infrastructure: inspect health, diagnose failures, propose repairs, and safely execute approved actions.
- Knowledge: turn completed work and corrections into reusable documentation and policy.

The important part is that these are not separate minds. They are views into the same governed intelligence layer.

## Agent Loop

The default operational loop should be:

```text
Observe -> Understand -> Plan -> Act -> Verify -> Learn -> Repeat
```

Every cycle should leave useful state behind: logs, evidence, decisions, updated objects, and lessons that can improve the next run.

## Progressive Autonomy

Autonomy should be earned by workflow and risk level rather than enabled globally.

A useful progression is:

1. **Suggest** — AI explains what it would do.
2. **Draft** — AI prepares the action for review.
3. **Approve and execute** — AI acts after human approval.
4. **Policy-controlled autonomy** — routine low-risk actions run automatically within explicit boundaries.
5. **Escalate** — uncertainty, money, credentials, destructive actions, unusual external communication, or policy conflicts return to a human.

This allows the Portal to become increasingly self-steering without giving up human authority.

## Required System Properties

Embedded AI should be:

- **Contextual** — understands the object and workflow currently in view.
- **Actionable** — can use real tools rather than only produce text.
- **Observable** — actions, evidence, and outcomes are logged.
- **Permissioned** — the agent only receives capabilities allowed by policy.
- **Reversible where possible** — prefer actions that can be rolled back or repaired.
- **Provider-independent** — models can improve or change without rewriting the business system.
- **Open and composable** — capabilities should be reusable from the Portal, CLI, agents, and external integrations.
- **Self-improving** — verified outcomes and human corrections should improve documentation, policies, prompts, tests, and workflows.

## Product Rule

Before adding a new standalone AI screen, ask:

> Could this intelligence appear directly inside the workflow where the user already needs it?

If yes, embed it there and expose the same capability to Operator and agents.

## Direction

The goal is not a business application with AI features.

The goal is a human-governed business kernel whose objects, tools, policies, and feedback loops are understandable and operable by both people and agents.

That is the foundation for a Portal that can increasingly steer, maintain, and improve itself while remaining inspectable and under human control.
