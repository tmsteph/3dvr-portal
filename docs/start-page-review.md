# Start Page Review And Fix Plan

Reviewed live production page on June 6, 2026:

- `https://portal.3dvr.tech/start/`

Reviewed source files:

- `start/index.html`
- `start/style.css`
- `start/router.js`
- `tests/customer-journey-pages.test.js`
- `tests/start-router.test.js`

## Short Version

The start page has the right structural goal: one place for free users, paid users, and existing billing customers to
enter the portal without losing the account/billing connection.

The problem is tone and density. The page reads like an internal routing memo turned into a public page. It explains
why the page exists more than it helps a visitor feel confident about their next step.

The best fix is not a total rewrite. Keep the three-path idea, but make the first screen more customer-facing, shorter,
and more concrete.

## What Is Working

- The page has a clear functional purpose: free, paid, and existing billing each have a route.
- The hero offers useful first actions: start free, choose paid, manage existing billing.
- The account-first paid flow is a good safety rule for Stripe and plan switching.
- The three-question router can be useful if it feels light and optional.
- The route implementation in `start/router.js` is simple and testable.
- The page already has focused tests covering the start page and router.

## Main Problems

### 1. The Copy Talks To Us More Than The Customer

The hero panel says:

> The job of this page is simple...

That is our product strategy note, not customer-facing copy. Similar phrases appear throughout the page:

- `Keep the journey obvious`
- `Do not make every customer start on the same screen.`
- `avoid sending existing customers back through acquisition copy`
- `Free, paid, and existing billing each get their own first step`

These are good implementation principles, but they make the page feel like an internal flowchart.

### 2. The First Screen Has Too Many Competing Paths

The first screen contains:

- free CTA
- paid-lane CTA
- existing billing CTA
- sign-in CTA
- billing CTA
- three status pills
- a multi-step explanation panel

That is a lot before the visitor has context. The page should quickly answer:

- I am new and curious.
- I want help with a project.
- I already pay and need billing.

### 3. The Page Feels More Like Billing Triage Than Project Start

The page is linked from the marketing homepage as `Start a project`, but the live page focuses heavily on account and
billing mechanics. That mismatch may feel jarring.

If someone clicks `Start a project`, the page should first ask what they are trying to start, then route them into free,
paid, or billing.

### 4. Paid Lanes Are Listed Too Early And Too Evenly

The paid lane section gives $5, $20, $50, and $200 equal weight. That preserves options, but it does not guide a business
visitor.

The broader site critique recommends making Builder the default business lane. The start page should match that:

- Free: get organized first
- $50 Builder: default for active business/project help
- $20 Founder: lighter launch help
- $200 Embedded: teams or reserved capacity
- $5 Family & Friends: supporter/light-help lane, visually secondary

### 5. The Router Questions Feel Personal But Not Business-Oriented Enough

Current router questions:

- What hurts most right now?
- What do you want next?
- How much help do you want?

This can work for a personal portal, but for the marketing CTA `Start a project`, the router should be more project
oriented:

- What are you trying to start?
- What stage is it in?
- How much help do you want?

### 6. There Is Some Duplicate Ending Content

The page repeats free, existing billing, and after-checkout guidance after already covering paths and paid lanes. Some
of that should become a shorter footer/action band.

### 7. Tests Currently Preserve The Old Framing

`tests/customer-journey-pages.test.js` currently asserts copy such as:

- `One account. One path. One next move.`
- `3 clear paths`
- `Open Daily Direction`
- `After billing, start the work cleanly`

Those tests should be updated to preserve the new customer-facing intent, not the current internal routing language.

## Recommended New Page Shape

### Hero

Goal: make the page match `Start a project`.

Suggested frame:

```text
Start your next 3dvr project

Tell us where you are: just getting organized, ready for direct help, or already managing a subscription.
```

Primary actions:

- `Start free`
- `Get direct help`
- `Manage billing`

Keep the three route idea, but remove internal explanation language from the hero.

### Three Path Cards

Use customer language:

1. `I am getting organized`
   - No card required
   - Create one portal account
   - Get one next step

2. `I want help launching something`
   - Choose direct support
   - Sign in once
   - Continue to the right plan

3. `I already pay for 3dvr`
   - Manage payment method
   - Switch or cancel safely
   - Open billing history

### Paid Lane Section

Make Builder the recommended business lane:

- Builder $50: `Recommended for active projects`
- Founder $20: `Good for lighter launch help`
- Embedded $200: `Reserved team support`
- Family & Friends $5: `Supporter/light support`

### Router

Replace the current questions with project-oriented prompts:

1. What are you trying to start?
   - website or landing page
   - offer/business system
   - personal portal/reset

2. What stage is it in?
   - just an idea
   - partly built
   - already live but messy

3. How much help do you want?
   - free guidance
   - light paid help
   - direct build/support

Router outcomes:

- Free: for personal reset or unclear idea
- Founder: for lighter launch support
- Builder: for active website, offer, or business system
- Embedded: keep out of router unless team/support capacity is selected later

### Bottom Action Band

Keep only three final actions:

- `Start free`
- `Choose Builder`
- `Open billing`

Move extra app links like Projects, Contacts, Messenger, and Finance to the after-login destination instead of the public
start page.

## Piece-By-Piece Fix Plan

### 1. Rewrite The Hero

Change the hero from account/billing language to project-start language.

Verify:

- The hero contains `Start your next 3dvr project` or equivalent.
- The hero does not contain `The job of this page is simple`.
- The first screen has only three primary paths: free, direct help, billing.

### 2. Replace Internal Strategy Copy

Remove customer-facing phrases that sound like product notes.

Verify:

- No visible page copy says `Do not make every customer start on the same screen`.
- No visible page copy says `avoid sending existing customers back through acquisition copy`.
- The path cards use `I am...` or similarly customer-centered labels.

### 3. Reorder And Reweight Paid Lanes

Make Builder the default business recommendation while keeping the other lanes available.

Verify:

- Builder appears first or is visually recommended.
- Family & Friends is not presented as the first obvious paid business step.
- Copy aligns with the public site's plan hierarchy.

### 4. Rework The Router Questions

Make the router about the visitor's project stage, not only emotional state.

Verify:

- Router asks what the visitor is trying to start.
- Router can recommend Builder for active business/project help.
- `tests/start-router.test.js` covers the new route keys and recommendations.

### 5. Reduce The Bottom Sections

Collapse repeated free/existing/after-checkout panels into a shorter final action band.

Verify:

- The page does not repeat the same free and billing explanations multiple times.
- Public start page does not send users to many internal apps before sign-in.

### 6. Update Tests To Protect The New Intent

Update `tests/customer-journey-pages.test.js` so it protects the customer-facing start flow instead of the current
internal language.

Verify:

- `node --test tests/customer-journey-pages.test.js tests/start-router.test.js`
- Full portal smoke/Playwright checks on PR.

## Open Questions

- Should the marketing homepage CTA `Start a project` route directly to a project-intake form instead of this router?
- Should Free users land in Daily Direction, a dashboard, or a lightweight project intake?
- Should Builder become the first paid CTA everywhere, with Founder as a secondary lane?
- Should the $5 Family & Friends lane stay public on this page or move to a supporter/friends context?

