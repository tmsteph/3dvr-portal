# Civic Operating System Plan

## Purpose

This document turns the civic infrastructure idea into a concrete 3DVR product
plan.

The goal is not to build another social network for outrage. The goal is to
build open-source civic infrastructure that helps regular people understand
public issues, verify claims, organize locally, protect vulnerable people, and
take grounded action.

The simplest framing:

```text
Power should be visible.
Tools should be public.
People should be able to help.
```

This plan should stay connected to the 3DVR operating rule:

```text
Sell first. Build second. Keep it simple.
```

That means the first version should not try to coordinate every public issue. It
should help one person or one small group understand one real issue and take one
real action.

## Core Principle

Most people are kept powerless because they are separated from:

```text
information
coordination
tools
money
legal knowledge
technical knowledge
each other
```

The system should do the opposite:

```text
make knowledge public
make participation easy
make decision-making visible
make local action possible
```

## Product Thesis

3DVR can help people, small businesses, creators, communities, and citizens
build their own digital infrastructure instead of depending entirely on
corporate platforms.

That includes:

- Websites
- CRMs
- Local directories
- Public knowledge bases
- Community portals
- Member systems
- Transparent project pages
- Open-source civic tools

The deeper brand is not only affordable websites. Affordable websites are the
entry point.

The broader mission:

```text
Help people own their presence, organize their community, and distribute power.
```

## Product Name Options

Possible names:

- Citizen OS
- Civic OS
- Citizen Audit Kit
- Public Signal
- Local Ledger
- Open Civic Toolkit
- 3DVR Civic Lab

Recommended initial naming:

```text
3DVR Civic Lab
```

The first working tool inside it:

```text
Citizen Audit Kit
```

This keeps the big vision flexible while giving the MVP a clear practical job.

## Non-Goals

The first version should not be:

- A social network
- A public accusation feed
- A private evidence vault
- A substitute for journalism
- A substitute for legal advice
- A substitute for emergency support
- A place for doxxing or harassment
- A place to publish sensitive personal disclosures by default
- A truth engine that pretends to prove more than it can
- A giant governance platform before one small workflow works

The platform can support public accountability without becoming unsafe,
paranoid, or careless.

## Product Values

### Verify Before Amplifying

Every public claim should be connected to a source, a confidence level, and a
clear distinction between:

- Confirmed
- Alleged
- Reported
- Inferred
- Open question
- Opinion
- Personal experience

The rule:

```text
No source, no certainty.
```

### Calm Beats Viral

The product should reduce panic and confusion. It should turn concern into
understanding, then into specific action.

Good interface language:

- What is known?
- What is still unclear?
- Who has authority?
- What can citizens do?
- What is the next useful task?
- What source supports this?

Avoid interface language:

- Expose them
- Destroy them
- They are all corrupt
- Wake up sheeple
- Trust me
- Spread this everywhere

### Participation Should Be Small

People should be able to help in less than ten minutes.

Examples:

- Summarize one document
- Add one source link
- Tag one date
- Write one public comment draft
- Verify one meeting time
- Translate one paragraph into plain language
- Find contact information for one relevant office
- Add one timeline event

Small contributions become collective intelligence.

### Reputation Through Reliability

Do not reward the loudest person. Reward the most reliable behavior.

Trust signals should come from:

- Citing sources
- Correcting mistakes
- Completing tasks
- Helping others understand
- Staying calm under pressure
- Protecting privacy
- Refusing to spread unverified claims

Avoid follower-count dynamics as the primary status layer.

### Protection Comes First

The platform must not pressure vulnerable people to publish sensitive stories
into a public feed.

Safe pathways should guide users toward:

- Private documentation
- Trusted advocates
- Legal or professional support when appropriate
- Journalists or organizations with secure intake processes when appropriate
- Privacy-preserving next steps

The product stance:

```text
We believe you. We also protect you.
```

## First Public Route

Initial route:

```text
/citizen/
```

Possible title:

```text
Citizen OS
```

Subtitle:

```text
Open-source civic tools for learning, verifying, organizing, and taking local action.
```

Primary sections:

1. Learn
2. Verify
3. Act
4. Build
5. Protect

The first page should be a polished landing and launchpad, not a huge database.

## First Tool: Citizen Audit Kit

Route:

```text
/citizen/audit-kit/
```

Purpose:

Help someone create a public issue page that separates facts, sources, open
questions, institutions, timelines, and actions.

This should work for local civic issues such as:

