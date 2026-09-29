# 3DVR AV Booking Agent

## Product wedge

A focused 3DVR Agent for freelance audiovisual workers.

The first job is not “general AI.” The first job is to remove the repetitive work around finding and organizing freelance calls.

## Important: this is not greenfield

The portal already has most of the required pieces. The AV Booking Agent should be a **composition and integration layer**, not a parallel implementation.

Existing building blocks to reuse:

- `docs/digital-twin-booking-agent.md` — already defines the portable booking-agent architecture, normalized opportunity model, connector strategy, approval model, queue priorities, activity ledger, and multi-user direction.
- `/work-agent/` + `work-agent/README.md` — already defines the AV-first worker-owned agent, worker profile/rate rules, Google mail/calendar connections, availability normalization, outreach state machine, approval gates, and owner-scoped data shape.
- `/av-freelance/` — already provides the AV-specific public product surface, worker/company opportunity intake, rate calculator, and links into Job Tracker and Work Agent.
- `/job-tracker/` — existing application/opportunity/follow-up tracking surface.
- `/freelance/` — Freelancer Desk, schedule coordinator, workspace, and booking policy.
- `/freelance/booking.html` — existing booking rules, source roster, rates, login state, and next actions.
- `docs/workforce-access-runbook.md` — existing Encore/IATSE/Lighthouse availability reconciliation and conflict rules.
- `/crm/` + agent CRM connectors — existing contact, relationship, activity, and follow-up primitives.
- `docs/opportunity-kernel.md` + Money Printer — existing scoring, evidence, economics, confidence, risk, and opportunity-learning primitives.
- `apps/agent/thomas-agent/node/outreach-draft-queue.js` — already contains an AV job-search mode.
- existing Gmail/Outlook/Calendar/browser/session infrastructure — reuse these connectors rather than adding another messaging or calendar stack.

The immediate engineering task is therefore to make these pieces feel like **one product**.

## Problem validation

Three immediate signals:

1. Thomas already needs help discovering, comparing, tracking, and responding to AV work.
2. A coworker is manually searching for videographer jobs while on shift.
3. Mark Wells has expressed interest in an AI assistant that can organize freelance calls and audiovisual work.

This is enough to justify tightening the existing AV/booking-agent work into a usable product.

## Core promise

**Your freelance work, organized automatically.**

The user-facing loop is:

**Find → Normalize → Score → Organize → Respond → Calendar → Follow up → Get paid**

Internally, each step should call existing 3DVR capabilities wherever possible.

## MVP user

Freelance and mixed-employment AV workers, including:

- videographers
- A1 / A2
- V1 / V2
- graphics operators
- camera operators
- projection / LED / playback techs
- general AV technicians
- stagehands and related event-production freelancers

## Integration map

### Find

Reuse the Digital Twin connector model, Thomas Agent job-search/outreach code, Gmail/Outlook readers, browser workers, freelance portals, staffing portals, IATSE, public job sources, referrals, and direct-client intake.

### Normalize

Use the normalized opportunity contract already defined by the Digital Twin / Booking Agent. Do not invent a second opportunity schema unless an existing field is genuinely missing.

### Score

Compose existing Opportunity Kernel / Money Printer scoring with worker-specific booking factors:

- skill fit
- availability
- travel
- rate
- conflict risk
- relationship value
- urgency
- confidence

Keep scores explainable and separately inspectable.

### Organize

The Opportunity Inbox becomes the thin shared UI over existing state.

Suggested user-facing states:

- **Act now**
- **Worth considering**
- **Waiting**
- **Booked**
- **Passed**

Map these onto existing job-tracker / outreach / booking states rather than creating another hidden state machine.

### Respond

Reuse Work Agent / Thomas Agent drafting, approval, and transport layers.

Default approval rule remains conservative for known contacts unless the user grants standing permission.

### Calendar / availability

