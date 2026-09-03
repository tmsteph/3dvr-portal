# 3DVR ecosystem consolidation

Status: complete

Started: 2026-08-29

## North star

3DVR helps people build real things today, and uses that work to create open computing infrastructure everyone can own.

The ecosystem is already broad enough. The current phase is consolidation: ship what exists, make the strongest paths obvious, reduce duplicate surfaces, and turn working experiments into dependable products.

Operating rule: **Make the product excellent and accessible. Give away the core. Charge for scarce human effort, managed convenience, and higher-cost operations.**

This replaces a narrower "sell first, build second" interpretation. Early adoption, usefulness, trust, learning, and open access are valid forms of product proof even before strong revenue. Revenue still matters, but it should come primarily from work that has real marginal cost: implementation, custom builds, managed hosting, support, integrations, audiovisual production, physical goods, and other hands-on services.

### Economic boundary

- **Free/open core:** Portal, core apps, portable data, documented exports, self-hostable/open-source foundations, and useful entry-level Agent capabilities should remain broadly accessible whenever sustainable.
- **Cheap early access:** early hosted tiers may intentionally be priced below mature-market value while 3DVR learns what people use and love.
- **Paid service:** charge for founder/team time, bespoke implementation, migration, integration, consulting, design, production, deployment, and priority support.
- **Paid managed convenience:** charge when 3DVR operates infrastructure, handles ongoing administration, provides stronger service guarantees, or absorbs meaningful compute/vendor cost.
- **No artificial lock-in:** do not cripple the open product merely to manufacture upgrades. Paid tiers should save time, reduce complexity, add capacity, or provide accountable service.
- **Proof beyond revenue:** track active users, completed outcomes, repeat use, referrals, contributions, successful exports/restores, reliability, and customer willingness to recommend alongside revenue and margin.

## Product map

### Core

These are the surfaces we should make dependable, easy to explain, and easy to find.

- **3dvr.tech** — public commercial front door. Explain what 3DVR does, show proof, and convert visitors into customers or collaborators.
- **Portal** — product shell and operating environment. Lead with user intent rather than an app catalog.
- **3DVR OS** — open personal-computing product. Absorb proven ideas from experiments such as TommyOS.
- **3DVR Calendar** — independently deployable calendar experience connected back into Portal identity and workflows.
- **tmsteph.com** — public founder/builder identity, portfolio, field-work credibility, and open-source contribution proof.

### Labs

Labs can stay weird, experimental, and fast-moving. They should not compete with Core for first-time-user attention.

Examples include TommyOS, AI Systems Lab, browser-computing experiments, character/universe work, hardware concepts, meditation/Three.js experiments, and research prototypes.

A Lab graduates into Core when it has a clear user, a stable purpose, a maintained path, and evidence that people benefit from it.

### Legacy

Superseded repositories and old product directions should remain available as history but be clearly labeled and archived where appropriate.

Known cleanup candidates include:

- `3DVR-Website` → superseded by `3dvr-web`
- `3dvr-website-build`
- `3dvr-app`
- `3dvr-react-app`
- older browser/product forks that no longer represent the active path

Legacy README files should point directly to the current project so visitors never have to guess which repository is alive.

## Public experience

### 3dvr.tech

Keep the simple commercial promise: help people and small businesses actually launch.

Next improvements:

1. Add three strong case studies with screenshot, problem, what shipped, turnaround, and customer result.
2. Reconcile pricing language across homepage and supporting pages.
3. Upgrade thin supporting pages rather than adding more navigation destinations.
4. Make the funding loop explicit: paid service and managed convenience help fund open tools for everyone.
5. Surface a small amount of credible open-source proof without turning the customer homepage into a developer portfolio.

### Portal

The four user intents remain the front door:

- Find my path
- Make money
- Build something
- Open my stuff

Individual apps are implementation details. Prefer routing through Operator and intent-driven flows over introducing additional top-level apps.

Desired flow:

**intent → guided action → saved project/data → useful outcome**

A flagship example is Launch Room:

**frustration → vision → movement → tiny project → actions → launch page**

The next useful connection is:

**Movement Brief → Project → Page → People → First Customer**

## tmsteph.com

The public root should increasingly behave as a clear founder/builder portfolio rather than exposing the entire personal command center at once.

Suggested first-level story:

- **Building** — 3DVR, open computing, software and hardware
- **Open Source** — upstream contributions and contribution ledger
- **Field Work** — AV, Broadway/touring, live production, and systems experience

Keep personal tools and command-center experiments available one layer deeper.

The open-source contribution ledger is high-value proof and should be easy to reach from the first screen.

## Repository rules