- A city council decision
- A public budget question
- A school board issue
- A local infrastructure concern
- A public contract
- A local business or worker support campaign
- A nonprofit transparency project
- A community safety question

It should not be framed as a tool for attacking individuals.

## Citizen Audit Page Structure

Each audit page should include:

```text
Issue title
Short summary
Status
Location or jurisdiction
Confirmed facts
Open questions
Timeline
Source links
Relevant institutions
People or offices with authority
Citizen action steps
Volunteer tasks
Corrections log
Last reviewed date
```

Recommended labels:

- Confirmed
- Alleged
- Reported
- Needs source
- Open question
- Action available
- Archived

## MVP User Flow

1. User opens `/citizen/`.
2. User chooses `Create an Audit`.
3. User enters an issue title and short summary.
4. User adds at least one source link.
5. User adds confirmed facts and open questions.
6. User adds one relevant institution or decision-maker.
7. User adds one action step.
8. User publishes or saves a draft.
9. Other users can contribute small verification tasks.
10. Corrections remain visible so trust improves over time.

## Module Plan

### 1. Public Knowledge Library

Purpose:

Explain complex issues in plain language.

Question format:

- What happened?
- What is confirmed?
- What is alleged?
- What documents support this?
- Who has authority to act?
- What can citizens do?
- What should not be assumed?

The library should make complexity readable without flattening uncertainty.

### 2. Source Archive

Purpose:

Store and organize public sources.

Source types:

- Court filings
- Government reports
- Meeting minutes
- Public budgets
- Public contracts
- Public-records request results
- Investigative journalism
- Official datasets
- Timelines
- Public statements

Every source should have:

```text
title
url
source type
publisher
date published
date retrieved
summary
relevant excerpts or notes
confidence
linked audit IDs
```

Do not copy copyrighted source material in full. Store summaries, metadata,
short fair-use excerpts when appropriate, and links to the original documents.

### 3. Local Action Hubs

Purpose:

Turn helplessness into local action.

Users enter a city, county, region, or topic and see:

- Local representatives
- School board meetings
- City council agendas
- Public comment deadlines
- Local nonprofits
- Mutual aid groups
- Volunteer opportunities
- Petitions
- Watchdog projects
- Open audits

The first version can use manually maintained entries. Later versions can add
public-data imports.

### 4. Citizen Research Tasks

Purpose:

Break civic work into small useful actions.

Task examples:

- Summarize one document
- Tag names and dates
- Build a timeline event
- Compare two records
- Find a missing link
- Translate legal language into plain language
- Verify a claim
- Map an institution
- Draft a respectful public comment
- Check whether an action link still works

Task states:

```text
open
claimed
needs review
accepted
needs correction
archived
```

### 5. Contribution Trust Signals

Purpose:

Help people know who is reliable without creating influencer dynamics.

Possible trust indicators:

- Source-backed contributions
- Accepted corrections
- Completed verification tasks
- Respectful collaboration
- Privacy-safe behavior
- Revisions accepted by maintainers

Avoid simplistic scores that can be gamed or turned into clout.

### 6. Transparent Funding

Purpose:

Support local projects without hiding power.

Funding pages should show:

- Goal
- Amount raised
- Who controls the funds
- Intended use
- Expenses
- Receipts or source documents when appropriate
- Outcomes
- Remaining balance

This can start as a static transparency template before any payment processing
exists.

### 7. Protection And Privacy Pathways

Purpose:

Help people act safely.

The app should include guidance such as:

- Do not publish private addresses, phone numbers, or sensitive identifying
  details.
- Do not publish unverified accusations as facts.
- Keep sensitive notes private unless you understand the risk of sharing.
- Use secure channels for sensitive tips.
- Talk to appropriate professionals for legal, medical, safety, or crisis
  situations.
- Stop and get support if a task becomes distressing or unsafe.

No public page should pressure a person into disclosure.

## Data Model

GunJS should be the shared source of truth when the product moves beyond static
templates.

Root path:

```js
gun.get('3dvr-portal').get('citizen')
```

Suggested nodes:

```text
3dvr-portal/citizen/audits/{auditId}
3dvr-portal/citizen/audits/{auditId}/sources/{sourceId}
3dvr-portal/citizen/audits/{auditId}/facts/{factId}
3dvr-portal/citizen/audits/{auditId}/questions/{questionId}
3dvr-portal/citizen/audits/{auditId}/timeline/{eventId}
3dvr-portal/citizen/audits/{auditId}/actions/{actionId}
3dvr-portal/citizen/audits/{auditId}/tasks/{taskId}
3dvr-portal/citizen/audits/{auditId}/corrections/{correctionId}
3dvr-portal/citizen/sources/{sourceId}
3dvr-portal/citizen/regions/{regionId}
3dvr-portal/citizen/contributors/{authorId}
```