Reuse Freelancer Desk, Google Calendar, Encore, IATSE, Lighthouse, and workforce reconciliation logic.

Do not create a separate availability database that can drift from the existing normalized availability blocks.

### Follow up / relationships

Reuse CRM contact/activity primitives and existing outreach state.

### Money

Reuse existing revenue / invoice / payment primitives where applicable. The booking agent should eventually answer not just “Did I book it?” but “Was I paid?”

## First pilots

### Thomas

Use the real existing AV search and booking infrastructure as the first integrated test environment.

Success metric: the agent surfaces useful work Thomas would otherwise have had to search for manually and keeps the opportunity state current without duplicating records across tools.

### Mark Wells

Potential early external pilot.

Initial focus: organize incoming freelance calls and availability rather than trying to automate everything.

Do not contact or enroll Mark without Thomas approving the outreach.

### Coworker workflow

The observed pain is manual videographer-job searching.

Use this as a benchmark: the product should reduce a repetitive manual search session to a short ranked feed with clear next actions.

## UX

Mobile-first.

The default screen should answer:

> What work needs my attention right now?

Each opportunity should expose:

- role
- date/time
- location
- rate/value
- fit reason
- conflict state
- source
- next action

Advanced CRM, infrastructure, connector, and queue details stay behind secondary surfaces.

## Architecture rule

**Integrate before inventing.**

Before adding a new model, store, queue, connector, contact record, opportunity record, scoring layer, calendar representation, or workflow state:

1. search the existing portal/runtime for an equivalent primitive;
2. extend the canonical primitive if needed;
3. add an adapter if two legacy shapes need bridging;
4. create something new only when neither option is sufficient.

This AV vertical should become a proof that the broader 3DVR capability platform can be assembled into a coherent product.

## MVP phases

### Phase 0 — Integration audit

- identify canonical opportunity schema
- identify canonical availability schema
- map Job Tracker states to Work Agent / booking states
- identify existing AV discovery sources
- identify which data currently lives in local storage, GunJS, SQLite, Postgres, or external providers
- eliminate obvious duplicate representations

### Phase 1 — Unified Opportunity Inbox

- render existing opportunities from canonical sources
- surface conflicts from existing availability logic
- surface scoring reasons from existing scoring primitives
- provide one primary action per opportunity
- link through to existing response/booking/contact flows

### Phase 2 — Useful automation

- recurring source checks
- deduplication
- alerts for high-fit calls
- response drafting
- calendar holds
- follow-up reminders
- outcome learning

### Phase 3 — Mark pilot

- separate user/twin profile
- separate source permissions
- incoming freelance-call organization
- mobile-first daily queue
- feedback on repeated usefulness and willingness to pay

### Phase 4 — Product

- simple onboarding
- managed connector setup
- reliable background worker
- portable/self-hosted path
- paid managed-service tier
- AV-company / crew-coordinator features later

## Business model hypothesis

Start as a managed service around open, portable infrastructure rather than pure SaaS.

Test:

- free/self-hosted core
- low-cost pilot
- monthly managed booking-agent subscription
- higher tier for active monitoring, persistent browser connectors, and assisted applications

Do not optimize pricing before validating repeated usage.

## Success metrics

The integrated product is working when it measurably improves at least one of:

- opportunities found
- response speed
- bookings won
- hours of manual searching avoided
- missed calls prevented
- schedule conflicts prevented
- duplicate admin eliminated
- money collected faster

The strongest metric is **additional booked work per user with less administrative effort**.

## Immediate build target

Do **not** build a new standalone booking-agent backend.

Build or refine the **Opportunity Inbox** as a unified view over the existing Work Agent, Job Tracker, booking/availability, CRM, and Opportunity Kernel primitives.

The first technical milestone is not “new feature count.” It is:

> One real AV opportunity can enter through an existing source, appear once in the Opportunity Inbox, show the correct availability/conflict and fit information, move through response/booking state, and remain traceable back to its source and activity history.
