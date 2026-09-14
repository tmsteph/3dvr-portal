# 3DVR Assembly

**Assembly is a people-coordination project built on the 3DVR Business Kernel.**

Its job is not to be another social network, CRM, company dashboard, or mandatory governance system. It helps a group of people form around a purpose, decide how they want to work together, make commitments, share resources, and turn coordinated effort into outcomes.

## Why it is separate

3DVR's kernel coordinates software and organizational primitives. Purpose Movement helps an individual discover a direction. Community helps builders support one another.

Assembly begins when the question changes from **"What do I want to build?"** to **"How do we organize ourselves to build this together?"**

Keeping that layer separate prevents business-specific assumptions from becoming kernel requirements and prevents community/social features from becoming governance infrastructure.

## Core graph

> Person → Assembly → Circle/Team → Initiative → Commitment → Outcome

Cross-cutting records attach to that graph:

- **Role** — responsibility or authority held by a member.
- **Decision** — a proposal, chosen path, rationale, participants, and decision method.
- **Resource** — money, equipment, space, knowledge, compute, inventory, or another shared asset.
- **Meeting/Event** — synchronous coordination and its resulting decisions or commitments.
- **Need/Offer** — something the group needs or something a member can provide.
- **Message** — communication evidence linked to the relevant initiative or commitment.

## Assemblies are neutral containers

An Assembly may represent a:

- project team
- startup or business
- family or household
- neighborhood group
- cooperative
- mutual-aid network
- open-source project
- club or creative collective
- nonprofit or volunteer effort
- DAO, with or without a token or blockchain

No governance model is assumed. A group may use a founder, vote, consent, delegation, elected roles, rough consensus, or another explicit method.

## Minimum useful product

Version 0 should answer six questions quickly:

1. Who is here?
2. Why are we together?
3. What are we doing now?
4. Who committed to what?
5. What decision or dependency is blocking progress?
6. What happened as a result?

The initial product surface should therefore focus on:

- assembly identity and purpose
- members and roles
- current initiatives
- commitments with owner and due date
- proposals/decisions
- needs, offers, and shared resources
- a compact Now / Next / Waiting view
- receipts/outcomes rather than engagement metrics

## Relationship to existing apps

Assembly should reuse, not replace:

- **Contacts** for person identity and relationships.
- **Projects/Tasks** for executable work where those records already exist.
- **Calendar** for time commitments.
- **Messenger/communications** for messages.
- **Finance/Billing** for authoritative money state.
- **Community** for discovery, support, and informal circles.
- **Purpose Movement / Launch Room** for turning personal purpose into an initial movement or project.
- **DAO pages** for governance research and blockchain/token experiments when a group chooses them.

Assembly's unique responsibility is the shared coordination graph connecting those records to membership, roles, commitments, and decisions.

## Kernel contract

Assembly is userspace. It should use kernel identity, capability discovery, policy, events, jobs, and audit rather than inventing its own integration layer.

Example future actions:

- `assembly.create`
- `assembly.invite_member`
- `assembly.assign_role`
- `assembly.create_initiative`
- `assembly.make_commitment`
- `assembly.propose_decision`
- `assembly.record_decision`
- `assembly.record_outcome`

Each action should declare authorization, side effects, visibility, reversibility, and audit behavior through the shared capability model.

## Privacy and trust

People-organizing data can be sensitive. Membership, private discussions, locations, schedules, household data, political/religious affiliation, conflict, and internal decisions must not be exposed through public Gun graphs or public JSON by default.

Start with public product framing and low-risk prototypes. Durable multi-user Assembly data should wait for an owner/workspace-scoped storage and permission model appropriate to the record.

## Product principle

> Social networks optimize attention. Assembly should optimize coordinated agency.

Success is not more posting. Success is that people understand each other, make explicit commitments, resolve decisions, share resources, and create outcomes they could not create alone.

## First build sequence

1. Publish the Assembly product framing and relationship to the kernel.
2. Reuse Contacts identity and Projects/Tasks links rather than creating duplicate people/work databases.
3. Define Assembly, Membership, Role, Initiative, Commitment, Decision, Resource, and Outcome schemas.
4. Add a private workspace-scoped persistence path before live multi-user data.
5. Build the first operational view: People / Now / Decisions / Needs.
6. Connect Purpose Movement so a movement can graduate into an Assembly when more people join.

## Implemented v0.1 workspace

The first working Assembly surface now lives at `/assembly/` and intentionally stores its coordination data in browser-local storage under `3dvr.assembly.v1`.

It provides four operational views:

- **People** — members and lightweight roles.
- **Now** — explicit commitments with owner and optional due date.
- **Decisions** — choices that still need resolution and a decision owner.
- **Needs** — visible asks that could unblock a person or group.

The workspace also stores the Assembly name and purpose, shows a compact pulse of open work, and lets users complete or resolve records. This is deliberately a single-device prototype. Multi-user sync should not be added until workspace-scoped identity, authorization, privacy, and durable storage are defined.

## Implemented v0.2 coordination loop

Assembly now adds **Initiatives** between shared purpose and individual commitments. A commitment can remain in General or link to a named initiative with a lightweight lead, which keeps the workspace useful before it grows into a full project-management system.

Completing a commitment no longer makes the work disappear. It records `doneAt` and renders the most recent completed commitments as **Outcome receipts**, preserving a visible trail of what the group actually accomplished. This keeps the product centered on movement and results rather than posting or activity counts.

## Portable workspace boundary

Assembly now has an explicit, versioned `3dvr-assembly` JSON snapshot format. Export is always user-triggered, and import replaces only the browser-local copy on the current device after validating and normalizing the file. Unknown fields are discarded instead of silently becoming trusted workspace state.

This gives people a private backup and transfer path before multi-user sync exists, while also creating a stable serialization boundary that future encrypted workspace storage can reuse.

## Decision ledger

Open decisions now require an explicit recorded resolution before they leave the active list. The resolved choice, original question, owner, and resolution time stay in a local **Decision ledger** and travel with the versioned Assembly snapshot. This turns decisions into organizational memory instead of disposable checklist items.
