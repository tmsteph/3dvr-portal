# An Open Package for a Persistent Digital Twin

Updated: October 2, 2026. Status: product direction and proposed integration; not a claim of production readiness.

## The goal

A person should be able to delegate from a phone or any other device: create an account, arrange an appointment, organize freelance work, or operate a business. The twin should retain context, use approved accounts, report outcomes, and continue between conversations.

The product promise is: connect your accounts, set your permissions, and delegate. Provider-enforced identity checks still require a human handoff.

## Why the existing system feels brittle

The motivating failures are forgotten capabilities, repeated authentication, interrupted tasks, and exhausted model allowances. A new chat must not erase the system's understanding of available tools. A provider quota must not erase work already completed.

These are integration and reliability problems. Build on the existing Portal rather than starting another assistant application.

## The package

| Component | Responsibility |
| --- | --- |
| Operator | Mobile-friendly conversation, task status, approvals, and handoffs |
| Capability registry | Available tools, verified account access, failure reasons, and recovery routes |
| Durable task store | Goals, checkpoints, receipts, budgets, and pending approvals |
| Agent runtime | Planning and bounded execution; integrate the existing OpenClaw runtime where appropriate |
| Secrets Broker | Policy-controlled credential use through existing vault adapters |
| API and browser adapters | Execute authorized service actions and preserve canonical sessions |
| Model router | Choose intelligence within budget and queue work when capacity is unavailable |
| Recovery and audit | Explain what happened, reconcile uncertain actions, and resume safely |

The interface can change without replacing the twin's identity, records, or permissions. Model providers should be replaceable without migrating the user's whole life.

## Reuse what exists

Repository documents already describe the capability registry, persistent browser lanes, Secrets Broker, encrypted handoff, and OpenClaw runtime. Their existence is evidence of foundations, not proof that every connection currently works.

The OpenClaw runtime map last verified in September places the canonical runtime on Hetzner. OVH owns persistent authenticated browser state and production/control/recovery. Do not relocate workers to OVH merely because it is the control anchor. Check live capacity and service identity before runtime changes.

Use these canonical sources:
- [Access continuity](/docs/access-continuity.md)
- [Persistent access contract](/docs/persistent-access-contract.md)
- [OpenClaw runtime map](/docs/openclaw-runtime-map.md)
- [Infrastructure topology](/docs/infrastructure-topology.md)

## Open-source direction

Publish an integrated installation path, documented adapter contracts, safe sample configuration, upgrade/rollback instructions, and recovery tests. Keep credentials and personal state outside the public repository.

Reuse upstream projects and contribute fixes when possible. Review each dependency's license before redistribution: open source, fair-code, and source-available licenses are different.

Revenue can come from managed hosting, setup, support, and accountable operations while the open core remains useful.

## First useful demonstration

Use the AV freelancer workflow as a bounded pilot: collect permitted opportunities, compare them with availability, and prepare a response. Sending to a contact requires the user's authorization. Validate the same task across a new conversation, worker restart, expired access, and exhausted model quota.

Success means the person can see progress and the twin can resume from recorded evidence.

## Related documents

- [Secure access and authorization passthrough](/research/digital-twin-secure-access/)
- [Reliability and affordable operation](/research/digital-twin-reliability/)

## External building blocks

These links identify related projects; they do not establish that a complete turnkey package meets this contract.
- [OpenClaw overview](https://docs.openclaw.ai/help/faq/what-is-openclaw)
- [n8n documentation](https://docs.n8n.io/)