### Audit Record

```js
{
  id: 'audit_...',
  app: 'citizen-audit-kit',
  version: 1,
  title: 'City budget hearing for public park improvements',
  summary: 'Plain-language summary of the issue.',
  status: 'draft',
  regionId: 'san-diego-ca',
  topicTags: ['budget', 'parks', 'city-council'],
  confidence: 'needs-sources',
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
  createdBy: {
    id: 'guest-or-sea-id',
    pub: 'optional-sea-pub',
    alias: 'optional-alias',
    isGuest: true
  }
}
```

### Source Record

```js
{
  id: 'src_...',
  auditId: 'audit_...',
  title: 'Meeting agenda',
  url: 'https://example.gov/agenda',
  sourceType: 'official-record',
  publisher: 'City Council',
  publishedAt: '2026-06-01',
  retrievedAt: '2026-06-05T00:00:00.000Z',
  summary: 'Agenda item related to park improvements.',
  confidence: 'documented',
  addedBy: 'author-id'
}
```

### Fact Record

```js
{
  id: 'fact_...',
  auditId: 'audit_...',
  text: 'The council scheduled a hearing for June 10.',
  confidence: 'confirmed',
  sourceIds: ['src_...'],
  createdAt: '2026-06-05T00:00:00.000Z',
  createdBy: 'author-id'
}
```

### Action Record

```js
{
  id: 'action_...',
  auditId: 'audit_...',
  actionType: 'public-comment',
  title: 'Submit a public comment before the hearing',
  instructions: 'Use a respectful tone and cite the agenda item.',
  dueAt: '2026-06-10T17:00:00.000Z',
  url: 'https://example.gov/comment',
  status: 'open'
}
```

### Research Task Record

```js
{
  id: 'task_...',
  auditId: 'audit_...',
  title: 'Summarize the budget attachment',
  taskType: 'summarize-document',
  status: 'open',
  claimedBy: null,
  result: '',
  sourceIds: ['src_...'],
  createdAt: '2026-06-05T00:00:00.000Z'
}
```

## Interface Patterns

### Five Top-Level Lanes

The `/citizen/` page should use five clear lanes:

```text
Learn
Verify
Act
Build
Protect
```

Each lane gets one paragraph, one example, and one primary action.

### Audit Builder Wizard

The Citizen Audit Kit should begin as a guided wizard:

1. What issue are you trying to understand?
2. What source can you link first?
3. What is confirmed?
4. What is still unclear?
5. Who can act?
6. What can a citizen do next?

This prevents the blank-page problem.

### Source Confidence Badges

Use badges such as:

- Confirmed
- Alleged
- Reported
- Needs source
- Open question
- Opinion
- Personal experience

Badges should be descriptive, not decorative.

### Corrections Log

Every public audit should have a visible corrections log:

```text
Changed
Why
Source
Who changed it
When
```

Corrections should increase trust, not create shame.

### One Next Civic Action

Every audit should end with one small action:

```text
Attend this meeting.
Read this source.
Submit this comment.
Verify this claim.
Share this public page.
Volunteer for this task.
```

If the page does not help someone do something, it is only a dashboard.

## Safety And Moderation Requirements

### Hard Rules

- No doxxing.
- No harassment.
- No threats.
- No private personal information.
- No unsourced accusations stated as fact.
- No instructions for illegal activity.
- No publishing sensitive personal disclosures by default.
- No pretending the platform replaces legal, medical, safety, or professional
  support.

### Product Framing

Use language like:

- Documented facts
- Public sources
- Open questions
- Civil action
- Local participation
- Privacy-preserving notes
- Corrections welcome

Avoid language like:

- Enemies list
- Expose everyone
- Destroy them
- Secret cabal
- Proof without sources
- Guaranteed justice

### Review Layer

The first public version should avoid open anonymous publishing until moderation
flows exist.

Safer v1 options:

- Local draft only
- Exportable static page
- Maintainer-reviewed submissions
- Invite-only collaborator mode
- Clear warning before publishing public claims

## Revenue And Sustainability

This must still fit the business.

Possible practical revenue paths:

- Civic project microsites for local groups
- Public issue pages for nonprofits or community campaigns
- Transparent funding pages
- Local business directories
- Public meeting/event pages
- CRM and follow-up tools for community organizers
- Website support plans for advocacy groups and small businesses

