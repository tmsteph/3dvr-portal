# 3DVR Product Architecture

Status: working product-design direction, August 2026.

## Product design rule

3DVR should feel like one coherent system, not a collection of experiments.

Every user-facing product must answer four questions:

1. Who is it for?
2. What single job does it do?
3. Why is it separate from another 3DVR product?
4. What is the obvious next place to go afterward?

If two products cannot answer those questions differently, merge them.

## Core mental model

### Portal
**Job:** Home and navigation.

The Portal is the front door. It should not try to be another workspace itself. It should show identity/status, Operator, a small number of primary destinations, and search for everything else.

### Operator
**Job:** Tell 3DVR what you want and let the system act.

Operator is the conversational control layer across 3DVR. It should route work into the appropriate product rather than duplicate the product's entire UI.

### Guide
**Job:** Help me decide what to do next when I am unclear or stuck.

Guide should become the canonical general-purpose direction product.

Merge into Guide:
- Existing `forge/` guided Sort → Shape → Plan experience.
- `next-move-lab/` direction/decision experience.

Guide should output a clear next move and optionally hand off to Daily Direction, Launch Room, Growth, Projects, or Forge.

### Daily Direction
**Job:** Check in today and choose one small next step.

Keep separate from Guide. Daily Direction is intentionally lightweight, recurring, and day-specific. It is closer to a daily ritual than a general decision tool.

### Forge
**Job:** Make, change, and track things.

Forge should become the canonical build/change system used by Operator and developers. It should own:
- queued edits
- suggestions
- code-change records
- sync state
- build/change history
- links to resulting commits or deployed changes

The name Forge fits this infrastructure better than the previous guided-planning experience.

### Launch Room
**Job:** Turn a meaningful direction into a project or movement.

Keep separate. Launch Room produces a Movement Brief: purpose, vision, audience, tiny project, launch checklist, and next actions. It is a deeper project-formation flow than Guide.

### Projects
**Job:** Give active projects a durable home.

Projects should represent the persistent object after something is launched: mission, stage, needs, offers, updates, supporters, and next steps.

Tasks should eventually become a view or capability inside Projects/Operator rather than a top-level product. The current `/tasks/` route already redirects to a legacy task board, which is a signal that it should not remain a first-class standalone app.

### Growth
**Job:** Find and move real customers/work forward.

Growth Desk and Revenue Desk currently overlap heavily. Consolidate them into one customer/revenue operating product, likely named **Growth** or **Growth Desk**.

Growth should own:
- leads and outreach
- CRM activity
- follow-ups
- proposals / paid asks
- revenue priorities
- revenue snapshot

CRM, Lead Finder, Billing, Market Pulse, and specialized tools can remain capabilities or focused subviews rather than competing top-level destinations.

### Web Builder
**Job:** Build and publish a website/page.

Keep as a specialist creation tool. Forge may trigger changes to code, while Web Builder is the direct user-facing page/site builder.

## Proposed top-level navigation

Keep the first layer very small:

- Operator
- Guide
- Growth
- Projects
- Forge
- More

Daily Direction can be prominent contextually (for example, on the home screen in the morning) without becoming another permanent top-level category.

Launch Room can appear as the natural handoff from Guide when someone is ready to turn direction into a project.

Web Builder can appear from Projects, Launch Room, and Forge when a site/page is the next action.

## Consolidation decisions

### Merge

**Old Forge + Next Move Lab → Guide**

Reason: both ask what feels stuck, gather context, and return a practical next step. Maintaining both creates conceptual duplication.

**Growth Desk + Revenue Desk → Growth**

Reason: both operate the same underlying customer/revenue loop. One focuses more on outreach and the other on money/follow-up, but users should not have to decide which desk contains the next revenue action.

**Tasks → Projects / Operator capability**

Reason: tasks are a primitive, not a product category. They should live where the work lives.

### Keep distinct

**Daily Direction** — daily ritual / check-in.

**Launch Room** — project/movement formation.

**Projects** — durable project homes.

**Forge** — changes/builds and their lifecycle.

**Web Builder** — direct site/page creation.

**Operator** — system-wide conversational control.

## Naming principles

Prefer names that describe a stable role in the system rather than one experiment's implementation.

Good names should:
- remain understandable without 3DVR history
- avoid synonyms for another product
- describe the user's mental model, not internal architecture
- survive feature growth

Current recommended names:

- Portal
- Operator
- Guide
- Daily Direction
- Growth
- Launch Room
- Projects
- Forge
- Web Builder

## Migration order

1. Stop adding new top-level app names unless a genuinely new job exists.
2. Reserve **Forge** for the current code/build/change system.
3. Create **Guide** as the canonical direction flow and migrate the best pieces of old Forge and Next Move Lab into it.
4. Remove old Forge wording from the planning experience and redirect old planning links safely.
5. Consolidate Growth Desk and Revenue Desk into a single Growth experience.
6. Move Tasks under Projects/Operator and retire the top-level Tasks entry.
7. Redesign Portal navigation around the reduced product set.
8. Preserve old URLs with redirects so existing links do not break.

## Product-quality gate

Before creating a new app or top-level name, ask:

> Can this be a feature, mode, view, or workflow inside an existing 3DVR product?

If yes, do that first.
