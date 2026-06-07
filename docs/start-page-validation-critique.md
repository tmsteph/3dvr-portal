# 3DVR Start Page Validation Critique

Created June 7, 2026.

Reviewed source:

- `start/index.html`
- `start/router.js`
- `start/style.css`
- `docs/problem-validation.md`

## Short Version

The latest start page is better than the previous version because the hero now starts from a project-oriented frame:

> Start your next 3dvr project.

That is closer to what the public site promises. But the page still has a core validation problem: it tries to route people into the 3DVR ecosystem before we have validated which problem they actually care about.

The page currently mixes:

- free personal organization
- paid project help
- existing billing management
- community/light support
- daily direction
- project tools
- contacts, messenger, and finance

Those are real 3DVR capabilities, but they make the start page feel like a portal map rather than a sharp offer.

## What Is Working

- The hero now sounds public-facing instead of like an internal routing memo.
- The three main actions are understandable:
  - Start free
  - Get direct help
  - Manage billing
- Existing customers have a direct billing route.
- Paid checkout still stays attached to sign-in, which protects Stripe/account continuity.
- The router is simple and testable.
- The page avoids forcing every visitor into a single path.

## Main Issue

The page still assumes the answer is "choose a 3DVR path" before proving that the visitor recognizes the problem.

For a new visitor, the first question is probably not:

> Which portal lane do I belong in?

It is closer to:

> Can 3DVR help me get my thing unstuck?

The start page should make the problem feel concrete before it asks the visitor to understand free, paid, billing, portal accounts, daily direction, support lanes, and internal apps.

## Problem 1: The Offer Is Still Too Broad

Current visible paths include:

- getting organized
- launching something
- managing billing
- daily direction
- paid plans
- community support
- projects
- contacts
- messenger
- finance

This is too much for an unvalidated public offer. It may be accurate to the portal, but it does not force a decision about what problem 3DVR is solving first.

Recommended direction:

- Make the primary offer: direct AI-enabled project help.
- Make the portal the workspace behind the help.
- Keep free and billing paths available but visually secondary.

## Problem 2: The Router Still Asks Personal-State Questions

Current router questions:

- What hurts most right now?
- What do you want next?
- How much help do you want?

These can work for a personal portal, but they do not validate the public "Start a project" promise. A visitor with a business or project likely expects questions about the thing they want to build.

Better router questions:

1. What are you trying to start?
   - website or landing page
   - offer, store, or checkout
   - workflow, CRM, or automation
   - personal reset / operating system

2. What state is it in?
   - just an idea
   - partly built
   - already live but messy
   - blocked and needs rescue

3. What kind of help do you want?
   - show me the next step
   - help me build it
   - help me clean up what exists
   - help me operate it monthly

This would generate more useful validation data and better match the page headline.

## Problem 3: Paid Lanes Are Still Plan-First

The paid lane section asks the visitor to understand $5, $20, $50, and $200 plans before the problem has been sharpened.

That may work for existing customers, but new visitors likely need outcome labels first.

Better framing:

- "I need a quick page or cleanup" -> Founder / $20
- "I need direct build help for an active project" -> Builder / $50
- "I need ongoing team support" -> Embedded / $200
- "I just want to support or stay connected" -> Family & Friends / $5

The Builder lane should probably become the default business/project recommendation unless validation says otherwise.

## Problem 4: The Bottom Sections Send Users Into Too Many Internal Apps

The page currently links to internal destinations like:

- Daily Direction
- Projects
- Contacts
- Messenger
- Finance
- Browse apps

These may be useful after sign-in, but on the public start page they weaken the offer. They make the visitor think the next step is exploring tools, not solving a project problem.

Recommended direction:

- Collapse the bottom into three final actions:
  - Start free
  - Get Builder help
  - Open billing
- Move app exploration after account creation or into the portal home.

## Problem 5: We Are Not Collecting Validation Signal Here

The start page routes people, but it does not capture much evidence about what people need.

If we are serious about validation, the page should eventually capture:

- what the visitor is trying to build
- what state it is in
- what blocked them
- whether they want done-with-you help, done-for-you help, or tools
- what price band feels reasonable
- whether they want a follow-up

This does not need to be a heavy form. It could be a tiny "Tell us what you are starting" box before or after the router.

## Suggested Small Fix Sequence

### Step 1: Rewrite Path Cards Around Visitor Problems

Keep three cards, but rename them:

- "I need to get organized"
- "I need help building something"
- "I already pay for 3DVR"

Remove remaining copy that explains routing mechanics more than user outcomes.

Validation check:

- A visitor can identify themselves without understanding the portal.

### Step 2: Make Builder The Default Project Lane

Reorder paid lanes:

1. Builder
2. Founder
3. Embedded
4. Family & Friends

Make Builder visually recommended for active projects.

Validation check:

- Business/project visitors see one obvious paid path.

### Step 3: Rework The Router Into Project Questions

Replace emotional/personal-state questions with project-state questions.

Validation check:

- Router recommendations teach us what kind of project the visitor has.
- Tests cover Builder for active website/workflow/business needs.

### Step 4: Reduce Bottom App Links

Replace the internal app grid with a shorter final action band.

Validation check:

- Public start page no longer sends new visitors into many internal apps before they understand the offer.

### Step 5: Add A Lightweight Lead Capture Prompt

Add one optional field:

> What are you trying to start?

Potential actions:

- Save locally for now.
- Later: send to CRM/Gun/contact workflow.
- Later: connect to email or support flow.

Validation check:

- We start collecting real language from visitors instead of only routing clicks.

## Copy Direction

Prefer:

- "Tell us what you are trying to build."
- "Get a working first version."
- "Clean up a stuck project."
- "Use 3DVR as the workspace for the help."
- "Start free if you only need direction."
- "Choose Builder if you want direct help shipping."

Avoid:

- "portal identity"
- "customer journey"
- "routing"
- "plan education"
- "entry path"
- "workspace first" before the value is clear

## Validation Lens For Future Edits

Before editing the start page, ask:

1. Does this make the customer problem sharper?
2. Does this help us learn what visitors actually need?
3. Does this reduce or increase the number of choices?
4. Does this explain outcomes before internal tools?
5. Does this support the direct project-help hypothesis?

If not, defer it.
