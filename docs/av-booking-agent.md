# 3DVR AV Booking Agent

## Product wedge

A focused 3DVR Agent for freelance audiovisual workers.

The first job is not “general AI.” The first job is to remove the repetitive work around finding and organizing freelance calls.

## Problem validation

Three immediate signals:

1. Thomas already needs help discovering, comparing, tracking, and responding to AV work.
2. A coworker is manually searching for videographer jobs while on shift.
3. Mark Wells has expressed interest in an AI assistant that can organize freelance calls and audiovisual work.

This is enough to justify a narrow MVP before attempting a broad assistant product.

## Core promise

**Your freelance work, organized automatically.**

The agent should continuously turn scattered job opportunities into a short, useful queue:

**Find → Normalize → Score → Organize → Respond → Calendar → Follow up**

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

## MVP workflow

### 1. Find

Collect opportunities from sources the worker already uses:

- job boards
- freelance marketplaces
- union / dispatch calls
- email
- text / messaging channels
- company portals
- referrals and direct clients

The system should prefer reusable connectors and browser automation over source-specific one-off scripts.

### 2. Normalize

Convert every opportunity into one common record:

- role
- company / client
- event
- date and time
- location
- rate
- estimated hours
- required skills
- source
- response deadline
- contact
- status
- notes

### 3. Score

Score against the worker's profile:

- skill fit
- availability
- travel distance
- rate
- schedule conflicts
- preferred companies
- relationship / repeat-client value
- career value
- confidence in the extracted information

The score should be explainable, not a black box.

### 4. Organize

Show a very small action queue:

- **Act now**
- **Worth considering**
- **Waiting**
- **Booked**
- **Passed**

The default mobile view should answer: “What should I deal with next?”

### 5. Respond

Generate the reply, application, or availability response.

Autonomy rule:

- fresh public leads can be handled with higher automation when the user has enabled it
- known personal/professional contacts require approval before sending unless the user has explicitly granted a narrower standing permission

### 6. Calendar

Before committing:

- check existing work
- detect overlaps
- include commute / travel buffer
- tentatively hold opportunities when useful
- convert holds to confirmed bookings when accepted

### 7. Follow up

Track:

- unanswered applications
- tentative holds
- confirmations
- call sheets / event details
- payment status
- invoices
- repeat-client follow-up

## First pilots

### Thomas

Use the full workflow against his current AV job search and freelance pipeline.

Success metric: the agent surfaces useful work Thomas would otherwise have had to search for manually and keeps the opportunity state current.

### Mark Wells

Potential early external pilot.

Initial focus: organize incoming freelance calls and availability rather than trying to automate everything.

Do not contact or enroll Mark without Thomas approving the outreach.

### Coworker workflow

The observed pain is manual videographer-job searching.

Use this as a benchmark: the product should reduce a session of repetitive manual searching to a short ranked feed.

## UX

Mobile-first.

Home screen should be closer to:

> 3 good calls need your attention.

than:

> Welcome to your AI-powered audiovisual workforce optimization dashboard.

Each opportunity should expose:

- role
- date
- location
- money
- fit
- conflict
- next action

Everything else is secondary.

## Architecture

Reuse the existing 3DVR Agent / portal capability layer.

Suggested primitives:

- worker profile
- source connector
- opportunity
- availability block
- application / response
- booking
- contact
- invoice / payment state
- audit log

Avoid embedding business logic in individual scraping integrations.

Each source should feed the same opportunity schema.

## MVP phases

### Phase 0 — Thomas as test user

- one unified opportunity feed
- manual + automated opportunity import
- availability conflict checking
- simple scoring
- response drafting
- status tracking

### Phase 1 — Useful automation

- recurring source checks
- deduplication
- alerts for high-fit calls
- calendar holds
- follow-up reminders
- reusable worker profile

### Phase 2 — Mark pilot

- separate user profile
- separate source permissions
- incoming freelance-call organization
- mobile-first daily queue
- feedback on what he would pay for

### Phase 3 — Product

- simple onboarding
- source connection
- freelancer profile
- booking-agent dashboard
- paid plan / managed service
- AV-company / crew-coordinator features later

## Business model hypothesis

Start as a managed service, not pure SaaS.

Possible early pricing to test:

- free / low-cost pilot
- monthly booking-agent subscription
- higher tier for active source monitoring and assisted applications
- optional percentage / fixed fee for directly sourced work only if users clearly prefer that model

Do not optimize pricing before validating repeated usage.

## Success metrics

The MVP is working when it measurably improves at least one of:

- opportunities found
- response speed
- bookings won
- hours of manual searching avoided
- missed calls prevented
- schedule conflicts prevented
- money collected faster

The strongest metric is **additional booked work per user**.

## Immediate build target

Build one screen in the portal that can represent the entire loop:

**Opportunity Inbox**

Each row/card:

- job
- date/time
- location
- rate
- match score + reason
- conflict state
- source
- status
- primary action

Do not start by building a large CRM.

The opportunity inbox is the product wedge.