The product can be mission-aligned while still creating paying work.

Do not lead with giant platform promises. Lead with:

```text
We can help your group make a clear public page with sources, actions, and updates.
```

## Development Phases

### Phase 0: Planning Document

Deliverable:

- This document.

Goal:

- Preserve the civic operating system vision without overbuilding immediately.

### Phase 1: Static Citizen OS Landing Page

Deliverable:

- `/citizen/`

Sections:

- Learn
- Verify
- Act
- Build
- Protect

Acceptance criteria:

- Mobile-first.
- Calm and clear.
- No public submission yet.
- Links to contact `3dvr.tech@gmail.com`.
- States safety and source principles.
- Fits existing portal navigation.

### Phase 2: Citizen Audit Kit Prototype

Deliverable:

- `/citizen/audit-kit/`

Features:

- Guided issue builder.
- Add source links.
- Add facts and open questions.
- Add timeline events.
- Add action steps.
- Export JSON.
- Export static Markdown.
- Save draft through GunJS when identity is available.

Acceptance criteria:

- User can produce one useful issue page in less than 20 minutes.
- Claims are labeled by confidence.
- At least one source is encouraged before publishing/export.
- No public feed.

### Phase 3: Shared Review Workflow

Deliverable:

- Collaborative audit review.

Features:

- Claim research task.
- Submit summary.
- Add correction.
- Maintainer accepts or requests revision.
- Contribution history is visible.

Acceptance criteria:

- Multiple contributors can improve one audit without overwriting each other.
- Corrections are preserved.
- GunJS paths are documented in code.

### Phase 4: Local Action Hubs

Deliverable:

- Region pages.

Features:

- Region profile.
- Local meetings.
- Action deadlines.
- Public offices.
- Active audits.
- Community projects.

Acceptance criteria:

- One pilot region works manually.
- The page helps a user find one real local action.

### Phase 5: Transparent Funding Templates

Deliverable:

- Funding transparency page type.

Features:

- Goal.
- Raised amount.
- Controller.
- Intended use.
- Expenses.
- Receipts or source links.
- Outcome updates.

Acceptance criteria:

- No payment processing required in v1.
- Can be used for public accountability around a real project.

## Relationship To Existing Portal Apps

Potential links:

- CRM: track civic partners, local organizers, and public-interest leads.
- Tasks: convert audits into research and action tasks.
- Notes: private notes and draft summaries.
- Releases: publish what changed each week.
- Money AI: identify sustainable service offers for civic groups.
- Body Mode: keep activists and builders regulated instead of frantic.
- Intention Lab: turn concern into state, state into action, and action into
  evidence.
- Cybernetic Portal Design: treat civic work as feedback loops, not static
  content.

## First Implementation Prompt

Use this prompt when ready to build the landing page:

```text
Create a new static portal section at /citizen/.

Purpose:
Open-source civic tools for learning, verifying, organizing, and taking local
action.

Sections:
- Learn
- Verify
- Act
- Build
- Protect

Tone:
Calm, grounded, source-backed, privacy-aware, non-paranoid.

Required copy:
Power should be visible. Tools should be public. People should be able to help.

Safety:
No harassment, no doxxing, no unsourced accusations, no publishing sensitive
personal disclosures by default. This is not legal advice, emergency support, or
professional services.

CTA:
- Start a Citizen Audit
- Contact 3DVR: 3dvr.tech@gmail.com

Keep it static, mobile-first, accessible, and aligned with the existing portal
style. Do not add a backend or analytics.
```

## Open Questions

- Should the public brand be `Citizen OS`, `Civic Lab`, or something less
  governmental?
- Should the first pilot topic be business/community support rather than a
  controversial public issue?
- Who reviews public submissions before there is a moderation team?
- Which data should be public, private, or invite-only?
- How can source verification remain lightweight enough for regular people?
- What is the smallest paid offer that supports this mission?
- Should audit pages export as static HTML for easy hosting outside the portal?
- Should the first region be San Diego, a workplace/community context, or a
  general template?

## Design North Star

Build systems where regular people can:

```text
understand what is happening
verify what is true
see who can act
contribute one small task
protect vulnerable people
fund local solutions transparently
learn from corrections
coordinate without panic
```

The real product is not a page, dashboard, or database.

The real product is a civic feedback loop:

```text
concern
-> source
-> understanding
-> shared task
-> local action
-> visible result
-> correction
-> stronger trust
```