1. **New capability does not automatically mean new app.** Extend an existing user flow when that is simpler.
2. **Core / Labs / Legacy must be obvious.** Names and README files should tell contributors where active work belongs.
3. **Independent deployment is earned by a real boundary.** Calendar and OS are good candidates because they have distinct product surfaces. Tiny features should not become separate services by default.
4. **Portal stays under its hosting budget.** On Vercel Hobby, keep root serverless endpoints at or below 12 until the hosting strategy changes.
5. **Proof beats breadth.** Prefer finishing, screenshots, users, repeat use, case studies, upstream merges, reliability, and healthy service economics over another unfinished surface.
6. **Do not confuse monetization with product quality.** The core product may be free or cheap; scarce labor and operational responsibility should not be.

## Immediate consolidation sprint

### P0 — ship reliably

- [x] Identify Portal production blocker: Vercel Hobby serverless-function ceiling.
- [x] Confirm Portal root currently contains 13 deployable API entry files.
- [x] Identify redundant Workboard endpoint already routed through shared `/api/session?route=workboard-github`.
- [x] Remove that redundant serverless entry while preserving self-host/test imports.
- [x] Add an automated serverless-function budget guard.
- [x] Verify a production deployment from current `main` reaches READY.

### P1 — make the ecosystem legible

- [x] Add Core / Labs / Legacy guidance to relevant public/project indexes.
- [x] Label or archive superseded 3DVR repositories and point them to active replacements.
- [x] Canonize TommyOS as a research prototype and 3DVR OS as the product path.
- [x] Reduce Portal first-screen emphasis on individual tools; keep the four intents dominant.

### P2 — increase proof and conversion

- [x] Publish three 3DVR client case studies.
- [x] Tighten supporting 3dvr.tech pages and pricing consistency.
- [x] Elevate tmsteph open-source contribution proof.
- [x] Make the commercial-to-open-source funding loop understandable in one sentence.

## Definition of done for this phase

This consolidation phase is successful when:

- `main` can deploy repeatedly without manual rescue.
- A new visitor can explain the relationship between 3dvr.tech, Portal, 3DVR OS, and tmsteph.com after one short visit.
- Portal users can start from intent without understanding the internal app catalog.
- Active repositories are clearly distinguishable from experiments and history.
- The public sites show concrete proof: people helped, things shipped, repeat use, customers served where applicable, and upstream contributions accepted.
- New work is more often finishing or connecting an existing path than creating another disconnected surface.

## Work log

### 2026-09-02

- Refined the economic strategy after roadmap review: 3DVR should optimize early for an excellent, broadly accessible open product rather than treating immediate setup-fee revenue as the sole validation gate.
- Established the free/open core + paid service/managed convenience boundary, including non-revenue product-proof metrics.

### 2026-08-29

- Completed ecosystem audit across the main site, Portal, tmsteph, active repositories, and Vercel projects.
- Confirmed the latest failed Portal production deployment exceeded the Hobby limit of 12 serverless functions.
- Found 13 root API entry files in current source.
- Found `/api/workboard/github` already rewritten to the shared session handler, making its standalone API file redundant for Vercel deployment.
- Reduced Portal API entry files from 13 to 12 by removing the redundant Workboard deployment wrapper while keeping the shared implementation intact.
- Added a deployment-budget regression test so future API growth fails locally/CI before it breaks production.
- Verified the merged `main` deployment reached READY with 12 Node.js functions, and `https://portal.3dvr.tech/` returned HTTP 200.
- Started P1 consolidation by defining 3DVR OS as the maintained Core product and TommyOS / Daedalos as Labs research lineage; future user-facing OS work should default to 3DVR OS while experimental ideas can graduate into it.
- Made the Core / Labs / Legacy map visible in the Portal project README and the active `3dvr-web` README, so contributors can identify the maintained public paths without opening the full roadmap.
- Labeled `3DVR-Website` and `3dvr-app` as Legacy with forward pointers, and added Legacy pointers to the previously empty `3dvr-website-build` and `3dvr-react-app` repositories.
- Re-verified the Portal first screen: the four dominant action cards are Find my path, Make money, Build something, and Open my stuff; the full app catalog remains behind Search / Open my stuff rather than competing as top-level cards.
- P1 ecosystem-legibility sprint complete; next work moves to proof and conversion.
- Published and production-verified three client case studies for SC Librarian, Cruisers Garage, and San Diego Van Life. Avoided using the stale GIF Academy testimonial as flagship proof after verifying the current site credits a different designer.
- Added a direct customer-proof path from the 3dvr.tech homepage and made the commercial-to-open-source loop explicit: paid client work helps fund open tools for everyone.
- Used the controlled Vercel publish lane for the P2 batch, verified the live case-study page returned HTTP 200, then restored the deployment quota guard.
- Elevated the existing tmsteph open-source contribution ledger to the homepage hero with a direct “Open Source Proof · 3 upstream merges” path; verified the production `tmsteph.com/index.js` serves it.
- Reconciled public pricing language so 3DVR clearly starts free, $5 is light support, direct launch help starts at $20, $50 is business support, $200 is team operations, and custom work remains available; verified the production homepage, plans page, and launch metadata.
- Restored the 3dvr-web Vercel quota guard after the final controlled publish. P2 is complete, closing the ecosystem consolidation phase.
